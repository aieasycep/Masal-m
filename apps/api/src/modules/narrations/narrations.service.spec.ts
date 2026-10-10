import { HttpStatus } from '@nestjs/common';
import {
  EntitlementKey,
  ErrorCode,
  NarrationStatus,
  StoryStatus,
  VoiceProfileStatus,
} from '@masalim/types';
import type { StorageProvider } from '@masalim/storage';
import { AppException } from '../../common/errors/app.exception';
import type { JobsService } from '../../jobs/jobs.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StoriesService } from '../stories/stories.service';
import type { EntitlementService } from '../subscription/entitlement.service';
import type { VoiceProfilesService } from '../voices/voice-profiles.service';
import { NarrationsService } from './narrations.service';

const STORY = { id: 's1', status: StoryStatus.READY, version: 1, durationTarget: 'SHORT' };

/** An existing READY narration makes `create` return early — the gate under test runs before it. */
const EXISTING_NARRATION = {
  id: 'n1',
  storyId: 's1',
  storyVersion: 1,
  voiceProfileId: null,
  systemVoiceId: 'sv1',
  audioKey: null,
  duration: null,
  timings: null,
  wordTimings: null,
  status: NarrationStatus.READY,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  voiceProfile: null,
  systemVoice: { displayName: 'Masal Anlatıcı' },
};

function buildService(options: { premium: boolean }) {
  const prisma = {
    narration: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => EXISTING_NARRATION),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    systemVoice: {
      findFirst: jest.fn(async () => ({ id: 'sv1', enabled: true, premiumOnly: false })),
    },
    aIJob: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const entitlements = {
    requireFeature: jest.fn(async (_userId: string, key: string) => {
      if (!options.premium) {
        throw new AppException(
          ErrorCode.ENTITLEMENT_REQUIRED,
          `Feature "${key}" requires a premium subscription`,
          HttpStatus.FORBIDDEN,
          { key },
        );
      }
    }),
    consumeCredits: jest.fn(),
    refundCreditsForRef: jest.fn(),
  };
  const stories = { findOwned: jest.fn(async () => STORY) };
  const voiceProfiles = {
    findOwned: jest.fn(async () => ({
      id: 'vp1',
      userId: 'u1',
      status: VoiceProfileStatus.READY,
      providerVoiceId: 'clone-1',
    })),
  };
  const storage = { getSignedUrl: jest.fn(async () => 'https://signed') };

  const service = new NarrationsService(
    prisma,
    {} as JobsService,
    entitlements as unknown as EntitlementService,
    stories as unknown as StoriesService,
    voiceProfiles as unknown as VoiceProfilesService,
    storage as unknown as StorageProvider,
  );
  return { service, prisma, entitlements, voiceProfiles };
}

describe('NarrationsService.create — cloned parent voice is Premium-only (D.3)', () => {
  it('refuses a cloned voice for a FREE account before touching the profile (403 ENTITLEMENT_REQUIRED)', async () => {
    const { service, entitlements, voiceProfiles, prisma } = buildService({ premium: false });

    const attempt = service.create('u1', 's1', { voiceProfileId: 'vp1' });
    await expect(attempt).rejects.toMatchObject({ code: ErrorCode.ENTITLEMENT_REQUIRED });
    await attempt.catch((error: AppException) =>
      expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN),
    );

    expect(entitlements.requireFeature).toHaveBeenCalledWith(
      'u1',
      EntitlementKey.PARENT_VOICE_CLONE,
    );
    expect(voiceProfiles.findOwned).not.toHaveBeenCalled();
    expect(prisma.narration.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a Premium account narrate with its cloned voice', async () => {
    const { service, entitlements, voiceProfiles } = buildService({ premium: true });

    const result = await service.create('u1', 's1', { voiceProfileId: 'vp1' });

    expect(entitlements.requireFeature).toHaveBeenCalledWith(
      'u1',
      EntitlementKey.PARENT_VOICE_CLONE,
    );
    expect(voiceProfiles.findOwned).toHaveBeenCalledWith('u1', 'vp1');
    expect(result.narration.id).toBe('n1');
  });

  it('does not gate free system voices', async () => {
    const { service, entitlements } = buildService({ premium: false });

    const result = await service.create('u1', 's1', { systemVoiceId: 'sv1' });

    expect(entitlements.requireFeature).not.toHaveBeenCalled();
    expect(result.narration.id).toBe('n1');
  });
});
