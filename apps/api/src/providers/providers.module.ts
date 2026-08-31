import { Global, Module } from '@nestjs/common';
import { createStorageProvider, StorageProvider } from '@masalim/storage';
import { ExpoPushProvider, MockPushProvider, PushProvider } from '@masalim/notifications';
import {
  AnthropicStoryProvider,
  ElevenLabsTtsProvider,
  ElevenLabsVoiceCloneProvider,
  LlmContentModerator,
  MockContentModerator,
  MockImageProvider,
  MockStoryProvider,
  MockTtsProvider,
  MockVoiceCloneProvider,
  NarrationDirector,
  OpenAIContentModerator,
  OpenAIImageProvider,
  OpenAIStoryProvider,
  ContentModerator,
  ImageGenerationProvider,
  StoryGenerationProvider,
  TextToSpeechProvider,
  VoiceCloneProvider,
} from '@masalim/ai';
import {
  IyzicoPaymentProvider,
  MockPaymentProvider,
  MockPrintProvider,
  PaymentProvider,
  PrintProvider,
} from '@masalim/payments';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

export const STORAGE = Symbol('STORAGE');
export const PUSH = Symbol('PUSH');
export const STORY_AI = Symbol('STORY_AI');
export const MODERATOR = Symbol('MODERATOR');
export const TTS = Symbol('TTS');
export const NARRATION_DIRECTOR = Symbol('NARRATION_DIRECTOR');
export const VOICE_CLONE = Symbol('VOICE_CLONE');
export const IMAGE_AI = Symbol('IMAGE_AI');
export const PAYMENT = Symbol('PAYMENT');
export const PRINT = Symbol('PRINT');

// AI_MODEL/MODERATION_MODEL default to Claude-named models, so a provider switch
// with a stale model value would send e.g. "claude-opus-5" to OpenAI and fail every
// request. Cross-vendor values fall back to the vendor's default instead.
const modelForVendor = (
  model: string,
  vendor: 'anthropic' | 'openai',
  fallback: string,
): string => {
  const isClaude = model.startsWith('claude');
  const matchesVendor = vendor === 'anthropic' ? isClaude : !isClaude;
  return matchesVendor ? model : fallback;
};

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
            return new AnthropicStoryProvider({
              apiKey: env.AI_API_KEY,
              model: modelForVendor(env.AI_MODEL, 'anthropic', 'claude-opus-5'),
            });
          case 'openai':
            return new OpenAIStoryProvider({
              apiKey: env.AI_API_KEY,
              model: modelForVendor(env.AI_MODEL, 'openai', 'gpt-4o'),
            });
          case 'mock':
            return new MockStoryProvider();
        }
      },
    },
    {
      provide: MODERATOR,
      inject: [ENV],
      useFactory: (env: Env): ContentModerator => {
        switch (env.MODERATION_PROVIDER) {
          case 'llm':
            return new LlmContentModerator({
              apiKey: env.AI_API_KEY,
              model: modelForVendor(env.MODERATION_MODEL, 'anthropic', 'claude-opus-5'),
            });
          case 'openai':
            return new OpenAIContentModerator({
              apiKey: env.AI_API_KEY,
              model: modelForVendor(env.MODERATION_MODEL, 'openai', 'gpt-4o-mini'),
            });
          case 'mock':
            return new MockContentModerator();
        }
      },
    },
    {
      provide: TTS,
      inject: [ENV],
      useFactory: (env: Env): TextToSpeechProvider =>
        env.TTS_PROVIDER === 'elevenlabs'
          ? new ElevenLabsTtsProvider({ apiKey: env.TTS_API_KEY, modelId: env.TTS_MODEL })
          : new MockTtsProvider(),
    },
    {
      // Annotates narration chunks with v3 audio tags before TTS. Null when no
      // real story-LLM key is configured — narration then runs untagged.
      provide: NARRATION_DIRECTOR,
      inject: [ENV],
      useFactory: (env: Env): NarrationDirector | null =>
        env.AI_PROVIDER === 'mock' || env.AI_API_KEY === ''
          ? null
          : new NarrationDirector({ provider: env.AI_PROVIDER, apiKey: env.AI_API_KEY }),
    },
    {
      provide: VOICE_CLONE,
      inject: [ENV],
      useFactory: (env: Env): VoiceCloneProvider =>
        env.VOICE_CLONE_PROVIDER === 'elevenlabs'
          ? new ElevenLabsVoiceCloneProvider({ apiKey: env.VOICE_CLONE_API_KEY })
          : new MockVoiceCloneProvider(),
    },
    {
      provide: IMAGE_AI,
      inject: [ENV],
      useFactory: (env: Env): ImageGenerationProvider =>
        env.IMAGE_PROVIDER === 'openai'
          ? new OpenAIImageProvider({ apiKey: env.IMAGE_API_KEY, model: env.IMAGE_MODEL })
          : new MockImageProvider(),
    },
    {
      provide: PAYMENT,
      inject: [ENV],
      useFactory: (env: Env): PaymentProvider =>
        env.PAYMENT_PROVIDER === 'iyzico'
          ? new IyzicoPaymentProvider({
              apiKey: env.IYZICO_API_KEY,
              secretKey: env.IYZICO_SECRET,
              baseUrl: env.IYZICO_BASE_URL,
            })
          : new MockPaymentProvider(),
    },
    {
      provide: PRINT,
      inject: [ENV],
      useFactory: (env: Env): PrintProvider =>
        // No Turkish print API selected yet (§33) — mock everywhere; real
        // integrations implement PrintProvider (docs/providers.md).
        new MockPrintProvider({ stageSeconds: env.NODE_ENV === 'development' ? 20 : 3600 }),
    },
    MailService,
  ],
  exports: [
    STORAGE,
    PUSH,
    STORY_AI,
    MODERATOR,
    TTS,
    NARRATION_DIRECTOR,
    VOICE_CLONE,
    IMAGE_AI,
    PAYMENT,
    PRINT,
    MailService,
  ],
})
export class ProvidersModule {}
