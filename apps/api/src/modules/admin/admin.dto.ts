import { createZodDto } from 'nestjs-zod';
import {
  adminChangePasswordSchema,
  adminFeatureFlagPatchSchema,
  adminListJobsQuerySchema,
  adminListOrdersQuerySchema,
  adminListStoriesQuerySchema,
  adminListUsersQuerySchema,
  adminLoginSchema,
  adminModerationPatchSchema,
  adminOrderPatchSchema,
  adminSystemVoiceUpsertSchema,
  paginationQuerySchema,
} from '@masalim/validation';

export class AdminLoginDto extends createZodDto(adminLoginSchema) {}
export class AdminChangePasswordDto extends createZodDto(adminChangePasswordSchema) {}
export class AdminListUsersQueryDto extends createZodDto(adminListUsersQuerySchema) {}
export class AdminListJobsQueryDto extends createZodDto(adminListJobsQuerySchema) {}
export class AdminListStoriesQueryDto extends createZodDto(adminListStoriesQuerySchema) {}
export class AdminListOrdersQueryDto extends createZodDto(adminListOrdersQuerySchema) {}
export class AdminModerationPatchDto extends createZodDto(adminModerationPatchSchema) {}
export class AdminOrderPatchDto extends createZodDto(adminOrderPatchSchema) {}
export class AdminSystemVoiceCreateDto extends createZodDto(adminSystemVoiceUpsertSchema) {}
export class AdminSystemVoicePatchDto extends createZodDto(
  adminSystemVoiceUpsertSchema.partial(),
) {}
export class AdminFeatureFlagPatchDto extends createZodDto(adminFeatureFlagPatchSchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
