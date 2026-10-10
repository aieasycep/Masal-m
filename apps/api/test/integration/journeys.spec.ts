import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

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
    // SHORT story = 3 credits, drawn from the 3-credit FREE monthly quota;
    // the 6-credit signup gift balance stays untouched.
    expect(entitlements.body.credits.quota.used).toBe(3);
    expect(entitlements.body.credits.balance).toBe(6);
  });

  it('grants signup gift credits and sells credit packs through the mock store (§37)', async () => {
    const session = await register('credits');
    const before = await http()
      .get('/subscription/entitlements')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(before.body.credits.balance).toBe(6);

    const offerings = await http()
      .get('/subscription/offerings')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(offerings.body.subscription.productId).toBe('masalim_premium_monthly');
    const pack = offerings.body.packs.find(
      (item: { productId: string }) => item.productId === 'masalim_credits_12_std',
    );
    expect(pack?.credits).toBe(12);

    await http()
      .post('/subscription/mock/purchase')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ productId: 'masalim_credits_12_std' })
      .expect(201);
    const after = await http()
      .get('/subscription/entitlements')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    expect(after.body.credits.balance).toBe(18);
    expect(after.body.plan).toBe('FREE'); // consumable — plan unchanged
  });

  it('meters illustration regenerates: first set free, 1 credit each after, 402 when empty (§37)', async () => {
    const session = await register('regen');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;
    const entitlements = async () =>
      (
        await http()
          .get('/subscription/entitlements')
          .set(...V)
          .set(...auth)
          .expect(200)
      ).body as { credits: { quota: { used: number }; balance: number } };

    const draft = await http()
      .post('/stories')
      .set(...V)
      .set(...auth)
      .send({
        childId: null,
        heroName: 'Ada',
        heroType: 'CHILD',
        themes: ['ADVENTURE'],
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

    // First illustration set is included in the story price.
    const set = await http()
      .post(`/stories/${draft.body.id}/illustrations`)
      .set(...V)
      .set(...auth)
      .send({ style: 'WATERCOLOR' })
      .expect(201);
    expect(await waitForJob(session, set.body.jobId)).toBe('SUCCEEDED');
    const afterSet = await entitlements();
    expect(afterSet.credits.quota.used).toBe(3); // SHORT story only
    expect(afterSet.credits.balance).toBe(6); // gift untouched

    const sets = await http()
      .get(`/stories/${draft.body.id}/illustrations`)
      .set(...V)
      .set(...auth)
      .expect(200);
    const cover = sets.body[0].illustrations.find((item: { isCover: boolean }) => item.isCover);
    expect(cover).toBeDefined();

    // Every regenerate is metered at enqueue: six drain the six gift credits.
    let lastJobId = '';
    for (let i = 0; i < 6; i++) {
      const regen = await http()
        .post(`/illustrations/${cover.id}/regenerate`)
        .set(...V)
        .set(...auth)
        .expect(201);
      lastJobId = regen.body.jobId;
    }
    const drained = await entitlements();
    expect(drained.credits.balance).toBe(0);

    const refused = await http()
      .post(`/illustrations/${cover.id}/regenerate`)
      .set(...V)
      .set(...auth)
      .expect(402);
    expect(refused.body.error.code).toBe('INSUFFICIENT_CREDITS');

    // The paid attempts still complete; each one adds a cover alternative.
    expect(await waitForJob(session, lastJobId)).toBe('SUCCEEDED');
    const finalSets = await http()
      .get(`/stories/${draft.body.id}/illustrations`)
      .set(...V)
      .set(...auth)
      .expect(200);
    const covers = finalSets.body[0].illustrations.filter(
      (item: { isCover: boolean }) => item.isCover,
    );
    expect(covers.length).toBe(7);
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
    expect(entitlements.body.credits.quota.used).toBe(0);
    expect(entitlements.body.credits.balance).toBe(6);
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

    // Launch gate: print ordering ships disabled (physical_books seed) and the
    // API must refuse. The rest of the journey runs with the flag switched on,
    // exactly what the admin toggle will do when printing launches.
    const prisma = app.get(PrismaService);
    await prisma.featureFlag.update({
      where: { key: 'physical_books' },
      data: { enabled: false },
    });
    const gated = await http()
      .post('/orders/quote')
      .set(...V)
      .set(...auth)
      .send({
        bookId: 'cnonexistent12345',
        quantity: 1,
        bookSize: 'SQUARE',
        coverType: 'HARDCOVER',
      })
      .expect(403);
    expect(gated.body.error.code).toBe('FEATURE_DISABLED');
    await prisma.featureFlag.update({
      where: { key: 'physical_books' },
      data: { enabled: true },
    });

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

  // ── Security audit journeys (Oct 2026) ─────────────────────────────────────

  const generateShortStory = async (session: Session): Promise<string> => {
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({
        childId: null,
        heroName: 'Ada',
        heroType: 'CHILD',
        themes: ['ADVENTURE'],
        ageRange: 'AGE_3_5',
        durationTarget: 'SHORT',
        advanced: {},
        language: 'tr',
      })
      .expect(201);
    const gen = await http()
      .post(`/stories/${draft.body.id}/generate`)
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .expect(201);
    expect(await waitForJob(session, gen.body.jobId)).toBe('SUCCEEDED');
    return draft.body.id as string;
  };

  it('first illustration set is free once per story — a title edit does not re-grant it', async () => {
    const session = await register('audit-credits');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;
    const storyId = await generateShortStory(session);

    await http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...V)
      .set(...auth)
      .send({ style: 'WATERCOLOR' })
      .expect(201);
    await http()
      .patch(`/stories/${storyId}`)
      .set(...V)
      .set(...auth)
      .send({ title: 'Yeni başlık' })
      .expect(200);
    await http()
      .post(`/stories/${storyId}/illustrations`)
      .set(...V)
      .set(...auth)
      .send({ style: 'PASTEL' })
      .expect(201);

    const entitlements = await http()
      .get('/subscription/entitlements')
      .set(...V)
      .set(...auth)
      .expect(200);
    // SHORT story: 3 from quota; first set included; second set = 2 extra credits.
    expect(entitlements.body.credits.quota.used).toBe(3);
    expect(entitlements.body.credits.balance).toBe(4);
  });

  it("rejects an avatar object key outside the caller's own prefix (403)", async () => {
    const victim = await register('audit-avatar-a');
    const attacker = await register('audit-avatar-b');
    await http()
      .patch('/users/me')
      .set(...V)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ avatarObjectKey: `users/${victim.userId}/stories/x/illustrations/y.png` })
      .expect(403);
    await http()
      .patch('/users/me')
      .set(...V)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ avatarObjectKey: `users/${attacker.userId}/avatars/../../${victim.userId}/a.png` })
      .expect(403);
  });

  it('moderates edited page text (blocklisted edit → 422, story untouched)', async () => {
    const session = await register('audit-edit');
    const auth = ['Authorization', `Bearer ${session.token}`] as const;
    const storyId = await generateShortStory(session);
    const before = await http()
      .get(`/stories/${storyId}`)
      .set(...V)
      .set(...auth)
      .expect(200);

    const res = await http()
      .patch(`/stories/${storyId}`)
      .set(...V)
      .set(...auth)
      .send({ pages: [{ pageNumber: 1, text: 'Bu sayfada cinayet var.' }] })
      .expect(422);
    expect(res.body.error.code).toBe('MODERATION_REJECTED');

    const after = await http()
      .get(`/stories/${storyId}`)
      .set(...V)
      .set(...auth)
      .expect(200);
    expect(after.body.version).toBe(before.body.version);
    expect(after.body.pages[0].text).toBe(before.body.pages[0].text);
  });

  it('password reset: a new code invalidates the previous one; 5 wrong attempts burn the code', async () => {
    const session = await register('audit-reset');
    const prisma = app.get(PrismaService);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

    await http()
      .post('/auth/password/forgot')
      .set(...V)
      .send({ email: me.email })
      .expect(200);
    await http()
      .post('/auth/password/forgot')
      .set(...V)
      .send({ email: me.email })
      .expect(200);
    const live = await prisma.passwordReset.count({
      where: { userId: session.userId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(live).toBe(1);

    for (let i = 0; i < 5; i++) {
      await http()
        .post('/auth/password/reset')
        .set(...V)
        .send({ email: me.email, code: `00000${i}`, newPassword: 'yeni-parola-123456' })
        .expect(400);
    }
    const stillLive = await prisma.passwordReset.count({
      where: { userId: session.userId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(stillLive).toBe(0);
  });

  it('account deletion: signing in during the grace period cancels it; the purge anonymizes the account', async () => {
    const session = await register('audit-delete');
    const prisma = app.get(PrismaService);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    const storyId = await generateShortStory(session);

    const requested = await http()
      .delete('/users/me')
      .set(...V)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ password: 'parola-123456', confirm: true })
      .expect(200);
    expect(requested.body.pendingDeletion).not.toBeNull();

    // Grace period: a password login reactivates the account.
    const login = await http()
      .post('/auth/login')
      .set(...V)
      .send({ email: me.email, password: 'parola-123456' })
      .expect(200);
    const reactivated = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(reactivated.deletedAt).toBeNull();

    // Request again, backdate the grace period, run the purge.
    await http()
      .delete('/users/me')
      .set(...V)
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .send({ password: 'parola-123456', confirm: true })
      .expect(200);
    await prisma.deletionRequest.updateMany({
      where: { userId: session.userId, status: 'PENDING' },
      data: { effectiveAt: new Date(Date.now() - 1000) },
    });
    const { AccountDeletionProcessor } =
      await import('../../src/modules/users/account-deletion.processor');
    const processor = app.get(AccountDeletionProcessor);
    expect(await processor.purge(session.userId)).toBe('purged');
    expect(await processor.purge(session.userId)).toBe('skipped');

    const purged = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(purged.email.startsWith('deleted-')).toBe(true);
    expect(purged.passwordHash).toBeNull();
    expect(await prisma.story.count({ where: { id: storyId } })).toBe(0);
    expect(await prisma.authIdentity.count({ where: { userId: session.userId } })).toBe(0);
    await http()
      .post('/auth/login')
      .set(...V)
      .send({ email: me.email, password: 'parola-123456' })
      .expect(401);
  });

  it('admin: separate realm token, GET /admin/me, password change from the panel', async () => {
    const prisma = app.get(PrismaService);
    const argon2 = await import('argon2');
    const email = `it-admin-${Date.now()}@test.local`;
    await prisma.adminUser.create({
      data: {
        email,
        name: 'Test Admin',
        role: 'ADMIN',
        passwordHash: await argon2.hash('ilk-parola-123456'),
      },
    });

    const login = await http()
      .post('/admin/auth/login')
      .set(...V)
      .send({ email, password: 'ilk-parola-123456' })
      .expect(201);
    const adminAuth = ['Authorization', `Bearer ${login.body.accessToken}`] as const;

    // A user access token must not open admin routes, and vice versa.
    const user = await register('audit-admin-user');
    await http()
      .get('/admin/me')
      .set(...V)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(401);
    await http()
      .get('/users/me')
      .set(...V)
      .set(...adminAuth)
      .expect(401);

    const me = await http()
      .get('/admin/me')
      .set(...V)
      .set(...adminAuth)
      .expect(200);
    expect(me.body.email).toBe(email);

    await http()
      .patch('/admin/me/password')
      .set(...V)
      .set(...adminAuth)
      .send({ currentPassword: 'yanlis-parola-123456', newPassword: 'yeni-parola-123456' })
      .expect(401);
    await http()
      .patch('/admin/me/password')
      .set(...V)
      .set(...adminAuth)
      .send({ currentPassword: 'ilk-parola-123456', newPassword: 'yeni-parola-123456' })
      .expect(204);
    await http()
      .post('/admin/auth/login')
      .set(...V)
      .send({ email, password: 'ilk-parola-123456' })
      .expect(401);
    await http()
      .post('/admin/auth/login')
      .set(...V)
      .send({ email, password: 'yeni-parola-123456' })
      .expect(201);
  });
});
