import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import type Redis from 'ioredis';
import {
  MockImageProvider,
  MockStoryProvider,
  MockTtsProvider,
  type ContentModerator,
  type ImageGenerationProvider,
  type ModerationVerdict,
  type StoryGenerationProvider,
  type TextToSpeechProvider,
} from '@masalim/ai';
import type { StorageProvider } from '@masalim/storage';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ENV } from '../../src/config/config.module';
import type { Env } from '../../src/config/env';
import { REDIS } from '../../src/redis/redis.module';
import { IMAGE_AI, MODERATOR, STORAGE, STORY_AI, TTS } from '../../src/providers/providers.module';
import {
  MaintenanceProcessor,
  PUSH_TICKETS_KEY,
} from '../../src/modules/maintenance/maintenance.processor';
import { createApp, V, type Session, type TestApp } from './helpers';

jest.setTimeout(180_000);

// ── Provider fakes: the real mocks, wrapped with call counting and one
//    injectable failure, so the job retry paths run against real BullMQ. ────

const storyMock = new MockStoryProvider({ delayMs: 10 });
const storyAi = {
  name: 'mock',
  calls: 0,
  async generateStory(input: Parameters<StoryGenerationProvider['generateStory']>[0]) {
    storyAi.calls += 1;
    return storyMock.generateStory(input);
  },
} satisfies StoryGenerationProvider & { calls: number };

const moderator = {
  name: 'mock',
  /** Number of `checkStoryText` calls that still throw (transient outage). */
  failuresLeft: 0,
  textCalls: 0,
  async checkStoryIdea(): Promise<ModerationVerdict> {
    return { safe: true };
  },
  async checkStoryText(): Promise<ModerationVerdict> {
    moderator.textCalls += 1;
    if (moderator.failuresLeft > 0) {
      moderator.failuresLeft -= 1;
      throw new Error('moderation service unavailable');
    }
    return { safe: true };
  },
} satisfies ContentModerator & { failuresLeft: number; textCalls: number };

const ttsMock = new MockTtsProvider();
const tts = {
  name: 'mock',
  calls: 0,
  /** The 1-based call that throws (once); -1 = never. */
  failAtCall: -1,
  async generateSpeech(input: Parameters<TextToSpeechProvider['generateSpeech']>[0]) {
    tts.calls += 1;
    if (tts.calls === tts.failAtCall) throw new Error('tts hiccup');
    return ttsMock.generateSpeech(input);
  },
} satisfies TextToSpeechProvider & { calls: number; failAtCall: number };

const imageMock = new MockImageProvider({ delayMs: 20 });
const imageAi = {
  name: 'mock',
  calls: 0,
  failAtCall: -1,
  async generateImage(input: Parameters<ImageGenerationProvider['generateImage']>[0]) {
    imageAi.calls += 1;
    if (imageAi.calls === imageAi.failAtCall) throw new Error('image hiccup');
    return imageMock.generateImage(input);
  },
} satisfies ImageGenerationProvider & { calls: number; failAtCall: number };

/**
 * Job-pipeline journeys (hardening Track C): persisted generation reuse,
 * narration chunk cache, illustration render idempotency and the maintenance
 * sweeps — against the real module graph with inline workers and BullMQ
 * retries (3 attempts, 3s exponential backoff).
 */
describe('job pipelines (integration)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let http: () => request.Agent;
  let register: (tag: string) => Promise<Session>;
  let waitForJob: (session: Session, jobId: string) => Promise<string>;
  let prisma: PrismaService;

  beforeAll(async () => {
    testApp = await createApp((builder) =>
      builder
        .overrideProvider(STORY_AI)
        .useValue(storyAi)
        .overrideProvider(MODERATOR)
        .useValue(moderator)
        .overrideProvider(TTS)
        .useValue(tts)
        .overrideProvider(IMAGE_AI)
        .useValue(imageAi),
    );
    ({ app, http, register, waitForJob } = testApp);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    storyAi.calls = 0;
    moderator.failuresLeft = 0;
    moderator.textCalls = 0;
    tts.calls = 0;
    tts.failAtCall = -1;
    imageAi.calls = 0;
    imageAi.failAtCall = -1;
  });

  const auth = (session: Session) => ['Authorization', `Bearer ${session.token}`] as const;

  const createShortStory = async (session: Session, heroName: string): Promise<string> => {
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set(...auth(session))
      .send({
        childId: null,
        heroName,
        heroType: 'CHILD',
        themes: ['ADVENTURE'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advanced: {},
        language: 'tr',
      })
      .expect(201);
    return draft.body.id as string;
  };

  const generate = async (session: Session, storyId: string): Promise<string> => {
    const gen = await http()
      .post(`/stories/${storyId}/generate`)
      .set(...V)
      .set(...auth(session))
      .expect(201);
    return gen.body.jobId as string;
  };

  it('story retry reuses the persisted generation instead of calling the model again', async () => {
    const session = await register('jobs-story');
    const storyId = await createShortStory(session, 'Luna');
    // moderateWithRetry makes 3 calls per attempt: 4 failures exhaust attempt 1
    // (forcing a real BullMQ retry) and the 5th call, in attempt 2, passes.
    moderator.failuresLeft = 4;

    const jobId = await generate(session, storyId);
    expect(await waitForJob(session, jobId)).toBe('SUCCEEDED');

    expect(storyAi.calls).toBe(1);
    expect(moderator.textCalls).toBe(5);
    const job = await prisma.aIJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.attempts).toBe(2);
    expect((job.result as { story?: { pages?: unknown[] } }).story?.pages?.length).toBe(6);

    const detail = await http()
      .get(`/stories/${storyId}`)
      .set(...V)
      .set(...auth(session))
      .expect(200);
    expect(detail.body.status).toBe('READY');
    expect(detail.body.pages.map((page: { pageNumber: number }) => page.pageNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);

    // One paid model call, one failed + one successful moderation pass.
    const usage = await prisma.aIUsageLog.findMany({ where: { jobId } });
    expect(usage.filter((row) => row.type === 'STORY_GENERATION')).toHaveLength(1);
    expect(usage.filter((row) => row.type === 'MODERATION').map((row) => row.success)).toEqual(
      expect.arrayContaining([false, true]),
    );
  });

  it('narration retry reuses cached chunks and clears the cache once READY', async () => {
    const session = await register('jobs-narration');
    const storyId = await createShortStory(session, 'Derin');
    expect(await waitForJob(session, await generate(session, storyId))).toBe('SUCCEEDED');
    const detail = await http()
      .get(`/stories/${storyId}`)
      .set(...V)
      .set(...auth(session))
      .expect(200);
    const chunkCount = detail.body.pages.length as number; // every mock page < 2500 chars
    expect(chunkCount).toBe(6);

    const voices = await http()
      .get('/voices/system')
      .set(...V)
      .set(...auth(session))
      .expect(200);
    const voice = (voices.body as Array<{ id: string; premiumOnly: boolean }>).find(
      (item) => !item.premiumOnly,
    );
    expect(voice).toBeDefined();

    // Third chunk fails once → attempt 1 leaves two chunks in the cache.
    tts.failAtCall = 3;
    const created = await http()
      .post(`/stories/${storyId}/narrations`)
      .set(...V)
      .set(...auth(session))
      .send({ systemVoiceId: voice!.id })
      .expect(201);
    expect(await waitForJob(session, created.body.jobId)).toBe('SUCCEEDED');

    // chunks + the one failed call: the retry synthesized only the missing four.
    expect(tts.calls).toBe(chunkCount + 1);

    const storage = app.get<StorageProvider>(STORAGE);
    const leftovers: string[] = [];
    for await (const entry of storage.listObjects(
      `users/${session.userId}/stories/${storyId}/narration-cache/`,
    )) {
      leftovers.push(entry.key);
    }
    expect(leftovers).toEqual([]);

    const narration = await prisma.narration.findUniqueOrThrow({
      where: { id: created.body.narration.id },
    });
    expect(narration.status).toBe('READY');
    expect(narration.audioKey).not.toBeNull();

    const usage = await prisma.aIUsageLog.findMany({
      where: { jobId: created.body.jobId, type: 'NARRATION_GENERATION' },
      orderBy: { createdAt: 'asc' },
    });
    expect(usage.map((row) => [row.success, row.units])).toEqual([
      [false, 2],
      [true, 4],
    ]);
  });

  it('illustration retry never leaves pending rows and renders each target exactly once', async () => {
    const session = await register('jobs-illustration');
    const storyId = await createShortStory(session, 'Ada');
    expect(await waitForJob(session, await generate(session, storyId))).toBe('SUCCEEDED');
    const pageCount = await prisma.storyPage.count({ where: { storyId } });

    // sheet (1) + cover (2) succeed, page 1 (3) fails once → BullMQ retry.
    imageAi.failAtCall = 3;
    const created = await http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...V)
      .set(...auth(session))
      .send({ style: 'WATERCOLOR' })
      .expect(201);
    const setId = created.body.set.id as string;

    // Watch the table while the job runs: a row must never exist without an image.
    let pendingSeen = 0;
    let watching = true;
    const watcher = (async () => {
      while (watching) {
        pendingSeen += await prisma.illustration.count({
          where: { illustrationSetId: setId, imageKey: 'pending' },
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })();
    const status = await waitForJob(session, created.body.jobId);
    watching = false;
    await watcher;
    expect(status).toBe('SUCCEEDED');
    expect(pendingSeen).toBe(0);

    const set = await prisma.illustrationSet.findUniqueOrThrow({
      where: { id: setId },
      include: { illustrations: true },
    });
    expect(set.status).toBe('READY');
    expect(set.characterReference).not.toBeNull();
    expect(set.illustrations).toHaveLength(pageCount + 1);
    const targets = set.illustrations.map((row) => row.storyPageId ?? 'cover');
    expect(new Set(targets).size).toBe(pageCount + 1);
    expect(set.illustrations.every((row) => row.imageKey !== 'pending' && row.selected)).toBe(true);
    // sheet + cover + failed page + (pages re-rendered after the retry); the
    // persisted character reference and the existing cover were not redone.
    expect(imageAi.calls).toBe(2 + 1 + pageCount);

    const storage = app.get<StorageProvider>(STORAGE);
    for (const row of set.illustrations) {
      expect(await storage.exists(row.imageKey)).toBe(true);
    }
    const listed = await http()
      .get(`/stories/${storyId}/illustrations`)
      .set(...V)
      .set(...auth(session))
      .expect(200);
    expect(listed.body[0].progress).toEqual({ completed: pageCount + 1, total: pageCount + 1 });

    const usage = await prisma.aIUsageLog.findMany({
      where: { jobId: created.body.jobId, type: 'ILLUSTRATION_GENERATION' },
      orderBy: { createdAt: 'asc' },
    });
    expect(usage.map((row) => [row.success, row.units])).toEqual([
      [false, 2],
      [true, pageCount],
    ]);
  });

  it('daily maintenance deletes aged orphan uploads and keeps referenced or fresh ones', async () => {
    const session = await register('jobs-maintenance');
    const storage = app.get<StorageProvider>(STORAGE);
    const env = app.get<Env>(ENV);
    const root = path.resolve(env.STORAGE_LOCAL_DIR);
    const backdate = async (key: string, ageMs: number) => {
      const when = new Date(Date.now() - ageMs);
      await fs.utimes(path.join(root, key), when, when);
    };
    const DAY = 24 * 60 * 60 * 1000;
    const prefix = `users/${session.userId}`;
    const orphanAvatar = `${prefix}/avatars/orphan.jpg`;
    const keptAvatar = `${prefix}/avatars/keep.jpg`;
    const freshAvatar = `${prefix}/avatars/fresh.jpg`;
    const orphanRecording = `${prefix}/voice-recordings/old.m4a`;
    const staleCache = `${prefix}/stories/story-x/narration-cache/abcdef123456/0-0123456789abcdef`;
    const recentCache = `${prefix}/stories/story-x/narration-cache/abcdef123456/1-0123456789abcdef`;
    for (const key of [
      orphanAvatar,
      keptAvatar,
      freshAvatar,
      orphanRecording,
      staleCache,
      recentCache,
    ]) {
      await storage.putObject(key, Buffer.from('x'), 'application/octet-stream');
    }
    await backdate(orphanAvatar, 2 * DAY);
    await backdate(keptAvatar, 2 * DAY);
    await backdate(orphanRecording, 2 * DAY);
    await backdate(staleCache, 8 * DAY);
    await backdate(recentCache, 2 * DAY); // inside the 7-day cache retention

    await http()
      .patch('/users/me')
      .set(...V)
      .set(...auth(session))
      .send({ avatarObjectKey: keptAvatar })
      .expect(200);

    const summary = await app.get(MaintenanceProcessor).runDaily();
    expect(summary.uploads.deleted).toBeGreaterThanOrEqual(3);
    expect(summary.uploads.failed).toBe(0);

    expect(await storage.exists(orphanAvatar)).toBe(false);
    expect(await storage.exists(orphanRecording)).toBe(false);
    expect(await storage.exists(staleCache)).toBe(false);
    expect(await storage.exists(keptAvatar)).toBe(true); // referenced by User.avatarKey
    expect(await storage.exists(freshAvatar)).toBe(true); // inside the 24h grace
    expect(await storage.exists(recentCache)).toBe(true);
  });

  it('hourly maintenance prunes expired auth rows and reconciles due push tickets', async () => {
    const session = await register('jobs-maintenance-hourly');
    const redis = app.get<Redis>(REDIS);
    const DAY = 24 * 60 * 60 * 1000;
    const tag = `${session.userId}-${Date.now()}`;
    await prisma.refreshToken.create({
      data: {
        userId: session.userId,
        tokenHash: `it-expired-${tag}`,
        expiresAt: new Date(Date.now() - 8 * DAY),
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: session.userId,
        tokenHash: `it-revoked-recently-${tag}`,
        expiresAt: new Date(Date.now() + 30 * DAY),
        revokedAt: new Date(Date.now() - DAY),
      },
    });
    await prisma.passwordReset.create({
      data: { userId: session.userId, codeHash: 'x', expiresAt: new Date(Date.now() - 2 * DAY) },
    });
    const dueTicket = JSON.stringify({
      ticketId: `t-due-${tag}`,
      token: 'ExponentPushToken[due]',
      at: Date.now() - 20 * 60 * 1000,
    });
    const freshTicket = JSON.stringify({
      ticketId: `t-fresh-${tag}`,
      token: 'ExponentPushToken[fresh]',
      at: Date.now(),
    });
    await redis.rpush(PUSH_TICKETS_KEY, dueTicket, 'not json', freshTicket);

    const summary = await app.get(MaintenanceProcessor).runHourly();
    expect(summary.auth.refreshTokens).toBeGreaterThanOrEqual(1);
    expect(summary.auth.passwordResets).toBeGreaterThanOrEqual(1);
    expect(summary.push.reconciled).toBeGreaterThanOrEqual(1);

    const remaining = await prisma.refreshToken.findMany({
      where: { userId: session.userId },
      select: { tokenHash: true },
    });
    const hashes = remaining.map((row) => row.tokenHash);
    expect(hashes).not.toContain(`it-expired-${tag}`);
    expect(hashes).toContain(`it-revoked-recently-${tag}`); // revoked < 7 days ago: kept
    expect(hashes.length).toBeGreaterThanOrEqual(2); // + the live session token

    const tickets = await redis.lrange(PUSH_TICKETS_KEY, 0, -1);
    expect(tickets).toContain(freshTicket);
    expect(tickets).not.toContain(dueTicket);
    expect(tickets).not.toContain('not json');
    await redis.lrem(PUSH_TICKETS_KEY, 0, freshTicket);
  });
});
