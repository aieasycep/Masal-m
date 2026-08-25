import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { NotificationType, OrderStatus } from '@masalim/types';
import type { PrintProvider, PrintOrderStatus } from '@masalim/payments';
import { PushRoutes } from '@masalim/notifications';
import { PrismaService } from '../../prisma/prisma.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PRINT } from '../../providers/providers.module';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from './orders.service';

const STATUS_MAP: Partial<Record<PrintOrderStatus, OrderStatus>> = {
  IN_PRODUCTION: OrderStatus.IN_PRODUCTION,
  SHIPPED: OrderStatus.SHIPPED,
  DELIVERED: OrderStatus.DELIVERED,
};

/**
 * Print-provider polling (§33): providers without webhooks are polled for
 * production/shipping transitions; SHIPPED triggers the tracking push. Real
 * webhook-capable providers can replace this loop behind the same interface.
 */
@Injectable()
export class PrintSyncService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrintSyncService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    @Inject(PRINT) private readonly printProvider: PrintProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.WORKER_MODE === 'separate') return;
    const intervalMs = this.env.NODE_ENV === 'development' ? 15_000 : 5 * 60_000;
    this.timer = setInterval(() => {
      this.sync().catch((error) =>
        this.logger.warn({ err: error as Error }, 'print sync tick failed'),
      );
    }, intervalMs);
    this.timer.unref();
  }

  async sync(): Promise<void> {
    const active = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.IN_PRODUCTION] },
        printProviderOrderId: { not: null },
      },
      take: 50,
    });
    for (const order of active) {
      const state = await this.printProvider.getOrder(order.printProviderOrderId as string);
      const mapped = STATUS_MAP[state.status];
      if (mapped == null || mapped === order.status) {
        if (state.trackingNumber != null && order.trackingNumber == null) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              trackingNumber: state.trackingNumber,
              carrier: state.carrier ?? undefined,
              trackingUrl: state.trackingUrl ?? undefined,
            },
          });
        }
        continue;
      }
      await this.orders.transition(order.id, mapped, {
        trackingNumber: state.trackingNumber ?? order.trackingNumber,
        carrier: state.carrier ?? order.carrier,
        trackingUrl: state.trackingUrl ?? order.trackingUrl,
      });
      if (mapped === OrderStatus.SHIPPED) {
        await this.notifications.notify(
          order.userId,
          NotificationType.ORDER_SHIPPED,
          { orderNumber: order.orderNumber },
          PushRoutes.orderShipped(order.id),
          { orderId: order.id },
        );
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.timer != null) clearInterval(this.timer);
  }
}
