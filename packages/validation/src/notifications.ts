import { z } from 'zod';
import { DevicePlatform, NotificationType } from '@masalim/types';
import { paginationQuerySchema } from './common';

export const notificationTypeSchema = z.nativeEnum(NotificationType);
export const devicePlatformSchema = z.nativeEnum(DevicePlatform);

export const registerDeviceSchema = z.object({
  expoPushToken: z.string().min(10).max(512),
  platform: devicePlatformSchema,
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const removeDeviceSchema = z.object({
  expoPushToken: z.string().min(10).max(512),
});
export type RemoveDeviceInput = z.infer<typeof removeDeviceSchema>;

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

export const listNotificationsQuerySchema = paginationQuerySchema;
