import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AIJobType,
  EntitlementKey,
  ErrorCode,
  NarrationStatus,
  StoryStatus,
  VoiceProfileStatus,
} from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import type { CreateNarrationInput, Narration as NarrationDto, NarrationTiming } from '@masalim/validation';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { StoriesService } from '../stories/stories.service';
import { VoiceProfilesService } from '../voices/voice-profiles.service';

type NarrationWithVoices = Prisma.NarrationGetPayload<{
  include: {
    voiceProfile: { select: { displayName: true } };
    systemVoice: { select: { displayName: true } };
  };
}>;

const NARRATION_INCLUDE = {
  voiceProfile: { select: { displayName: true } },
  systemVoice: { select: { displayName: true } },
} satisfies Prisma.NarrationInclude;

@Injectable()
export class NarrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly entitlements: EntitlementService,
    private readonly stories: StoriesService,
    private readonly voiceProfiles: VoiceProfilesService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(userId: string, storyId: string): Promise<NarrationDto[]> {
    await this.stories.findOwned(userId, storyId);
    await this.pruneFailed(storyId);
    const rows = await this.prisma.narration.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      include: NARRATION_INCLUDE,
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /**
   * Failed narrations are transient diagnostics, not history: keep at most the
   * newest failed attempt per voice (so retry stays offered), and drop even
   * that once the voice has a newer non-failed narration.
   */
  private async pruneFailed(storyId: string): Promise<void> {
    const rows = await this.prisma.narration.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, voiceProfileId: true, systemVoiceId: true },
    });
    const newestFailedKept = new Set<string>();
    const hasNewerNonFailed = new Set<string>();
    const stale: string[] = [];
    for (const row of rows) {
      const key = row.voiceProfileId != null ? `vp:${row.voiceProfileId}` : `sv:${row.systemVoiceId}`;
      if (row.status !== NarrationStatus.FAILED) {
        hasNewerNonFailed.add(key);
        continue;
      }
      if (hasNewerNonFailed.has(key) || newestFailedKept.has(key)) {
        stale.push(row.id);
      } else {
        newestFailedKept.add(key);
      }
    }
    if (stale.length > 0) {
      await this.prisma.narration.deleteMany({ where: { id: { in: stale } } });
    }
  }

  /**
   * Enqueue TTS narration (§19). One narration per (story version, voice) —
   * a duplicate request returns the existing READY narration or the active
   * job. Premium checks: parent voices and premium system voices gate here.
   */
  async create(
    userId: string,
    storyId: string,
    input: CreateNarrationInput,
  ): Promise<{ narration: NarrationDto; jobId: string | null }> {
    const story = await this.stories.findOwned(userId, storyId);
    if (story.status !== StoryStatus.READY) {
      throw new AppException(
        ErrorCode.STORY_NOT_READY,
        'Story text is not ready to narrate',
        HttpStatus.CONFLICT,
      );
    }

    let voiceKey: string;
    if (input.voiceProfileId != null) {
      const profile = await this.voiceProfiles.findOwned(userId, input.voiceProfileId);
      if (profile.status !== VoiceProfileStatus.READY || profile.providerVoiceId == null) {
        throw new AppException(
          ErrorCode.VOICE_NOT_READY,
          'Voice profile is not ready',
          HttpStatus.CONFLICT,
        );
      }
      voiceKey = `vp:${profile.id}`;
    } else {
      const systemVoice = await this.prisma.systemVoice.findFirst({
        where: { id: input.systemVoiceId, enabled: true },
      });
      if (systemVoice == null) throw AppException.notFound('System voice not found');
      if (systemVoice.premiumOnly) {
        await this.entitlements.requireFeature(userId, EntitlementKey.PREMIUM_SYSTEM_VOICES);
      }
      voiceKey = `sv:${systemVoice.id}`;
    }

    const existing = await this.prisma.narration.findFirst({
      where: {
        storyId,
        storyVersion: story.version,
        voiceProfileId: input.voiceProfileId ?? null,
        systemVoiceId: input.systemVoiceId ?? null,
        status: { in: [NarrationStatus.QUEUED, NarrationStatus.PROCESSING, NarrationStatus.READY] },
      },
      include: NARRATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    if (existing != null) {
      const activeJob =
        existing.status === NarrationStatus.READY
          ? null
          : await this.prisma.aIJob.findFirst({
              where: {
                entityId: existing.id,
                type: AIJobType.NARRATION_GENERATION,
                status: { in: ['QUEUED', 'RUNNING'] },
              },
              select: { id: true },
            });
      return { narration: await this.toDto(existing), jobId: activeJob?.id ?? null };
    }

    const narration = await this.prisma.narration.create({
      data: {
        storyId,
        storyVersion: story.version,
        voiceProfileId: input.voiceProfileId ?? null,
        systemVoiceId: input.systemVoiceId ?? null,
        provider: 'pending',
        status: NarrationStatus.QUEUED,
      },
      include: NARRATION_INCLUDE,
    });
    const job = await this.jobs.enqueue({
      userId,
      type: AIJobType.NARRATION_GENERATION,
      entityId: narration.id,
      queueJobId: `narration:${storyId}:v${story.version}:${voiceKey}`,
    });
    await this.pruneFailed(storyId);
    return { narration: await this.toDto(narration), jobId: job.id };
  }

  private async toDto(row: NarrationWithVoices): Promise<NarrationDto> {
    const activeJob =
      row.status === NarrationStatus.READY || row.status === NarrationStatus.FAILED
        ? null
        : await this.prisma.aIJob.findFirst({
            where: {
              entityId: row.id,
              type: AIJobType.NARRATION_GENERATION,
              status: { in: ['QUEUED', 'RUNNING'] },
            },
            select: { id: true },
          });
    return {
      id: row.id,
      storyId: row.storyId,
      storyVersion: row.storyVersion,
      narratorName:
        row.voiceProfile?.displayName ?? row.systemVoice?.displayName ?? 'Masalım',
      isParentVoice: row.voiceProfileId != null,
      voiceProfileId: row.voiceProfileId,
      systemVoiceId: row.systemVoiceId,
      audioUrl: row.audioKey ? await this.storage.getSignedUrl(row.audioKey, 3600) : null,
      duration: row.duration,
      timings: (row.timings as NarrationTiming[] | null) ?? null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      jobId: activeJob?.id ?? null,
    };
  }
}
