import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AIJobType, BookStatus, ErrorCode, StoryStatus } from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import type {
  Book as BookDto,
  CreateBookInput,
  RenderBookInput,
  UpdateBookInput,
} from '@masalim/validation';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { StoriesService } from '../stories/stories.service';

type BookWithPages = Prisma.BookGetPayload<{ include: { pages: true } }>;

const BOOK_INCLUDE = {
  pages: { orderBy: { pageNumber: 'asc' as const } },
} satisfies Prisma.BookInclude;

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly stories: StoriesService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(userId: string): Promise<BookDto[]> {
    const rows = await this.prisma.book.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: BOOK_INCLUDE,
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /**
   * Create a book from a READY story (§30): pages copy the story text and the
   * currently selected illustrations; everything is editable afterwards.
   */
  async create(userId: string, input: CreateBookInput): Promise<BookDto> {
    const story = await this.stories.findOwned(userId, input.storyId);
    if (story.status !== StoryStatus.READY) {
      throw new AppException(
        ErrorCode.STORY_NOT_READY,
        'Story must be generated before making a book',
        HttpStatus.CONFLICT,
      );
    }
    const pages = await this.prisma.storyPage.findMany({
      where: { storyId: story.id },
      orderBy: { pageNumber: 'asc' },
    });
    if (pages.length === 0) {
      throw new AppException(ErrorCode.STORY_NOT_READY, 'Story has no pages', HttpStatus.CONFLICT);
    }

    // Selected illustrations (per page + cover) from the chosen or latest READY set.
    const set = await this.prisma.illustrationSet.findFirst({
      where: {
        storyId: story.id,
        status: 'READY',
        ...(input.illustrationSetId ? { id: input.illustrationSetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { illustrations: { where: { selected: true } } },
    });
    const byPage = new Map(
      (set?.illustrations ?? [])
        .filter((item) => item.storyPageId != null)
        .map((item) => [item.storyPageId as string, item]),
    );
    const cover = (set?.illustrations ?? []).find((item) => item.storyPageId == null) ?? null;

    const row = await this.prisma.book.create({
      data: {
        userId,
        storyId: story.id,
        storyVersion: story.version,
        title: story.title,
        coverIllustrationId: cover?.id ?? null,
        coverImageKey: cover?.imageKey ?? story.coverImageKey,
        pages: {
          create: pages.map((page) => {
            const illustration = byPage.get(page.id);
            return {
              pageNumber: page.pageNumber,
              storyPageId: page.id,
              illustrationId: illustration?.id ?? null,
              imageKey: illustration?.imageKey ?? page.illustrationKey,
              text: page.text,
              layout: 'IMAGE_TOP' as const,
            };
          }),
        },
      },
      include: BOOK_INCLUDE,
    });
    return this.toDto(row);
  }

  async get(userId: string, bookId: string): Promise<BookDto> {
    const row = await this.findOwned(userId, bookId);
    return this.toDto(row);
  }

  /** Autosave PATCH from the builder (debounced client-side, §30). */
  async update(userId: string, bookId: string, input: UpdateBookInput): Promise<BookDto> {
    const book = await this.findOwned(userId, bookId);

    await this.prisma.$transaction(async (tx) => {
      if (input.coverIllustrationId !== undefined) {
        let coverImageKey: string | null = null;
        if (input.coverIllustrationId != null) {
          const illustration = await tx.illustration.findFirst({
            where: {
              id: input.coverIllustrationId,
              illustrationSet: { storyId: book.storyId },
            },
          });
          if (illustration == null) throw AppException.notFound('Cover illustration not found');
          coverImageKey = illustration.imageKey;
        }
        await tx.book.update({
          where: { id: bookId },
          data: { coverIllustrationId: input.coverIllustrationId, coverImageKey },
        });
      }
      await tx.book.update({
        where: { id: bookId },
        data: {
          title: input.title,
          subtitle: input.subtitle,
          dedication: input.dedication,
          backCoverText: input.backCoverText,
        },
      });
      for (const page of input.pages ?? []) {
        const existing = book.pages.find((item) => item.id === page.id);
        if (existing == null) throw AppException.notFound('Book page not found');
        let imageKey = existing.imageKey;
        if (page.illustrationId !== undefined) {
          if (page.illustrationId == null) {
            imageKey = null;
          } else {
            const illustration = await tx.illustration.findFirst({
              where: { id: page.illustrationId, illustrationSet: { storyId: book.storyId } },
            });
            if (illustration == null) throw AppException.notFound('Illustration not found');
            imageKey = illustration.imageKey;
          }
        }
        await tx.bookPage.update({
          where: { id: page.id },
          data: {
            text: page.text,
            layout: page.layout,
            illustrationId: page.illustrationId,
            imageKey,
          },
        });
      }
    });

    const updated = await this.findOwned(userId, bookId);
    return this.toDto(updated);
  }

  async remove(userId: string, bookId: string): Promise<void> {
    const book = await this.findOwned(userId, bookId);
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        bookId: book.id,
        status: { in: ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED'] },
      },
      select: { id: true },
    });
    if (activeOrder != null) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Book has an active order and cannot be deleted',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.book.update({
      where: { id: bookId },
      data: { deletedAt: new Date() },
    });
  }

  /** Render job (§32): digital preview or the 206mm/300DPI print PDF. */
  async render(
    userId: string,
    bookId: string,
    input: RenderBookInput,
  ): Promise<{ jobId: string }> {
    const book = await this.findOwned(userId, bookId);
    await this.prisma.book.update({
      where: { id: book.id },
      data: { status: BookStatus.RENDERING },
    });
    const job = await this.jobs.enqueue({
      userId,
      type: AIJobType.BOOK_RENDER,
      entityId: book.id,
      queueJobId: `book:${book.id}:render:${input.kind}:${book.updatedAt.getTime()}`,
      payload: { kind: input.kind },
    });
    return { jobId: job.id };
  }

  async findOwned(userId: string, bookId: string): Promise<BookWithPages> {
    const row = await this.prisma.book.findFirst({
      where: { id: bookId, deletedAt: null },
      include: BOOK_INCLUDE,
    });
    if (row == null) throw AppException.notFound('Book not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private async toDto(row: BookWithPages): Promise<BookDto> {
    return {
      id: row.id,
      storyId: row.storyId,
      storyVersion: row.storyVersion,
      title: row.title,
      subtitle: row.subtitle,
      dedication: row.dedication,
      coverImageUrl: row.coverImageKey
        ? await this.storage.getSignedUrl(row.coverImageKey)
        : null,
      backCoverText: row.backCoverText,
      status: row.status,
      pages: await Promise.all(
        row.pages.map(async (page) => ({
          id: page.id,
          pageNumber: page.pageNumber,
          storyPageId: page.storyPageId,
          imageUrl: page.imageKey ? await this.storage.getSignedUrl(page.imageKey) : null,
          text: page.text,
          layout: page.layout,
        })),
      ),
      printPdfUrl: row.printPdfKey ? await this.storage.getSignedUrl(row.printPdfKey) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
