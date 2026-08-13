import { Inject, Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import type Redis from 'ioredis';
import type { Request } from 'express';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule, REDIS } from './redis/redis.module';
import { ProvidersModule } from './providers/providers.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { AppVersionMiddleware } from './common/middleware/app-version.middleware';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChildrenModule } from './modules/children/children.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { StoriesModule } from './modules/stories/stories.module';
import { VoicesModule } from './modules/voices/voices.module';
import { NarrationsModule } from './modules/narrations/narrations.module';
import { IllustrationsModule } from './modules/illustrations/illustrations.module';
import { BooksModule } from './modules/books/books.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) => (req as Request & { id?: string }).id,
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.refreshToken',
              'req.body.identityToken',
              'req.body.idToken',
            ],
            censor: '[REDACTED]',
          },
          autoLogging: { ignore: (req) => req.url === '/health' },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS, ENV],
      useFactory: (redis: Redis, env: Env) => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: 120 }],
        storage: new ThrottlerStorageRedisService(redis),
        // Integration tests share Redis with the dev server — rate limits
        // would leak between runs and flake the suite.
        skipIf: () => env.NODE_ENV === 'test',
      }),
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    RedisModule,
    ProvidersModule,
    JobsModule,
    AuthModule,
    UsersModule,
    ChildrenModule,
    UploadsModule,
    StoriesModule,
    VoicesModule,
    NarrationsModule,
    IllustrationsModule,
    BooksModule,
    AddressesModule,
    OrdersModule,
    AdminModule,
    AnalyticsModule,
    NotificationsModule,
    SubscriptionModule,
    AppConfigModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  constructor(@Inject(ENV) private readonly env: Env) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AppVersionMiddleware).exclude('app/config', 'health').forRoutes('*');
  }
}
