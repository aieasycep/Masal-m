import { z } from 'zod';
import { DevicePlatform, NotificationType } from '@masalim/types';
import { paginationQuerySchema } from './common';

export const notificationTypeSchema = z.nativeEnum(NotificationType);
export const devicePlatformSchema = z.nativeEnum(DevicePlatform);

/** Mirrors expo-server-sdk's `Expo.isExpoPushToken` without importing it. */
export const expoPushTokenSchema = z
  .string()
  .max(512)
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/, 'invalid_expo_push_token');

export const registerDeviceSchema = z.object({
  expoPushToken: expoPushTokenSchema,
  platform: devicePlatformSchema,
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const removeDeviceSchema = z.object({
  expoPushToken: expoPushTokenSchema,
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
