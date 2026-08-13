import { Global, Module } from '@nestjs/common';
import { createStorageProvider, StorageProvider } from '@masalim/storage';
import { ExpoPushProvider, MockPushProvider, PushProvider } from '@masalim/notifications';
import {
  AnthropicStoryProvider,
  ElevenLabsTtsProvider,
  LlmContentModerator,
  MockContentModerator,
  MockStoryProvider,
  MockTtsProvider,
  OpenAIStoryProvider,
  ContentModerator,
  StoryGenerationProvider,
  TextToSpeechProvider,
} from '@masalim/ai';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

export const STORAGE = Symbol('STORAGE');
export const PUSH = Symbol('PUSH');
export const STORY_AI = Symbol('STORY_AI');
export const MODERATOR = Symbol('MODERATOR');
export const TTS = Symbol('TTS');

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
    {
      provide: STORY_AI,
      inject: [ENV],
      useFactory: (env: Env): StoryGenerationProvider => {
        switch (env.AI_PROVIDER) {
          case 'anthropic':
            return new AnthropicStoryProvider({ apiKey: env.AI_API_KEY, model: env.AI_MODEL });
          case 'openai':
            return new OpenAIStoryProvider({ apiKey: env.AI_API_KEY, model: env.AI_MODEL });
          case 'mock':
            return new MockStoryProvider();
        }
      },
    },
    {
      provide: MODERATOR,
      inject: [ENV],
      useFactory: (env: Env): ContentModerator =>
        env.MODERATION_PROVIDER === 'llm'
          ? new LlmContentModerator({ apiKey: env.AI_API_KEY, model: env.MODERATION_MODEL })
          : new MockContentModerator(),
    },
    {
      provide: TTS,
      inject: [ENV],
      useFactory: (env: Env): TextToSpeechProvider =>
        env.TTS_PROVIDER === 'elevenlabs'
          ? new ElevenLabsTtsProvider({ apiKey: env.TTS_API_KEY, modelId: env.TTS_MODEL })
          : new MockTtsProvider(),
    },
    MailService,
  ],
  exports: [STORAGE, PUSH, STORY_AI, MODERATOR, TTS, MailService],
})
export class ProvidersModule {}
