import 'reflect-metadata';
import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  if (env.TRUST_PROXY > 0) {
    // Behind nginx every request arrives from 127.0.0.1 — without this the
    // throttler and login lockout would count the proxy, not the client.
    app.set('trust proxy', env.TRUST_PROXY);
  }
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  const isLocal = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  if (isLocal) {
    const config = new DocumentBuilder()
      .setTitle('Masalım API')
      .setDescription('AI-personalized children stories — REST API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document));
  }

  await app.listen(env.API_PORT);

  const mockCommerce = env.SUBSCRIPTION_PROVIDER === 'mock' || env.PAYMENT_PROVIDER === 'mock';
  if (env.NODE_ENV !== 'production' && mockCommerce) {
    new NestLogger('Bootstrap').warn(
      'TEST MODU: sahte satın alma/ödeme uçları açık (mock purchase/payment). ' +
        'Canlıya geçmeden NODE_ENV=production + gerçek sağlayıcılar — bkz. docs/go-live.md',
    );
  }
}

void bootstrap();
