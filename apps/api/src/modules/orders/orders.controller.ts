import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import type { Request } from 'express';
import { OrderStatus } from '@masalim/types';
import {
  createOrderSchema,
  orderConfigurationSchema,
  type InitPaymentResponse,
  type Order,
  type OrderQuote,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';

class OrderConfigurationDto extends createZodDto(orderConfigurationSchema) {}
class CreateOrderDto extends createZodDto(createOrderSchema) {}

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OrderConfigurationDto,
  ): Promise<OrderQuote> {
    return this.orders.quote(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Order[]> {
    return this.orders.list(user.id);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<Order> {
    return this.orders.create(user.id, body, idempotencyKey ?? '');
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Order> {
    return this.orders.get(user.id, id);
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Order> {
    const order = await this.orders.findOwned(user.id, id);
    const wasPaid = order.status === OrderStatus.PAID;
    const cancelled = await this.orders.cancel(user.id, id);
    if (wasPaid) await this.payments.refundOrder(id);
    return cancelled;
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post(':id/payment')
  async initPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Ip() ip: string,
    @Req() req: Request,
  ): Promise<InitPaymentResponse> {
    void req;
    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, email: true },
    });
    return this.payments.initPayment(user.id, id, idempotencyKey ?? '', ip, me.email, me.name);
  }
}
