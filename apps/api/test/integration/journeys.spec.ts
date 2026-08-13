import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

jest.setTimeout(120_000);

const V = ['x-app-version', '0.1.0'] as const;

interface Session {
  token: string;
  refresh: string;
  userId: string;
}

/**
 * Integration journeys (§12) against the real module graph with mock
 * providers and inline workers. Requires Postgres + Redis (docker compose /
 * CI services) with migrations + seed applied.
 */
describe('critical journeys (integration)', () => {
  let app: INestApplication;
  let http: () => request.Agent;

  const register = async (tag: string): Promise<Session> => {
    const res = await http()
      .post('/auth/register')
      .set(...V)
      .send({
        email: `it-${tag}-${Date.now()}@test.local`,
        password: 'parola-123456',
        name: 'Test Ebeveyn',
      })
      .expect(201);
    return {
      token: res.body.tokens.accessToken,
      refresh: res.body.tokens.refreshToken,
      userId: res.body.user.id,
    };
  };

  const waitForJob = async (session: Session, jobId: string): Promise<string> => {
    for (let i = 0; i < 40; i++) {
      const res = await http()
        .get(`/jobs/${jobId}`)
        .set(...V)
        .set('Authorization', `Bearer ${session.token}`)
        .expect(200);
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(res.body.status)) {
        return res.body.status;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return 'TIMEOUT';
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, reads /users/me, rotates refresh tokens and rejects reuse', async () => {
    const session = await register('auth');

    await http()
      .get('/users/me')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);

    const rotated = await http()
      .post('/auth/refresh')
      .set(...V)
      .send({ refreshToken: session.refresh })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(rotated.body.refreshToken).not.toBe(session.refresh);

    // Reusing the consumed token must fail (family revocation §11).
    await http()
      .post('/auth/refresh')
      .set(...V)
      .send({ refreshToken: session.refresh })
      .expect(401);
  });

  it('enforces ownership: another user gets 403 on a foreign child (IDOR §79)', async () => {
    const owner = await register('idor-a');
    const stranger = await register('idor-b');
    const child = await http()
      .post('/children')
      .set(...V)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Ege', ageRange: 'AGE_3_5', interests: ['uzay'], preferences: {} })
      .expect(201);

    await http()
      .get(`/children/${child.body.id}`)
      .set(...V)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);
  });

  it('two-phase story flow: draft → generate (idempotent) → READY with pages; quota counts', async () => {
    const session = await register('story');
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        childId: null,
        heroName: 'Luna',
        heroType: 'FANTASY',
        themes: ['SLEEP', 'FANTASY'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advanced: {},
        language: 'tr',
      })
      .expect(201);

    const gen1 = await http()
      .post(`/stories/${draft.body.id}/generate`)
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(201);
    const gen2 = await http()
      .post(`/stories/${draft.body.id}/generate`)
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(201);
    expect(gen2.body.jobId).toBe(gen1.body.jobId); // double submit → same job

    expect(await waitForJob(session, gen1.body.jobId)).toBe('SUCCEEDED');

    const detail = await http()
      .get(`/stories/${draft.body.id}`)
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(detail.body.status).toBe('READY');
    expect(detail.body.moderationStatus).toBe('APPROVED');
    expect(detail.body.pages.length).toBeGreaterThanOrEqual(3);

    const entitlements = await http()
      .get('/subscription/entitlements')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(entitlements.body.plan).toBe('FREE');
    expect(entitlements.body.quotas.story_monthly_limit.used).toBe(1);
  });

  it('rejects blocklisted ideas at enqueue without consuming quota (§17)', async () => {
    const session = await register('moderation');
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        childId: null,
        heroName: 'Ege',
        heroType: 'CHILD',
        themes: ['SLEEP'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        customPrompt: 'uyuşturucu hakkında bir hikâye',
        advanced: {},
        language: 'tr',
      })
      .expect(201);

    const rejected = await http()
      .post(`/stories/${draft.body.id}/generate`)
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(422);
    expect(rejected.body.error.code).toBe('MODERATION_REJECTED');

    const entitlements = await http()
      .get('/subscription/entitlements')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(entitlements.body.quotas.story_monthly_limit.used).toBe(0);
  });

  it('gates voice cloning on consent (literal true) and premium entitlement (§21/§36)', async () => {
    const session = await register('voice');

    // consentAccepted must be the literal true — schema rejects false.
    await http()
      .post('/voices')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        ownerType: 'MOTHER',
        displayName: 'Annemin Sesi',
        recordingObjectKey: `users/${session.userId}/voice-recordings/r.m4a`,
        recordingDurationSeconds: 60,
        consentAccepted: false,
      })
      .expect(400);

    // FREE plan → ENTITLEMENT_REQUIRED before any processing.
    const gated = await http()
      .post('/voices')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        ownerType: 'MOTHER',
        displayName: 'Annemin Sesi',
        recordingObjectKey: `users/${session.userId}/voice-recordings/r.m4a`,
        recordingDurationSeconds: 60,
        consentAccepted: true,
      })
      .expect(403);
    expect(gated.body.error.code).toBe('ENTITLEMENT_REQUIRED');
  });

  it('quotes orders server-side and dedupes creation by Idempotency-Key (§78/§82)', async () => {
    const session = await register('order');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;

    // story → book → render (mock pipeline) so an orderable book exists
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set(...auth)
      .send({
        childId: null,
        heroName: 'Derin',
        heroType: 'CHILD',
        themes: ['SEA'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advanced: {},
        language: 'tr',
      })
      .expect(201);
    const gen = await http()
      .post(`/stories/${draft.body.id}/generate`)
      .set(...V)
      .set(...auth)
      .expect(201);
    expect(await waitForJob(session, gen.body.jobId)).toBe('SUCCEEDED');

    const book = await http()
      .post('/books')
      .set(...V)
      .set(...auth)
      .send({ storyId: draft.body.id })
      .expect(201);
    const render = await http()
      .post(`/books/${book.body.id}/render`)
      .set(...V)
      .set(...auth)
      .send({ kind: 'print_pdf' })
      .expect(201);
    expect(await waitForJob(session, render.body.jobId)).toBe('SUCCEEDED');

    const quote = await http()
      .post('/orders/quote')
      .set(...V)
      .set(...auth)
      .send({ bookId: book.body.id, quantity: 1, bookSize: 'SQUARE', coverType: 'HARDCOVER' })
      .expect(201);
    expect(quote.body.subtotal).toBe('649.00');
    expect(quote.body.total).toBe('728.90');

    const address = await http()
      .post('/addresses')
      .set(...V)
      .set(...auth)
      .send({
        fullName: 'Deniz Yılmaz',
        phone: '05321234567',
        addressLine: 'Bağdat Caddesi No: 42 D: 5 Küçükyalı',
        city: 'İstanbul',
        district: 'Maltepe',
        postalCode: '34840',
        isDefault: true,
      })
      .expect(201);

    const idempotencyKey = `it-order-${Date.now()}`;
    const payload = {
      bookId: book.body.id,
      quantity: 1,
      bookSize: 'SQUARE',
      coverType: 'HARDCOVER',
      shippingAddressId: address.body.id,
    };
    const first = await http()
      .post('/orders')
      .set(...V)
      .set(...auth)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);
    const second = await http()
      .post('/orders')
      .set(...V)
      .set(...auth)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);
    expect(second.body.id).toBe(first.body.id);

    // Missing key is refused outright.
    await http()
      .post('/orders')
      .set(...V)
      .set(...auth)
      .send(payload)
      .expect(400);
  });
});
