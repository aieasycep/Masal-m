import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  listNotificationsQuerySchema,
  registerDeviceSchema,
  removeDeviceSchema,
  NotificationItem,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

class RegisterDeviceDto extends createZodDto(registerDeviceSchema) {}
class RemoveDeviceDto extends createZodDto(removeDeviceSchema) {}
class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @HttpCode(204)
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RegisterDeviceDto,
  ): Promise<void> {
    await this.notifications.registerDevice(user.id, body);
  }

  @Delete('devices')
  @HttpCode(204)
  async removeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RemoveDeviceDto,
  ): Promise<void> {
    await this.notifications.removeDevice(user.id, body.expoPushToken);
  }

  @Get('notifications')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Post('notifications/:id/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<NotificationItem> {
    return this.notifications.markRead(user.id, id);
  }
}
