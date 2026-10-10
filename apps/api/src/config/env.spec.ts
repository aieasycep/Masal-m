import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://masalim:masalim@localhost:5432/masalim',
  JWT_SECRET: 'local-jwt-secret-0123456789',
};

describe('loadEnv', () => {
  it('parses STORAGE_FORCE_PATH_STYLE strings as real booleans', () => {
    expect(loadEnv({ ...base, STORAGE_FORCE_PATH_STYLE: 'false' }).STORAGE_FORCE_PATH_STYLE).toBe(
      false,
    );
    expect(loadEnv({ ...base, STORAGE_FORCE_PATH_STYLE: 'true' }).STORAGE_FORCE_PATH_STYLE).toBe(
      true,
    );
    expect(loadEnv({ ...base, STORAGE_FORCE_PATH_STYLE: '' }).STORAGE_FORCE_PATH_STYLE).toBe(false);
    expect(loadEnv(base).STORAGE_FORCE_PATH_STYLE).toBe(false);
  });

  it('does not require the unused JWT_REFRESH_SECRET', () => {
    expect(() => loadEnv(base)).not.toThrow();
  });

  it('refuses a real provider without its credential', () => {
    expect(() => loadEnv({ ...base, TTS_PROVIDER: 'elevenlabs' })).toThrow(/TTS_API_KEY/);
    expect(() => loadEnv({ ...base, AI_PROVIDER: 'anthropic' })).toThrow(/AI_API_KEY/);
    expect(() => loadEnv({ ...base, MODERATION_PROVIDER: 'llm' })).toThrow(/AI_API_KEY/);
    expect(() => loadEnv({ ...base, IMAGE_PROVIDER: 'openai' })).toThrow(/IMAGE_API_KEY/);
    expect(() => loadEnv({ ...base, SUBSCRIPTION_PROVIDER: 'revenuecat' })).toThrow(
      /REVENUECAT_WEBHOOK_SECRET/,
    );
    expect(() => loadEnv({ ...base, PAYMENT_PROVIDER: 'iyzico' })).toThrow(/IYZICO_API_KEY/);
  });

  it('accepts a real provider once its credential is present', () => {
    expect(() =>
      loadEnv({ ...base, TTS_PROVIDER: 'elevenlabs', TTS_API_KEY: 'el-key' }),
    ).not.toThrow();
    expect(() =>
      loadEnv({ ...base, AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-ant' }),
    ).not.toThrow();
  });
});
