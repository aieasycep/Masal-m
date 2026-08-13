import { Global, Module } from '@nestjs/common';
import { createStorageProvider, type StorageProvider } from '@masalim/storage';
import { ExpoPushProvider, MockPushProvider, type PushProvider } from '@masalim/notifications';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

export const STORAGE = Symbol('STORAGE');
export const PUSH = Symbol('PUSH');

/**
 * Provider DI wiring — every external service is selected from env config here
 * and injected via interface tokens (§22/§61). AI providers are wired in their
 * feature modules (story generation, voices, illustrations) as those land.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env): StorageProvider =>
        createStorageProvider({
          provider: env.STORAGE_PROVIDER,
          bucket: env.STORAGE_BUCKET,
          region: env.STORAGE_REGION,
          endpoint: env.STORAGE_ENDPOINT,
          accessKeyId: env.STORAGE_ACCESS_KEY,
          secretAccessKey: env.STORAGE_SECRET_KEY,
          forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
          signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
          localRootDir: env.STORAGE_LOCAL_DIR,
          localBaseUrl: env.API_PUBLIC_URL,
        }),
    },
    {
      provide: PUSH,
      inject: [ENV],
      useFactory: (env: Env): PushProvider =>
        env.PUSH_PROVIDER === 'expo'
          ? new ExpoPushProvider({ accessToken: env.EXPO_ACCESS_TOKEN || undefined })
          : new MockPushProvider(),
    },
    MailService,
  ],
  exports: [STORAGE, PUSH, MailService],
})
export class ProvidersModule {}
