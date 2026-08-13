import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { AdminRole } from '@masalim/types';
import {
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
  type AdminDashboardStats,
  type AdminSession,
  type AdminUserDetail,
} from '@masalim/validation';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AdminAuthGuard, AdminRoles, type AuthenticatedAdmin } from './admin-auth.guard';
import { AdminService } from './admin.service';

class AdminLoginDto extends createZodDto(adminLoginSchema) {}
class AdminListUsersQueryDto extends createZodDto(adminListUsersQuerySchema) {}
class AdminListJobsQueryDto extends createZodDto(adminListJobsQuerySchema) {}
class AdminListStoriesQueryDto extends createZodDto(adminListStoriesQuerySchema) {}
class AdminListOrdersQueryDto extends createZodDto(adminListOrdersQuerySchema) {}
class AdminModerationPatchDto extends createZodDto(adminModerationPatchSchema) {}
class AdminOrderPatchDto extends createZodDto(adminOrderPatchSchema) {}
class AdminSystemVoiceCreateDto extends createZodDto(adminSystemVoiceUpsertSchema) {}
class AdminSystemVoicePatchDto extends createZodDto(adminSystemVoiceUpsertSchema.partial()) {}
class AdminFeatureFlagPatchDto extends createZodDto(adminFeatureFlagPatchSchema) {}
class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<Request & { admin: AuthenticatedAdmin }>();
    return request.admin;
  },
);

/**
 * Admin API (§39–§40): the whole controller is @Public() to bypass the user
 * JWT guard; AdminAuthGuard enforces the separate admin realm, and RBAC is
 * declared per handler. Every mutation writes an AuditLog row (§45).
 */
@ApiTags('admin')
@Public()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ── Auth ── (login skips AdminAuthGuard via its own @Public marker below)

  @Get('dashboard/stats')
  stats(): Promise<AdminDashboardStats> {
    return this.admin.dashboardStats();
  }

  // Users — SUPPORT gets read access, ADMIN everything (§40)
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  @Get('users')
  listUsers(@Query() query: AdminListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  @Get('users/:id')
  userDetail(@Param('id') id: string): Promise<AdminUserDetail> {
    return this.admin.userDetail(id);
  }

  // Jobs — ADMIN + OPERATIONS
  @AdminRoles(AdminRole.ADMIN, AdminRole.OPERATIONS)
  @Get('jobs')
  listJobs(@Query() query: AdminListJobsQueryDto) {
    return this.admin.listJobs(query);
  }

  @AdminRoles(AdminRole.ADMIN, AdminRole.OPERATIONS)
  @Post('jobs/:id/retry')
  async retryJob(@CurrentAdmin() admin: AuthenticatedAdmin, @Param('id') id: string) {
    const job = await this.admin.retryJob(id);
    await this.admin.audit(admin, 'job.retry', 'AIJob', id, { type: job.type });
    return job;
  }

  // Stories & moderation — ADMIN + SUPPORT
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  @Get('stories')
  listStories(@Query() query: AdminListStoriesQueryDto) {
    return this.admin.listStories(query);
  }

  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
  @Patch('stories/:id/moderation')
  async patchModeration(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() body: AdminModerationPatchDto,
  ) {
    const story = await this.admin.patchModeration(id, body);
    await this.admin.audit(admin, 'story.moderation_override', 'Story', id, {
      moderationStatus: body.moderationStatus,
      reason: body.reason,
    });
    return story;
  }

  // Orders — ADMIN + OPERATIONS
  @AdminRoles(AdminRole.ADMIN, AdminRole.OPERATIONS)
  @Get('orders')
  listOrders(@Query() query: AdminListOrdersQueryDto) {
    return this.admin.listOrders(query);
  }

  @AdminRoles(AdminRole.ADMIN, AdminRole.OPERATIONS)
  @Patch('orders/:id')
  async patchOrder(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() body: AdminOrderPatchDto,
  ) {
    const order = await this.admin.patchOrder(id, body);
    await this.admin.audit(admin, 'order.patch', 'Order', id, { ...body });
    return order;
  }

  // System voices — ADMIN only
  @AdminRoles(AdminRole.ADMIN)
  @Get('system-voices')
  listSystemVoices() {
    return this.admin.listSystemVoices();
  }

  @AdminRoles(AdminRole.ADMIN)
  @Post('system-voices')
  async createSystemVoice(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() body: AdminSystemVoiceCreateDto,
  ) {
    const voice = await this.admin.createSystemVoice(body);
    await this.admin.audit(admin, 'system_voice.create', 'SystemVoice', voice.id, {
      displayName: voice.displayName,
    });
    return voice;
  }

  @AdminRoles(AdminRole.ADMIN)
  @Patch('system-voices/:id')
  async updateSystemVoice(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() body: AdminSystemVoicePatchDto,
  ) {
    const voice = await this.admin.updateSystemVoice(id, body);
    await this.admin.audit(admin, 'system_voice.update', 'SystemVoice', id, { ...body });
    return voice;
  }

  // Feature flags — ADMIN only
  @AdminRoles(AdminRole.ADMIN)
  @Get('feature-flags')
  listFeatureFlags() {
    return this.admin.listFeatureFlags();
  }

  @AdminRoles(AdminRole.ADMIN)
  @Patch('feature-flags/:key')
  async patchFeatureFlag(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('key') key: string,
    @Body() body: AdminFeatureFlagPatchDto,
  ) {
    const flag = await this.admin.patchFeatureFlag(key, body);
    await this.admin.audit(admin, 'feature_flag.patch', 'FeatureFlag', key, {
      enabled: body.enabled,
    });
    return flag;
  }

  // Audit trail — ADMIN only
  @AdminRoles(AdminRole.ADMIN)
  @Get('audit-logs')
  listAuditLogs(@Query() query: PaginationQueryDto) {
    return this.admin.listAuditLogs(query.page, query.pageSize);
  }
}

/** Login lives on its own controller so it stays outside AdminAuthGuard. */
@ApiTags('admin')
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminService) {}

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post('login')
  login(@Body() body: AdminLoginDto): Promise<AdminSession> {
    return this.admin.login(body);
  }
}
