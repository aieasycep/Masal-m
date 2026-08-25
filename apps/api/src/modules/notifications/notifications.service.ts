import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@masalim/types';
import type { PushProvider } from '@masalim/notifications';
import type {
  NotificationItem,
  PaginationQuery,
  RegisterDeviceInput,
} from '@masalim/validation';
import type { Notification as NotificationRow } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { PUSH } from '../../providers/providers.module';
import { notificationCopy } from './notification-copy';

/**
 * Job-completion notifications (§7): one in-app row + Expo push to every
 * registered device; dead tokens reported by the provider are pruned.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH) private readonly push: PushProvider,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    context: { storyTitle?: string; voiceName?: string; orderNumber?: string },
    route: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, deletedAt: true, notificationPrefs: true },
    });
    if (user == null || user.deletedAt != null) return;

    const copy = notificationCopy(user.locale, type, context);
    const payload = { ...data, type, route };

    await this.prisma.notification.create({
      data: { userId, type, title: copy.title, body: copy.body, data: payload },
    });

    // Per-category opt-out (Settings/04): absent key = enabled; only push is
    // suppressed — the in-app inbox row above is always written.
    const prefs = (user.notificationPrefs as Record<string, boolean> | null) ?? {};
    if (prefs[type] === false) return;

    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (devices.length === 0) return;

    try {
      const report = await this.push.send(
        devices.map((device) => ({
          expoPushToken: device.expoPushToken,
          title: copy.title,
          body: copy.body,
          data: payload,
        })),
      );
      if (report.deadTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { expoPushToken: { in: report.deadTokens } },
        });
      }
    } catch (error) {
      // Push failure must never fail the calling job — the in-app row is durable.
      this.logger.warn({ err: error as Error, userId, type }, 'push send failed');
    }
  }

  async list(
    userId: string,
    query: PaginationQuery,
  ): Promise<{ items: NotificationItem[]; meta: { page: number; pageSize: number; totalItems: number; totalPages: number } }> {
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return {
      items: rows.map((row) => this.toDto(row)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationItem> {
    const row = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (row == null) throw AppException.notFound('Notification not found');
    if (row.userId !== userId) throw AppException.forbiddenOwnership();
    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: row.readAt ?? new Date() },
    });
    return this.toDto(updated);
  }

  async registerDevice(userId: string, input: RegisterDeviceInput): Promise<void> {
    // A token moving between accounts (sign-out → sign-in) is reassigned.
    await this.prisma.deviceToken.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: { userId, expoPushToken: input.expoPushToken, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  async removeDevice(userId: string, expoPushToken: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, expoPushToken } });
  }

  private toDto(row: NotificationRow): NotificationItem {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: (row.data ?? {}) as Record<string, unknown>,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
