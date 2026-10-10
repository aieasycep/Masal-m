import { HttpStatus } from '@nestjs/common';
import { ErrorCode, StoryStatus } from '@masalim/types';
import type { ContentModerator } from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JobsService } from '../../jobs/jobs.service';
import type { EntitlementService } from '../subscription/entitlement.service';
import type { ChildrenService } from '../children/children.service';
import { StoriesService } from './stories.service';

interface PageRow {
  id: string;
  storyId: string;
  pageNumber: number;
  text: string;
  illustrationKey: string | null;
}

interface RevisionRow {
  storyId: string;
  version: number;
  title: string;
  storyText: string | null;
  pages: Array<{ pageNumber: number; text: string }>;
}

/**
 * In-memory Prisma fake: one story with two pages; `$transaction` hands the
 * same fake back as `tx` so writes inside it are observable.
 */
function buildService(
  options: {
    status?: StoryStatus;
    childId?: string | null;
    child?: { name: string; interests: string[] } | null;
    customPrompt?: string | null;
    educationalGoal?: string | null;
    moderationSafe?: boolean;
  } = {},
) {
  const story = {
    id: 's1',
    userId: 'u1',
    childId: options.childId ?? null,
    title: 'Eski Başlık',
    summary: null as string | null,
    storyText: 'Bir varmış.\n\nBir yokmuş.',
    version: 1,
    status: options.status ?? StoryStatus.READY,
    moderationStatus: 'APPROVED',
    language: 'tr',
    heroName: 'Kaptan',
    heroType: 'CHILD',
    themes: ['SPACE'],
    ageRange: 'AGE_3_5',
    durationTarget: 'SHORT',
    customPrompt: options.customPrompt ?? null,
    educationalGoal: options.educationalGoal ?? null,
    advanced: {},
    coverImageKey: null as string | null,
    deletedAt: null as Date | null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };
  const pages: PageRow[] = [
    { id: 'p1', storyId: 's1', pageNumber: 1, text: 'Bir varmış.', illustrationKey: null },
    { id: 'p2', storyId: 's1', pageNumber: 2, text: 'Bir yokmuş.', illustrationKey: null },
  ];
  const revisions: RevisionRow[] = [];
  const withRelations = () => ({ ...story, child: null, favorites: [], narrations: [], books: [] });

  const tx = {
    story: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === story.id ? withRelations() : null,
      ),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            title?: string;
            storyText?: string;
            version?: { increment: number };
            status?: StoryStatus;
            moderationStatus?: string;
          };
        }) => {
          if (data.title != null) story.title = data.title;
          if (data.storyText != null) story.storyText = data.storyText;
          if (data.version != null) story.version += data.version.increment;
          if (data.status != null) story.status = data.status;
          if (data.moderationStatus != null) story.moderationStatus = data.moderationStatus;
          return withRelations();
        },
      ),
      // Compare-and-set used by generate(): only the expected status wins.
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; status?: StoryStatus | { in: StoryStatus[] } };
          data: { status?: StoryStatus; moderationStatus?: string };
        }) => {
          const allowed =
            where.status == null
              ? true
              : typeof where.status === 'string'
                ? where.status === story.status
                : where.status.in.includes(story.status);
          if (where.id !== story.id || !allowed) return { count: 0 };
          if (data.status != null) story.status = data.status;
          if (data.moderationStatus != null) story.moderationStatus = data.moderationStatus;
          return { count: 1 };
        },
      ),
    },
    storyPage: {
      findMany: jest.fn(async () => pages.map((page) => ({ ...page }))),
      updateMany: jest.fn(
        async ({ where, data }: { where: { pageNumber: number }; data: { text: string } }) => {
          const page = pages.find((candidate) => candidate.pageNumber === where.pageNumber);
          if (page) page.text = data.text;
          return { count: page ? 1 : 0 };
        },
      ),
    },
    storyRevision: {
      create: jest.fn(async ({ data }: { data: RevisionRow }) => {
        revisions.push(data);
        return data;
      }),
    },
    playbackPosition: { findUnique: jest.fn(async () => null) },
    child: { findUnique: jest.fn(async () => options.child ?? null) },
    aIJob: { findFirst: jest.fn(async () => null) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaService;

  const moderator: ContentModerator = {
    name: 'fake',
    checkStoryIdea: jest.fn(async () => ({ safe: true })),
    checkStoryText: jest.fn(async () =>
      options.moderationSafe === false ? { safe: false, category: 'violence' } : { safe: true },
    ),
  };
  const jobs = { enqueue: jest.fn(async () => ({ id: 'job-1' })) } as unknown as JobsService;
  const entitlements = {
    consumeCredits: jest.fn(async () => undefined),
    refundCreditsForRef: jest.fn(async () => undefined),
  } as unknown as EntitlementService;
  const children = { findOwned: jest.fn() } as unknown as ChildrenService;
  const storage = {
    getSignedUrl: jest.fn(async (key: string) => `signed:${key}`),
  } as unknown as StorageProvider;

  const service = new StoriesService(prisma, jobs, entitlements, children, storage, moderator);
  return { service, story, pages, revisions, tx, prisma, moderator, entitlements, jobs };
}

describe('StoriesService.update', () => {
  it('title-only edit renames in place: no version bump, no revision', async () => {
    const { service, story, revisions, prisma, moderator } = buildService();

    const detail = await service.update('u1', 's1', { title: 'Yeni Başlık' });

    expect(detail.title).toBe('Yeni Başlık');
    expect(detail.version).toBe(1);
    expect(story.version).toBe(1);
    expect(revisions).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // The new title is still user text, so it passes the safety gate alone.
    expect(moderator.checkStoryText).toHaveBeenCalledTimes(1);
    expect(moderator.checkStoryText).toHaveBeenCalledWith('Yeni Başlık', 'tr');
  });

  it('skips moderation and every write when nothing textual changed', async () => {
    const { service, story, tx, moderator, prisma } = buildService();

    const detail = await service.update('u1', 's1', {
      title: 'Eski Başlık',
      pages: [{ pageNumber: 1, text: 'Bir varmış.' }],
    });

    expect(detail.version).toBe(1);
    expect(story.title).toBe('Eski Başlık');
    expect(moderator.checkStoryText).not.toHaveBeenCalled();
    expect(tx.story.update).not.toHaveBeenCalled();
    expect(tx.storyPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('moderates a page edit first and writes nothing when it is rejected', async () => {
    const { service, story, pages, revisions, tx, moderator } = buildService({
      moderationSafe: false,
    });

    const attempt = service.update('u1', 's1', {
      title: 'Kötü Başlık',
      pages: [{ pageNumber: 2, text: 'Kavga etti.' }],
    });

    await expect(attempt).rejects.toMatchObject({
      code: ErrorCode.MODERATION_REJECTED,
      details: { category: 'violence' },
    });
    await expect(attempt).rejects.toBeInstanceOf(AppException);
    await attempt.catch((error: AppException) =>
      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY),
    );
    // Only the changed page text + the new title are sent, joined as a document.
    expect(moderator.checkStoryText).toHaveBeenCalledWith('Kavga etti.\n\nKötü Başlık', 'tr');
    expect(story.version).toBe(1);
    expect(story.title).toBe('Eski Başlık');
    expect(pages[1]!.text).toBe('Bir yokmuş.');
    expect(revisions).toHaveLength(0);
    expect(tx.story.update).not.toHaveBeenCalled();
  });

  it('accepted page edit archives the previous state and bumps the version', async () => {
    const { service, story, pages, revisions, moderator } = buildService();

    const detail = await service.update('u1', 's1', {
      pages: [
        { pageNumber: 1, text: 'Bir varmış.' },
        { pageNumber: 2, text: 'Sonra uyudu.' },
      ],
    });

    expect(moderator.checkStoryText).toHaveBeenCalledWith('Sonra uyudu.', 'tr');
    expect(detail.version).toBe(2);
    expect(story.version).toBe(2);
    expect(story.title).toBe('Eski Başlık');
    expect(story.storyText).toBe('Bir varmış.\n\nSonra uyudu.');
    expect(pages[1]!.text).toBe('Sonra uyudu.');
    expect(revisions).toEqual([
      {
        storyId: 's1',
        version: 1,
        title: 'Eski Başlık',
        storyText: 'Bir varmış.\n\nBir yokmuş.',
        pages: [
          { pageNumber: 1, text: 'Bir varmış.' },
          { pageNumber: 2, text: 'Bir yokmuş.' },
        ],
      },
    ]);
  });

  it('refuses edits on stories that are not READY', async () => {
    const { service } = buildService({ status: StoryStatus.DRAFT });
    await expect(service.update('u1', 's1', { title: 'X' })).rejects.toMatchObject({
      code: ErrorCode.STORY_NOT_READY,
    });
  });
});

describe('StoriesService.generate idea pre-check', () => {
  it("includes the hero name and the child's name + interests with the parent idea", async () => {
    const { service, moderator } = buildService({
      status: StoryStatus.DRAFT,
      childId: 'c1',
      child: { name: 'Ege', interests: ['uzay', 'dinozorlar'] },
      customPrompt: 'Uzaya gitsin',
      educationalGoal: 'paylaşmak',
    });

    await service.generate('u1', 's1');

    expect(moderator.checkStoryIdea).toHaveBeenCalledWith(
      'Uzaya gitsin — paylaşmak — Kaptan — Ege — uzay, dinozorlar',
      'tr',
    );
  });

  it('still checks the hero name when no idea or child is attached', async () => {
    const { service, moderator } = buildService({ status: StoryStatus.DRAFT });

    await service.generate('u1', 's1');

    expect(moderator.checkStoryIdea).toHaveBeenCalledWith('Kaptan', 'tr');
  });

  it('charges credits only once when the same draft is generated twice', async () => {
    const { service, entitlements, prisma } = buildService({ status: StoryStatus.DRAFT });

    const first = await service.generate('u1', 's1');
    // The second call finds the story already claimed and the job still live.
    (prisma.aIJob.findFirst as jest.Mock).mockResolvedValueOnce({ id: first.jobId });
    const second = await service.generate('u1', 's1');

    expect(second.jobId).toBe(first.jobId);
    expect(entitlements.consumeCredits).toHaveBeenCalledTimes(1);
  });
});
