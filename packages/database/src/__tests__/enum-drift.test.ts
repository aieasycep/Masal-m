import { describe, expect, it } from 'vitest';
import { $Enums } from '@prisma/client';
import {
  AdminRole,
  AgeRange,
  AIJobStatus,
  AIJobType,
  AuthProvider,
  BookPageLayout,
  BookSize,
  BookStatus,
  CoverType,
  DeletionScope,
  DeletionStatus,
  DevicePlatform,
  HeroType,
  IllustrationSetStatus,
  IllustrationStyle,
  ModerationStatus,
  NarrationStatus,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  StoryDuration,
  StoryStatus,
  StoryTheme,
  SubscriptionPlan,
  SubscriptionStatus,
  SystemVoiceCategory,
  VoiceOwnerType,
  VoiceProfileStatus,
} from '@masalim/types';

/**
 * Drift guard: the shared enums in @masalim/types must stay identical to the
 * Prisma enums. If this test fails, update BOTH schema.prisma and packages/types.
 */
const pairs: Array<[string, Record<string, string>, Record<string, string>]> = [
  ['AdminRole', AdminRole, $Enums.AdminRole],
  ['AuthProvider', AuthProvider, $Enums.AuthProvider],
  ['AgeRange', AgeRange, $Enums.AgeRange],
  ['StoryDuration', StoryDuration, $Enums.StoryDuration],
  ['StoryTheme', StoryTheme, $Enums.StoryTheme],
  ['HeroType', HeroType, $Enums.HeroType],
  ['StoryStatus', StoryStatus, $Enums.StoryStatus],
  ['ModerationStatus', ModerationStatus, $Enums.ModerationStatus],
  ['VoiceOwnerType', VoiceOwnerType, $Enums.VoiceOwnerType],
  ['VoiceProfileStatus', VoiceProfileStatus, $Enums.VoiceProfileStatus],
  ['SystemVoiceCategory', SystemVoiceCategory, $Enums.SystemVoiceCategory],
  ['NarrationStatus', NarrationStatus, $Enums.NarrationStatus],
  ['IllustrationStyle', IllustrationStyle, $Enums.IllustrationStyle],
  ['IllustrationSetStatus', IllustrationSetStatus, $Enums.IllustrationSetStatus],
  ['BookStatus', BookStatus, $Enums.BookStatus],
  ['BookPageLayout', BookPageLayout, $Enums.BookPageLayout],
  ['BookSize', BookSize, $Enums.BookSize],
  ['CoverType', CoverType, $Enums.CoverType],
  ['OrderStatus', OrderStatus, $Enums.OrderStatus],
  ['PaymentStatus', PaymentStatus, $Enums.PaymentStatus],
  ['SubscriptionPlan', SubscriptionPlan, $Enums.SubscriptionPlan],
  ['SubscriptionStatus', SubscriptionStatus, $Enums.SubscriptionStatus],
  ['AIJobType', AIJobType, $Enums.AIJobType],
  ['AIJobStatus', AIJobStatus, $Enums.AIJobStatus],
  ['NotificationType', NotificationType, $Enums.NotificationType],
  ['DeletionScope', DeletionScope, $Enums.DeletionScope],
  ['DeletionStatus', DeletionStatus, $Enums.DeletionStatus],
  ['DevicePlatform', DevicePlatform, $Enums.DevicePlatform],
];

describe('enum drift between @masalim/types and Prisma schema', () => {
  for (const [name, shared, prisma] of pairs) {
    it(`${name} values match`, () => {
      expect(Object.values(shared).sort()).toEqual(Object.values(prisma).sort());
    });
  }
});
