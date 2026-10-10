import type { INestApplication } from '@nestjs/common';
import type Redis from 'ioredis';
import type request from 'supertest';
import type { StorageProvider } from '@masalim/storage';
import { ENV } from '../../src/config/config.module';
import { loadEnv } from '../../src/config/env';
import { REDIS } from '../../src/redis/redis.module';
import { STORAGE } from '../../src/providers/providers.module';
import { MailService, type MailMessage } from '../../src/providers/mail.service';
import { createApp, V, type Session, type TestApp } from './helpers';

jest.setTimeout(120_000);

/**
 * Auth hardening journeys with a REAL mailer configured (MAIL_PROVIDER=smtp):
 * e-mail verification gates the signup gift, Apple sign-in needs a
 * server-issued nonce, and avatar keys must point at an uploaded object.
 * The mailer itself is swapped for a capturing fake so the code can be read
 * back; ENV is overridden only inside this app, other journeys stay in mock.
 */
describe('auth hardening journeys (integration, smtp mode)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let http: () => request.Agent;
  let register: (tag: string) => Promise<Session>;

  const capturingMail = {
    last: null as MailMessage | null,
    sent: [] as MailMessage[],
    async send(message: MailMessage): Promise<void> {
      capturingMail.last = message;
      capturingMail.sent.push(message);
    },
  };

  beforeAll(async () => {
    testApp = await createApp((builder) =>
      builder
        .overrideProvider(ENV)
        .useValue({ ...loadEnv(process.env), MAIL_PROVIDER: 'smtp', SMTP_URL: 'smtp://test' })
        .overrideProvider(MailService)
        .useValue(capturingMail),
    );
    ({ app, http, register } = testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const codeFrom = (message: MailMessage | null): string => {
    const code = /(\d{6})/.exec(message?.text ?? '')?.[1];
    if (code == null) throw new Error('no verification code in the captured mail');
    return code;
  };

  it('advertises that verification is required in this configuration', async () => {
    const config = await http()
      .get('/app/config')
      .set(...V)
      .expect(200);
    expect(config.body.emailVerificationRequired).toBe(true);
  });

  it('e-mail verification: gift withheld until the mailed code is confirmed, then granted once', async () => {
    const session = await register('verify');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;
    const me = async () =>
      (
        await http()
          .get('/users/me')
          .set(...V)
          .set(...auth)
          .expect(200)
      ).body as { emailVerified: boolean };
    const balance = async () =>
      (
        await http()
          .get('/subscription/entitlements')
          .set(...V)
          .set(...auth)
          .expect(200)
      ).body.credits.balance as number;

    // Registration mailed the first code and withheld the gift.
    expect(capturingMail.last?.subject).toContain('doğrulama');
    const registrationCode = codeFrom(capturingMail.last);
    expect((await me()).emailVerified).toBe(false);
    expect(await balance()).toBe(0);

    // A resend right after registration sits inside the cooldown.
    const throttled = await http()
      .post('/auth/email/verification')
      .set(...V)
      .set(...auth)
      .expect(429);
    expect(throttled.body.error.code).toBe('RATE_LIMITED');
    expect(throttled.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    // Once the cooldown lapses a new code goes out and retires the old one.
    await app.get<Redis>(REDIS).del(`auth:verify-send:${session.userId}`);
    const resent = await http()
      .post('/auth/email/verification')
      .set(...V)
      .set(...auth)
      .expect(200);
    expect(resent.body).toEqual({ sent: true, cooldownSeconds: 60 });
    const code = codeFrom(capturingMail.last);
    expect(code).not.toBe(registrationCode);

    const wrong = await http()
      .post('/auth/email/verify')
      .set(...V)
      .set(...auth)
      .send({ code: registrationCode })
      .expect(400);
    expect(wrong.body.error.code).toBe('AUTH_RESET_CODE_INVALID');
    await http()
      .post('/auth/email/verify')
      .set(...V)
      .set(...auth)
      .send({ code: 'abcdef' })
      .expect(400); // schema: six digits

    const verified = await http()
      .post('/auth/email/verify')
      .set(...V)
      .set(...auth)
      .send({ code })
      .expect(200);
    expect(verified.body).toEqual({ verified: true, giftGranted: true });
    expect((await me()).emailVerified).toBe(true);
    expect(await balance()).toBe(6);

    // Idempotent afterwards: no second gift, nothing more to send.
    const again = await http()
      .post('/auth/email/verify')
      .set(...V)
      .set(...auth)
      .send({ code })
      .expect(200);
    expect(again.body).toEqual({ verified: true, giftGranted: false });
    const noop = await http()
      .post('/auth/email/verification')
      .set(...V)
      .set(...auth)
      .expect(200);
    expect(noop.body).toEqual({ sent: false, cooldownSeconds: 0 });
    expect(await balance()).toBe(6);
  });

  it('e-mail verification routes require a session', async () => {
    await http()
      .post('/auth/email/verification')
      .set(...V)
      .expect(401);
    await http()
      .post('/auth/email/verify')
      .set(...V)
      .send({ code: '123456' })
      .expect(401);
  });

  it('Apple sign-in: unknown nonce is refused before Apple is asked; an issued nonce is single-use', async () => {
    const unknown = await http()
      .post('/auth/apple')
      .set(...V)
      .send({ identityToken: 'x'.repeat(20), nonce: 'y'.repeat(32) })
      .expect(401);
    expect(unknown.body.error.code).toBe('AUTH_PROVIDER_TOKEN_INVALID');
    expect(unknown.body.error.message).toBe('Unknown or replayed nonce');

    const issued = await http()
      .post('/auth/apple/nonce')
      .set(...V)
      .expect(200);
    expect(issued.body.nonce).toMatch(/^[0-9a-f]{64}$/);

    // The nonce is consumed and the (garbage) token reaches the verifier,
    // which rejects it offline — a malformed JWT never fetches Apple's keys.
    const consumed = await http()
      .post('/auth/apple')
      .set(...V)
      .send({ identityToken: 'x'.repeat(20), nonce: issued.body.nonce })
      .expect(401);
    expect(consumed.body.error.message).toBe('Apple identity token could not be verified');

    const replayed = await http()
      .post('/auth/apple')
      .set(...V)
      .send({ identityToken: 'x'.repeat(20), nonce: issued.body.nonce })
      .expect(401);
    expect(replayed.body.error.message).toBe('Unknown or replayed nonce');

    // A missing nonce is a schema error now, not an Apple round trip.
    await http()
      .post('/auth/apple')
      .set(...V)
      .send({ identityToken: 'x'.repeat(20) })
      .expect(400);
  });

  it('avatar keys must point at an uploaded object; a replaced avatar is deleted from storage', async () => {
    const session = await register('avatar');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;
    const storage = app.get<StorageProvider>(STORAGE);

    const dangling = await http()
      .patch('/users/me')
      .set(...V)
      .set(...auth)
      .send({ avatarObjectKey: `users/${session.userId}/avatars/missing` })
      .expect(400);
    expect(dangling.body.error.code).toBe('VALIDATION_FAILED');

    const upload = async (): Promise<string> => {
      const signed = await http()
        .post('/uploads/avatars')
        .set(...V)
        .set(...auth)
        .send({ contentType: 'image/png', contentLength: 4 })
        .expect(201);
      // Local provider: the signed URL points back at this API's dev-storage route.
      const url = new URL(signed.body.uploadUrl as string);
      await http()
        .put(`${url.pathname}${url.search}`)
        .set(...V)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('png!'))
        .expect(200);
      return signed.body.objectKey as string;
    };

    const first = await upload();
    const withAvatar = await http()
      .patch('/users/me')
      .set(...V)
      .set(...auth)
      .send({ avatarObjectKey: first })
      .expect(200);
    expect(withAvatar.body.avatarUrl).toEqual(expect.any(String));
    expect(await storage.exists(first)).toBe(true);

    const second = await upload();
    await http()
      .patch('/users/me')
      .set(...V)
      .set(...auth)
      .send({ avatarObjectKey: second })
      .expect(200);
    expect(await storage.exists(first)).toBe(false);
    expect(await storage.exists(second)).toBe(true);

    // Children share the rule.
    const child = await http()
      .post('/children')
      .set(...V)
      .set(...auth)
      .send({
        name: 'Ege',
        ageRange: 'AGE_3_5',
        interests: [],
        preferences: {},
        avatarObjectKey: `users/${session.userId}/avatars/missing`,
      })
      .expect(400);
    expect(child.body.error.code).toBe('VALIDATION_FAILED');
  });
});
