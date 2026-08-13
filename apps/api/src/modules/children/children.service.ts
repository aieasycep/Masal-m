import { Inject, Injectable } from '@nestjs/common';
import { AgeRange } from '@masalim/types';
import type { Child, CreateChildInput, Recommendation, UpdateChildInput } from '@masalim/validation';
import type { Child as ChildRow } from '@masalim/database';
import type { StorageProvider } from '@masalim/storage';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';

@Injectable()
export class ChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(userId: string): Promise<Child[]> {
    const rows = await this.prisma.child.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { stories: { where: { deletedAt: null } } } } },
    });
    return Promise.all(rows.map((row) => this.toDto(row, row._count.stories)));
  }

  async get(userId: string, childId: string): Promise<Child> {
    const row = await this.findOwned(userId, childId);
    const storyCount = await this.prisma.story.count({
      where: { childId: row.id, deletedAt: null },
    });
    return this.toDto(row, storyCount);
  }

  async create(userId: string, input: CreateChildInput): Promise<Child> {
    const row = await this.prisma.child.create({
      data: {
        userId,
        name: input.name,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        ageRange: input.ageRange ?? ageRangeFromBirthDate(input.birthDate),
        avatarKey: input.avatarObjectKey,
        interests: normalizeInterests(input.interests),
        preferences: input.preferences,
      },
    });
    return this.toDto(row, 0);
  }

  async update(userId: string, childId: string, input: UpdateChildInput): Promise<Child> {
    await this.findOwned(userId, childId);
    const row = await this.prisma.child.update({
      where: { id: childId },
      data: {
        name: input.name,
        birthDate:
          input.birthDate === undefined
            ? undefined
            : input.birthDate == null
              ? null
              : new Date(input.birthDate),
        ageRange: input.ageRange,
        avatarKey: input.avatarObjectKey === undefined ? undefined : input.avatarObjectKey,
        interests: input.interests ? normalizeInterests(input.interests) : undefined,
        preferences: input.preferences,
      },
    });
    const storyCount = await this.prisma.story.count({
      where: { childId: row.id, deletedAt: null },
    });
    return this.toDto(row, storyCount);
  }

  async remove(userId: string, childId: string): Promise<void> {
    await this.findOwned(userId, childId);
    await this.prisma.child.update({ where: { id: childId }, data: { deletedAt: new Date() } });
  }

  /**
   * Recommendation v0 (§38): interests → seeded templates, excluding the
   * child's most recent story themes so suggestions stay fresh.
   */
  async recommendations(userId: string, childId: string): Promise<Recommendation[]> {
    const child = await this.findOwned(userId, childId);
    const recentStories = await this.prisma.story.findMany({
      where: { childId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { themes: true },
    });
    const recentThemes = new Set(recentStories.flatMap((story) => story.themes));

    const templates = await this.prisma.recommendationTemplate.findMany({
      where: { enabled: true, interest: { in: child.interests } },
    });
    const fallback =
      templates.length >= 3
        ? []
        : await this.prisma.recommendationTemplate.findMany({
            where: { enabled: true, interest: { notIn: child.interests } },
            take: 6,
          });

    const ranked = [...templates, ...fallback]
      .map((template) => ({
        template,
        staleThemes: template.themes.filter((theme) => recentThemes.has(theme)).length,
      }))
      .sort((a, b) => a.staleThemes - b.staleThemes)
      .slice(0, 3);

    return ranked.map(({ template }) => ({
      title: template.title.includes(child.name)
        ? template.title
        : `${child.name} — ${template.title}`,
      themes: template.themes,
      promptSeed: template.promptSeed,
      emoji: template.emoji,
    }));
  }

  /** Ownership policy (§79): every child access goes through this single check. */
  async findOwned(userId: string, childId: string): Promise<ChildRow> {
    const row = await this.prisma.child.findFirst({
      where: { id: childId, deletedAt: null },
    });
    if (row == null) throw AppException.notFound('Child not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private async toDto(row: ChildRow, storyCount: number): Promise<Child> {
    const preferences = (row.preferences ?? {}) as { nickname?: string; notes?: string };
    return {
      id: row.id,
      name: row.name,
      birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
      ageRange: row.ageRange,
      avatarUrl: row.avatarKey ? await this.storage.getSignedUrl(row.avatarKey) : null,
      interests: row.interests,
      preferences,
      storyCount,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function normalizeInterests(interests: string[]): string[] {
  return [...new Set(interests.map((interest) => interest.trim().toLocaleLowerCase('tr')))];
}

function ageRangeFromBirthDate(birthDate: string | undefined): AgeRange {
  if (birthDate == null) return AgeRange.AGE_3_5;
  const ageMs = Date.now() - new Date(birthDate).getTime();
  const years = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 3) return AgeRange.AGE_0_2;
  if (years < 6) return AgeRange.AGE_3_5;
  if (years < 9) return AgeRange.AGE_6_8;
  return AgeRange.AGE_9_12;
}
