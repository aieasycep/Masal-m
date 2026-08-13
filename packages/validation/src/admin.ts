import { z } from 'zod';
import {
  AdminRole,
  AIJobStatus,
  AIJobType,
  ModerationStatus,
  OrderStatus,
  StoryStatus,
  SubscriptionPlan,
  SystemVoiceCategory,
} from '@masalim/types';
import { paginationQuerySchema } from './common';

export const adminRoleSchema = z.nativeEnum(AdminRole);

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminSessionSchema = z.object({
  accessToken: z.string(),
  admin: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: adminRoleSchema,
  }),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminDashboardStatsSchema = z.object({
  users: z.object({ total: z.number().int(), last7Days: z.number().int() }),
  stories: z.object({
    total: z.number().int(),
    last7Days: z.number().int(),
    failed7Days: z.number().int(),
  }),
  jobs: z.object({ queued: z.number().int(), running: z.number().int(), failed24h: z.number().int() }),
  orders: z.object({ open: z.number().int(), shipped30Days: z.number().int() }),
  subscriptions: z.object({ premium: z.number().int() }),
});
export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;

export const adminListUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  locale: z.string(),
  plan: z.nativeEnum(SubscriptionPlan),
  childCount: z.number().int(),
  storyCount: z.number().int(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserDetailSchema = adminUserSummarySchema.extend({
  children: z.array(z.object({ id: z.string(), name: z.string(), ageRange: z.string() })),
  voiceProfiles: z.array(
    z.object({ id: z.string(), displayName: z.string(), status: z.string() }),
  ),
  orders: z.array(
    z.object({ id: z.string(), orderNumber: z.string(), status: z.nativeEnum(OrderStatus), total: z.string() }),
  ),
  subscription: z
    .object({ plan: z.nativeEnum(SubscriptionPlan), status: z.string(), expiresAt: z.string().nullable() })
    .nullable(),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

export const adminListJobsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(AIJobStatus).optional(),
  type: z.nativeEnum(AIJobType).optional(),
});
export type AdminListJobsQuery = z.infer<typeof adminListJobsQuerySchema>;

export const adminJobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.nativeEnum(AIJobType),
  entityId: z.string().nullable(),
  status: z.nativeEnum(AIJobStatus),
  progress: z.number().int(),
  attempts: z.number().int(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminJob = z.infer<typeof adminJobSchema>;

export const adminListStoriesQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(StoryStatus).optional(),
  moderationStatus: z.nativeEnum(ModerationStatus).optional(),
  search: z.string().trim().max(120).optional(),
});
export type AdminListStoriesQuery = z.infer<typeof adminListStoriesQuerySchema>;

export const adminStorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  title: z.string(),
  status: z.nativeEnum(StoryStatus),
  moderationStatus: z.nativeEnum(ModerationStatus),
  themes: z.array(z.string()),
  language: z.string(),
  createdAt: z.string(),
});
export type AdminStory = z.infer<typeof adminStorySchema>;

export const adminModerationPatchSchema = z.object({
  moderationStatus: z.nativeEnum(ModerationStatus),
  reason: z.string().trim().min(3).max(300),
});
export type AdminModerationPatchInput = z.infer<typeof adminModerationPatchSchema>;

export const adminListOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(OrderStatus).optional(),
  search: z.string().trim().max(60).optional(),
});
export type AdminListOrdersQuery = z.infer<typeof adminListOrdersQuerySchema>;

export const adminOrderPatchSchema = z
  .object({
    status: z.nativeEnum(OrderStatus),
    trackingNumber: z.string().trim().max(60).nullable(),
  })
  .partial();
export type AdminOrderPatchInput = z.infer<typeof adminOrderPatchSchema>;

export const adminSystemVoiceUpsertSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  category: z.nativeEnum(SystemVoiceCategory),
  provider: z.string().trim().min(1).max(40),
  providerVoiceId: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  premiumOnly: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});
export type AdminSystemVoiceUpsertInput = z.infer<typeof adminSystemVoiceUpsertSchema>;

export const adminFeatureFlagPatchSchema = z.object({
  enabled: z.boolean(),
});
export type AdminFeatureFlagPatchInput = z.infer<typeof adminFeatureFlagPatchSchema>;

export const adminAuditLogSchema = z.object({
  id: z.string(),
  adminEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>;
