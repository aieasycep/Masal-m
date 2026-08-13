import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {
  AIJobStatus,
  ErrorCode,
  OrderStatus,
  SubscriptionPlan,
} from '@masalim/types';
import type {
  AdminAuditLog,
  AdminDashboardStats,
  AdminFeatureFlagPatchInput,
  AdminJob,
  AdminListJobsQuery,
  AdminListOrdersQuery,
  AdminListStoriesQuery,
  AdminListUsersQuery,
  AdminLoginInput,
  AdminModerationPatchInput,
  AdminOrderPatchInput,
  AdminSession,
  AdminStory,
  AdminSystemVoiceUpsertInput,
  AdminUserDetail,
  AdminUserSummary,
  PaginatedMeta,
} from '@masalim/validation';
import type { Prisma } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { JobsService } from '../../jobs/jobs.service';
import { QUEUE_FOR_JOB_TYPE, type QueueJobData } from '../../jobs/queues';
import type { AuthenticatedAdmin } from './admin-auth.guard';

const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  async login(input: AdminLoginInput): Promise<AdminSession> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    const valid =
      admin != null && (await argon2.verify(admin.passwordHash, input.password).catch(() => false));
    if (!valid || admin == null) {
      throw new AppException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid admin credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const accessToken = await this.jwtService.signAsync(
      { sub: admin.id, email: admin.email, role: admin.role, type: 'admin' },
      { secret: this.env.JWT_SECRET, expiresIn: '8h' },
    );
    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  }

  // ── Audit (§45) ───────────────────────────────────────────────────────────

  async audit(
    admin: AuthenticatedAdmin,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  async listAuditLogs(page: number, pageSize: number): Promise<{ items: AdminAuditLog[]; meta: PaginatedMeta }> {
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { adminUser: { select: { email: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        adminEmail: row.adminUser?.email ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: this.meta(page, pageSize, totalItems),
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async dashboardStats(): Promise<AdminDashboardStats> {
    const now = Date.now();
    const week = new Date(now - 7 * DAY_MS);
    const day = new Date(now - DAY_MS);
    const month = new Date(now - 30 * DAY_MS);
    const [
      usersTotal,
      users7,
      storiesTotal,
      stories7,
      storiesFailed7,
      jobsQueued,
      jobsRunning,
      jobsFailed24,
      ordersOpen,
      ordersShipped30,
      premium,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: week } } }),
      this.prisma.story.count({ where: { deletedAt: null } }),
      this.prisma.story.count({ where: { deletedAt: null, createdAt: { gte: week } } }),
      this.prisma.story.count({ where: { status: 'FAILED', updatedAt: { gte: week } } }),
      this.prisma.aIJob.count({ where: { status: AIJobStatus.QUEUED } }),
      this.prisma.aIJob.count({ where: { status: AIJobStatus.RUNNING } }),
      this.prisma.aIJob.count({ where: { status: AIJobStatus.FAILED, updatedAt: { gte: day } } }),
      this.prisma.order.count({
        where: { status: { in: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.IN_PRODUCTION] } },
      }),
      this.prisma.order.count({
        where: { status: { in: [OrderStatus.SHIPPED, OrderStatus.DELIVERED] }, updatedAt: { gte: month } },
      }),
      this.prisma.user.count({ where: { subscriptionPlan: SubscriptionPlan.PREMIUM, deletedAt: null } }),
    ]);
    return {
      users: { total: usersTotal, last7Days: users7 },
      stories: { total: storiesTotal, last7Days: stories7, failed7Days: storiesFailed7 },
      jobs: { queued: jobsQueued, running: jobsRunning, failed24h: jobsFailed24 },
      orders: { open: ordersOpen, shipped30Days: ordersShipped30 },
      subscriptions: { premium },
    };
  }

  // ── Users (§40) ───────────────────────────────────────────────────────────

  async listUsers(query: AdminListUsersQuery): Promise<{ items: AdminUserSummary[]; meta: PaginatedMeta }> {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: {
            select: {
              children: { where: { deletedAt: null } },
              stories: { where: { deletedAt: null } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        locale: row.locale,
        plan: row.subscriptionPlan,
        childCount: row._count.children,
        storyCount: row._count.stories,
        createdAt: row.createdAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
      })),
      meta: this.meta(query.page, query.pageSize, totalItems),
    };
  }

  async userDetail(userId: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        children: { where: { deletedAt: null } },
        voiceProfiles: { where: { deletedAt: null } },
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        subscription: true,
        _count: {
          select: {
            children: { where: { deletedAt: null } },
            stories: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (row == null) throw AppException.notFound('User not found');
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      locale: row.locale,
      plan: row.subscriptionPlan,
      childCount: row._count.children,
      storyCount: row._count.stories,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      children: row.children.map((child) => ({
        id: child.id,
        name: child.name,
        ageRange: child.ageRange,
      })),
      voiceProfiles: row.voiceProfiles.map((voice) => ({
        id: voice.id,
        displayName: voice.displayName,
        status: voice.status,
      })),
      orders: row.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total.toFixed(2),
      })),
      subscription: row.subscription
        ? {
            plan: row.subscription.plan,
            status: row.subscription.status,
            expiresAt: row.subscription.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  // ── Jobs (§40) ────────────────────────────────────────────────────────────

  async listJobs(query: AdminListJobsQuery): Promise<{ items: AdminJob[]; meta: PaginatedMeta }> {
    const where: Prisma.AIJobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.aIJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.aIJob.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        type: row.type,
        entityId: row.entityId,
        status: row.status,
        progress: row.progress,
        attempts: row.attempts,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: this.meta(query.page, query.pageSize, totalItems),
    };
  }

  /** Re-drive a FAILED job through its queue; processors are idempotent (§59). */
  async retryJob(jobId: string): Promise<AdminJob> {
    const row = await this.prisma.aIJob.findUnique({ where: { id: jobId } });
    if (row == null) throw AppException.notFound('Job not found');
    if (row.status !== AIJobStatus.FAILED && row.status !== AIJobStatus.CANCELLED) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Only failed or cancelled jobs can be retried',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.prisma.aIJob.update({
      where: { id: jobId },
      data: { status: AIJobStatus.QUEUED, progress: 0, errorCode: null, errorMessage: null },
    });
    const queueName = QUEUE_FOR_JOB_TYPE[row.type];
    const data: QueueJobData = { aiJobId: row.id };
    await this.jobs
      .getQueue(queueName)
      .add(queueName, data, { jobId: `${row.id}:retry:${Date.now()}` });
    return {
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      entityId: updated.entityId,
      status: updated.status,
      progress: updated.progress,
      attempts: updated.attempts,
      errorCode: updated.errorCode,
      errorMessage: updated.errorMessage,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ── Stories & moderation (§40) ────────────────────────────────────────────

  async listStories(query: AdminListStoriesQuery): Promise<{ items: AdminStory[]; meta: PaginatedMeta }> {
    const where: Prisma.StoryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.moderationStatus ? { moderationStatus: query.moderationStatus } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { email: true } } },
      }),
      this.prisma.story.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user.email,
        title: row.title,
        status: row.status,
        moderationStatus: row.moderationStatus,
        themes: row.themes,
        language: row.language,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: this.meta(query.page, query.pageSize, totalItems),
    };
  }

  async patchModeration(storyId: string, input: AdminModerationPatchInput): Promise<AdminStory> {
    const row = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: { user: { select: { email: true } } },
    });
    if (row == null) throw AppException.notFound('Story not found');
    const updated = await this.prisma.story.update({
      where: { id: storyId },
      data: { moderationStatus: input.moderationStatus },
      include: { user: { select: { email: true } } },
    });
    return {
      id: updated.id,
      userId: updated.userId,
      userEmail: updated.user.email,
      title: updated.title,
      status: updated.status,
      moderationStatus: updated.moderationStatus,
      themes: updated.themes,
      language: updated.language,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  // ── Orders (§40) ──────────────────────────────────────────────────────────

  async listOrders(query: AdminListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { orderNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { email: true } }, book: { select: { title: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        userEmail: row.user.email,
        bookTitle: row.book.title,
        quantity: row.quantity,
        total: row.total.toFixed(2),
        status: row.status,
        paymentStatus: row.paymentStatus,
        trackingNumber: row.trackingNumber,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: this.meta(query.page, query.pageSize, totalItems),
    };
  }

  async patchOrder(orderId: string, input: AdminOrderPatchInput) {
    const row = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (row == null) throw AppException.notFound('Order not found');
    const timeline =
      input.status != null && input.status !== row.status
        ? [
            ...((row.statusTimeline as Array<{ status: string; at: string }>) ?? []),
            { status: input.status, at: new Date().toISOString() },
          ]
        : undefined;
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: input.status,
        trackingNumber: input.trackingNumber,
        ...(timeline ? { statusTimeline: timeline } : {}),
      },
    });
    return { id: updated.id, status: updated.status, trackingNumber: updated.trackingNumber };
  }

  // ── System voices & feature flags (§40) ───────────────────────────────────

  listSystemVoices() {
    return this.prisma.systemVoice.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  createSystemVoice(input: AdminSystemVoiceUpsertInput) {
    return this.prisma.systemVoice.create({ data: input });
  }

  async updateSystemVoice(id: string, input: Partial<AdminSystemVoiceUpsertInput>) {
    const row = await this.prisma.systemVoice.findUnique({ where: { id } });
    if (row == null) throw AppException.notFound('System voice not found');
    return this.prisma.systemVoice.update({ where: { id }, data: input });
  }

  listFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async patchFeatureFlag(key: string, input: AdminFeatureFlagPatchInput) {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (row == null) throw AppException.notFound('Feature flag not found');
    return this.prisma.featureFlag.update({ where: { key }, data: { enabled: input.enabled } });
  }

  private meta(page: number, pageSize: number, totalItems: number): PaginatedMeta {
    return { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
  }
}
