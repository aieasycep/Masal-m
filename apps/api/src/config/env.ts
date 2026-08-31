import { z } from 'zod';

const providerEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values as unknown as [T[number], ...T[number][]]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    API_PORT: z.coerce.number().int().default(3001),
    API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    JWT_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    APPLE_BUNDLE_ID: z.string().default('com.masalim.app'),
    GOOGLE_CLIENT_ID: z.string().default(''),

    STORAGE_PROVIDER: providerEnum(['s3', 'local']).default('s3'),
    STORAGE_BUCKET: z.string().default('masalim-media'),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().default(900),
    STORAGE_LOCAL_DIR: z.string().default('.local-storage'),

    AI_PROVIDER: providerEnum(['mock', 'anthropic', 'openai']).default('mock'),
    AI_API_KEY: z.string().default(''),
    AI_MODEL: z.string().default('claude-opus-5'),
    MODERATION_PROVIDER: providerEnum(['mock', 'llm', 'openai']).default('mock'),
    MODERATION_MODEL: z.string().default('claude-opus-5'),
    TTS_PROVIDER: providerEnum(['mock', 'elevenlabs']).default('mock'),
    TTS_API_KEY: z.string().default(''),
    TTS_MODEL: z.string().default('eleven_v3'),
    VOICE_CLONE_PROVIDER: providerEnum(['mock', 'elevenlabs']).default('mock'),
    VOICE_CLONE_API_KEY: z.string().default(''),
    IMAGE_PROVIDER: providerEnum(['mock', 'openai']).default('mock'),
    IMAGE_API_KEY: z.string().default(''),
    IMAGE_MODEL: z.string().default('gpt-image-1'),
    VOICE_RAW_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

    PAYMENT_PROVIDER: providerEnum(['mock', 'iyzico']).default('mock'),
    IYZICO_API_KEY: z.string().default(''),
    IYZICO_SECRET: z.string().default(''),
    IYZICO_BASE_URL: z.string().default('https://sandbox-api.iyzipay.com'),
    SUBSCRIPTION_PROVIDER: providerEnum(['mock', 'revenuecat']).default('mock'),
    REVENUECAT_WEBHOOK_SECRET: z.string().default(''),
    PRINT_PROVIDER: providerEnum(['mock']).default('mock'),

    PUSH_PROVIDER: providerEnum(['mock', 'expo']).default('mock'),
    EXPO_ACCESS_TOKEN: z.string().default(''),

    MAIL_PROVIDER: providerEnum(['mock', 'smtp']).default('mock'),
    MAIL_FROM: z.string().default('no-reply@masalim.app'),
    SMTP_URL: z.string().default(''),

    SENTRY_DSN: z.string().default(''),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

    MIN_SUPPORTED_APP_VERSION: z.string().default('0.1.0'),
    LATEST_APP_VERSION: z.string().default('0.1.0'),
    IOS_STORE_URL: z.string().default(''),
    ANDROID_STORE_URL: z.string().default(''),

    WORKER_MODE: z.enum(['inline', 'separate', 'worker-only']).default('inline'),
    FFMPEG_PATH: z.string().default(''),
    /** Chromium binary for the print-PDF worker; empty = auto-detect. */
    CHROMIUM_PATH: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    // Mocks must be impossible to run in production (§61).
    if (env.NODE_ENV === 'production') {
      const mockChecks: Array<[string, string]> = [
        ['AI_PROVIDER', env.AI_PROVIDER],
        ['MODERATION_PROVIDER', env.MODERATION_PROVIDER],
        ['TTS_PROVIDER', env.TTS_PROVIDER],
        ['VOICE_CLONE_PROVIDER', env.VOICE_CLONE_PROVIDER],
        ['IMAGE_PROVIDER', env.IMAGE_PROVIDER],
        ['PAYMENT_PROVIDER', env.PAYMENT_PROVIDER],
        ['SUBSCRIPTION_PROVIDER', env.SUBSCRIPTION_PROVIDER],
        ['PUSH_PROVIDER', env.PUSH_PROVIDER],
        ['MAIL_PROVIDER', env.MAIL_PROVIDER],
      ];
      for (const [key, value] of mockChecks) {
        if (value === 'mock') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key}=mock is not allowed in production`,
          });
        }
      }
      if (env.STORAGE_PROVIDER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_PROVIDER'],
          message: 'STORAGE_PROVIDER=local is not allowed in production',
        });
      }
      // PRINT_PROVIDER intentionally allows mock everywhere until a Turkish
      // print API is selected (§33); the flow is feature-flagged.
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
