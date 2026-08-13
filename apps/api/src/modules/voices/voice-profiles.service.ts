import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AIJobType,
  EntitlementKey,
  ErrorCode,
  VOICE_RECORDING,
  VoiceProfileStatus,
} from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import type {
  CreateVoiceProfileInput,
  RecreateVoiceProfileInput,
  VoiceProfile as VoiceProfileDto,
} from '@masalim/validation';
import type { VoiceProfile as VoiceProfileRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { JobsService } from '../../jobs/jobs.service';
import { EntitlementService } from '../subscription/entitlement.service';

@Injectable()
export class VoiceProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly entitlements: EntitlementService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async list(userId: string): Promise<VoiceProfileDto[]> {
    const rows = await this.prisma.voiceProfile.findMany({
      where: { userId, deletedAt: null, status: { not: VoiceProfileStatus.DELETED } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /**
   * Voice clone intake (§20/§21): premium-gated BEFORE any processing, explicit
   * consent stamped server-side, recording key must live under the caller's own
   * upload prefix (no cross-user object references).
   */
  async create(userId: string, input: CreateVoiceProfileInput): Promise<VoiceProfileDto> {
    await this.entitlements.requireFeature(userId, EntitlementKey.PARENT_VOICE_CLONE);
    this.assertRecording(userId, input.recordingObjectKey, input.recordingDurationSeconds);

    const row = await this.prisma.voiceProfile.create({
      data: {
        userId,
        ownerType: input.ownerType,
        displayName: input.displayName,
        provider: 'pending',
        recordingKey: input.recordingObjectKey,
        status: VoiceProfileStatus.RECORDING_UPLOADED,
        consentAcceptedAt: new Date(),
      },
    });
    const job = await this.jobs.enqueue({
      userId,
      type: AIJobType.VOICE_CLONE,
      entityId: row.id,
      queueJobId: `voice:${row.id}:clone:initial`,
    });
    return this.toDto(row, job.id);
  }

  async rename(userId: string, voiceId: string, displayName: string): Promise<VoiceProfileDto> {
    await this.findOwned(userId, voiceId);
    const row = await this.prisma.voiceProfile.update({
      where: { id: voiceId },
      data: { displayName },
    });
    return this.toDto(row);
  }

  /**
   * Re-record (§46): the old clone stays live until the new recording clones
   * successfully — the job swaps providerVoiceId/preview on success only.
   */
  async recreate(
    userId: string,
    voiceId: string,
    input: RecreateVoiceProfileInput,
  ): Promise<VoiceProfileDto> {
    const row = await this.findOwned(userId, voiceId);
    await this.entitlements.requireFeature(userId, EntitlementKey.PARENT_VOICE_CLONE);
    this.assertRecording(userId, input.recordingObjectKey, input.recordingDurationSeconds);

    await this.prisma.voiceProfile.update({
      where: { id: voiceId },
      data: { consentAcceptedAt: new Date() },
    });
    const job = await this.jobs.enqueue({
      userId,
      type: AIJobType.VOICE_CLONE,
      entityId: voiceId,
      queueJobId: `voice:${voiceId}:clone:${Date.now()}`,
      payload: { recreateRecordingKey: input.recordingObjectKey },
    });
    return this.toDto(row, job.id);
  }

  async preview(userId: string, voiceId: string): Promise<{ previewUrl: string }> {
    const row = await this.findOwned(userId, voiceId);
    if (row.status !== VoiceProfileStatus.READY || row.previewKey == null) {
      throw new AppException(
        ErrorCode.VOICE_NOT_READY,
        'Voice preview is not ready yet',
        HttpStatus.CONFLICT,
      );
    }
    return { previewUrl: await this.storage.getSignedUrl(row.previewKey) };
  }

  /** Deletion (§46): provider voice + stored media purged; existing narrations stay. */
  async remove(
    userId: string,
    voiceId: string,
    deleteProviderVoice: (providerVoiceId: string) => Promise<void>,
  ): Promise<void> {
    const row = await this.findOwned(userId, voiceId);
    if (row.providerVoiceId != null) {
      await deleteProviderVoice(row.providerVoiceId).catch(() => {
        // Provider deletion is retried by ops tooling; local purge still proceeds.
      });
    }
    if (row.recordingKey != null) await this.storage.deleteObject(row.recordingKey).catch(() => undefined);
    if (row.previewKey != null) await this.storage.deleteObject(row.previewKey).catch(() => undefined);
    await this.prisma.voiceProfile.update({
      where: { id: voiceId },
      data: {
        status: VoiceProfileStatus.DELETED,
        deletedAt: new Date(),
        providerVoiceId: null,
        recordingKey: null,
        previewKey: null,
      },
    });
  }

  async findOwned(userId: string, voiceId: string): Promise<VoiceProfileRow> {
    const row = await this.prisma.voiceProfile.findFirst({
      where: { id: voiceId, deletedAt: null, status: { not: VoiceProfileStatus.DELETED } },
    });
    if (row == null) throw AppException.notFound('Voice profile not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    return row;
  }

  private assertRecording(userId: string, objectKey: string, durationSeconds: number): void {
    if (!objectKey.startsWith(`${StorageKeys.voiceRecording(userId)}/`)) {
      throw AppException.forbiddenOwnership('Recording does not belong to this account');
    }
    if (durationSeconds < VOICE_RECORDING.MIN_DURATION_SECONDS) {
      throw new AppException(
        ErrorCode.RECORDING_TOO_SHORT,
        `Recording must be at least ${VOICE_RECORDING.MIN_DURATION_SECONDS}s`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (durationSeconds > VOICE_RECORDING.MAX_DURATION_SECONDS) {
      throw new AppException(
        ErrorCode.RECORDING_TOO_LONG,
        `Recording must be at most ${VOICE_RECORDING.MAX_DURATION_SECONDS}s`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async toDto(row: VoiceProfileRow, jobId: string | null = null): Promise<VoiceProfileDto> {
    if (jobId == null) {
      const activeJob = await this.prisma.aIJob.findFirst({
        where: {
          entityId: row.id,
          type: AIJobType.VOICE_CLONE,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      jobId = activeJob?.id ?? null;
    }
    return {
      id: row.id,
      ownerType: row.ownerType,
      displayName: row.displayName,
      status: row.status,
      previewUrl: row.previewKey ? await this.storage.getSignedUrl(row.previewKey) : null,
      consentAcceptedAt: row.consentAcceptedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      jobId,
    };
  }
}
