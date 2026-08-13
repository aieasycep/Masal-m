/**
 * Domain enums — single source of truth, mirrored in packages/database/prisma/schema.prisma.
 * A drift-guard test in @masalim/database asserts both stay in sync.
 * Mobile/admin import these; @prisma/client never leaks outside the API.
 */

export const UserRole = {
  USER: 'USER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AdminRole = {
  ADMIN: 'ADMIN',
  SUPPORT: 'SUPPORT',
  OPERATIONS: 'OPERATIONS',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const AuthProvider = {
  EMAIL: 'EMAIL',
  APPLE: 'APPLE',
  GOOGLE: 'GOOGLE',
} as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export const AgeRange = {
  AGE_0_2: 'AGE_0_2',
  AGE_3_5: 'AGE_3_5',
  AGE_6_8: 'AGE_6_8',
  AGE_9_12: 'AGE_9_12',
} as const;
export type AgeRange = (typeof AgeRange)[keyof typeof AgeRange];

export const StoryDuration = {
  SHORT: 'SHORT',
  MEDIUM: 'MEDIUM',
  LONG: 'LONG',
} as const;
export type StoryDuration = (typeof StoryDuration)[keyof typeof StoryDuration];

export const StoryTheme = {
  ADVENTURE: 'ADVENTURE',
  SLEEP: 'SLEEP',
  FRIENDSHIP: 'FRIENDSHIP',
  COURAGE: 'COURAGE',
  ANIMALS: 'ANIMALS',
  SPACE: 'SPACE',
  FAIRY_TALE: 'FAIRY_TALE',
  EMOTIONS: 'EMOTIONS',
  EDUCATIONAL: 'EDUCATIONAL',
  FANTASY: 'FANTASY',
  SEA: 'SEA',
  NATURE: 'NATURE',
  IMAGINATION: 'IMAGINATION',
} as const;
export type StoryTheme = (typeof StoryTheme)[keyof typeof StoryTheme];

export const HeroType = {
  CHILD: 'CHILD',
  ANIMAL: 'ANIMAL',
  FANTASY: 'FANTASY',
  ROBOT: 'ROBOT',
  CUSTOM: 'CUSTOM',
} as const;
export type HeroType = (typeof HeroType)[keyof typeof HeroType];

export const StoryStatus = {
  DRAFT: 'DRAFT',
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type StoryStatus = (typeof StoryStatus)[keyof typeof StoryStatus];

export const ModerationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ModerationStatus = (typeof ModerationStatus)[keyof typeof ModerationStatus];

export const VoiceOwnerType = {
  MOTHER: 'MOTHER',
  FATHER: 'FATHER',
  GRANDMOTHER: 'GRANDMOTHER',
  GRANDFATHER: 'GRANDFATHER',
  OTHER: 'OTHER',
} as const;
export type VoiceOwnerType = (typeof VoiceOwnerType)[keyof typeof VoiceOwnerType];

export const VoiceProfileStatus = {
  RECORDING_UPLOADED: 'RECORDING_UPLOADED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  DELETED: 'DELETED',
} as const;
export type VoiceProfileStatus = (typeof VoiceProfileStatus)[keyof typeof VoiceProfileStatus];

export const SystemVoiceCategory = {
  CALM: 'CALM',
  CHEERFUL: 'CHEERFUL',
  FAIRYTALE: 'FAIRYTALE',
  ENERGETIC: 'ENERGETIC',
} as const;
export type SystemVoiceCategory = (typeof SystemVoiceCategory)[keyof typeof SystemVoiceCategory];

export const NarrationStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type NarrationStatus = (typeof NarrationStatus)[keyof typeof NarrationStatus];

export const IllustrationStyle = {
  WATERCOLOR: 'WATERCOLOR',
  SOFT_3D: 'SOFT_3D',
  CLASSIC_STORYBOOK: 'CLASSIC_STORYBOOK',
  PASTEL: 'PASTEL',
  HAND_DRAWN: 'HAND_DRAWN',
} as const;
export type IllustrationStyle = (typeof IllustrationStyle)[keyof typeof IllustrationStyle];

export const IllustrationSetStatus = {
  QUEUED: 'QUEUED',
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type IllustrationSetStatus =
  (typeof IllustrationSetStatus)[keyof typeof IllustrationSetStatus];

export const BookStatus = {
  DRAFT: 'DRAFT',
  RENDERING: 'RENDERING',
  READY: 'READY',
} as const;
export type BookStatus = (typeof BookStatus)[keyof typeof BookStatus];

export const BookPageLayout = {
  IMAGE_TOP: 'IMAGE_TOP',
  IMAGE_FULL: 'IMAGE_FULL',
  TEXT_ONLY: 'TEXT_ONLY',
} as const;
export type BookPageLayout = (typeof BookPageLayout)[keyof typeof BookPageLayout];

export const BookSize = {
  SQUARE: 'SQUARE',
  STANDARD: 'STANDARD',
} as const;
export type BookSize = (typeof BookSize)[keyof typeof BookSize];

export const CoverType = {
  HARDCOVER: 'HARDCOVER',
  SOFTCOVER: 'SOFTCOVER',
} as const;
export type CoverType = (typeof CoverType)[keyof typeof CoverType];

export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  IN_PRODUCTION: 'IN_PRODUCTION',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const SubscriptionPlan = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  GRACE: 'GRACE',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const AIJobType = {
  STORY_GENERATION: 'STORY_GENERATION',
  VOICE_CLONE: 'VOICE_CLONE',
  NARRATION_GENERATION: 'NARRATION_GENERATION',
  ILLUSTRATION_GENERATION: 'ILLUSTRATION_GENERATION',
  BOOK_RENDER: 'BOOK_RENDER',
  PRINT_FILE_GENERATION: 'PRINT_FILE_GENERATION',
  ORDER_SNAPSHOT: 'ORDER_SNAPSHOT',
  ACCOUNT_DELETION: 'ACCOUNT_DELETION',
} as const;
export type AIJobType = (typeof AIJobType)[keyof typeof AIJobType];

export const AIJobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type AIJobStatus = (typeof AIJobStatus)[keyof typeof AIJobStatus];

export const NotificationType = {
  STORY_READY: 'STORY_READY',
  VOICE_READY: 'VOICE_READY',
  ILLUSTRATIONS_READY: 'ILLUSTRATIONS_READY',
  BOOK_READY: 'BOOK_READY',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  GENERIC: 'GENERIC',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const DeletionScope = {
  ACCOUNT: 'ACCOUNT',
  VOICE_PROFILE: 'VOICE_PROFILE',
} as const;
export type DeletionScope = (typeof DeletionScope)[keyof typeof DeletionScope];

export const DeletionStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type DeletionStatus = (typeof DeletionStatus)[keyof typeof DeletionStatus];

export const DevicePlatform = {
  IOS: 'IOS',
  ANDROID: 'ANDROID',
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];
