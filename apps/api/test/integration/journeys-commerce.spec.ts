import type { INestApplication } from '@nestjs/common';
import type request from 'supertest';
import type { StorageProvider } from '@masalim/storage';
import { StorageKeys } from '@masalim/storage';
import { PrismaService } from '../../src/prisma/prisma.service';
import { STORAGE } from '../../src/providers/providers.module';
import { createApp, V, type Session, type TestApp } from './helpers';

jest.setTimeout(120_000);

interface Entitlements {
  plan: 'FREE' | 'PREMIUM';
  credits: { quota: { limit: number; used: number }; balance: number };
}

/**
 * Commerce + entitlement journeys for the hardening track (D.1–D.4) against
 * the real module graph with mock providers and inline workers. Requires
 * Postgres + Redis with migrations + seed applied.
 */
describe('commerce & entitlement journeys (integration)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let http: () => request.Agent;
  let register: (tag: string) => Promise<Session>;
  let waitForJob: (session: Session, jobId: string) => Promise<string>;
  let prisma: PrismaService;

  beforeAll(async () => {
    testApp = await createApp();
    ({ app, http, register, waitForJob } = testApp);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Launch gate: leave print ordering switched off, as seeded.
    await prisma.featureFlag.update({
      where: { key: 'physical_books' },
      data: { enabled: false },
    });
    await testApp.close();
  });

  const auth = (session: Session) => ['Authorization', `Bearer ${session.token}`] as const;

  const entitlements = async (session: Session): Promise<Entitlements> =>
    (
      await http()
        .get('/subscription/entitlements')
        .set(...V)
        .set(...auth(session))
        .expect(200)
    ).body as Entitlements;

  const mockPurchase = (session: Session, productId: string) =>
    http()
      .post('/subscription/mock/purchase')
      .set(...V)
      .set(...auth(session))
      .send({ productId })
      .expect(201);

  const generateShortStory = async (session: Session): Promise<string> => {
    const draft = await http()
      .post('/stories')
      .set(...V)
      .set(...auth(session))
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
      .set(...auth(session))
      .expect(201);
    expect(await waitForJob(session, gen.body.jobId)).toBe('SUCCEEDED');
    return draft.body.id as string;
  };

  it('D.1 — Premium credit quota is metered on the billing period, not the calendar month', async () => {
    const session = await register('d1-period');
    const purchasedAround = Date.now();
    await mockPurchase(session, 'masalim_premium_monthly');

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: session.userId } });
    expect(sub.currentPeriodStartedAt).not.toBeNull();
    const periodAnchor = sub.currentPeriodStartedAt!.getTime();
    expect(Math.abs(periodAnchor - purchasedAround)).toBeLessThan(10_000);

    await generateShortStory(session);

    const usage = await prisma.entitlementUsage.findFirst({ where: { userId: session.userId } });
    expect(usage).not.toBeNull();
    // The usage row is keyed on the subscription's period anchor…
    expect(Math.abs(usage!.periodStart.getTime() - periodAnchor)).toBeLessThan(1_000);
    // …and not on the first of the month (the old behaviour).
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    expect(usage!.periodStart.getTime()).not.toBe(monthStart);

    const after = await entitlements(session);
    expect(after.plan).toBe('PREMIUM');
    expect(after.credits.quota).toEqual({ limit: 30, used: 3 });
    expect(after.credits.balance).toBe(6); // signup gift untouched
  });

  it('D.2 — a member credit pack bought by a FREE account grants what was paid for; Premium gets the full pack', async () => {
    const free = await register('d2-free');
    expect((await entitlements(free)).credits.balance).toBe(6);
    await mockPurchase(free, 'masalim_credits_6_member');
    const freeAfter = await entitlements(free);
    expect(freeAfter.plan).toBe('FREE');
    expect(freeAfter.credits.balance).toBe(6 + 4); // 239.99 TL at the 49.99 TL/credit standard rate

    const premium = await register('d2-premium');
    await mockPurchase(premium, 'masalim_premium_monthly');
    await mockPurchase(premium, 'masalim_credits_6_member');
    const premiumAfter = await entitlements(premium);
    expect(premiumAfter.plan).toBe('PREMIUM');
    expect(premiumAfter.credits.balance).toBe(6 + 6);
  });

  it('D.3 — narrating with a cloned parent voice requires an active Premium subscription', async () => {
    const session = await register('d3-voice');
    await mockPurchase(session, 'masalim_premium_monthly');

    // Premium: clone a voice (the mock provider only needs a non-empty recording).
    const recordingKey = `${StorageKeys.voiceRecording(session.userId)}/take.m4a`;
    const storage = app.get<StorageProvider>(STORAGE);
    await storage.putObject(recordingKey, Buffer.from('not-really-audio'), 'audio/mp4');
    const voice = await http()
      .post('/voices')
      .set(...V)
      .set(...auth(session))
      .send({
        ownerType: 'MOTHER',
        displayName: 'Annemin Sesi',
        recordingObjectKey: recordingKey,
        recordingDurationSeconds: 60,
        consentAccepted: true,
      })
      .expect(201);
    expect(await waitForJob(session, voice.body.jobId)).toBe('SUCCEEDED');

    const storyId = await generateShortStory(session);

    // The subscription lapses — the profile stays, the feature does not.
    await http()
      .post('/subscription/mock/expire')
      .set(...V)
      .set(...auth(session))
      .expect(201);
    expect((await entitlements(session)).plan).toBe('FREE');

    const gated = await http()
      .post(`/stories/${storyId}/narrations`)
      .set(...V)
      .set(...auth(session))
      .send({ voiceProfileId: voice.body.id })
      .expect(403);
    expect(gated.body.error.code).toBe('ENTITLEMENT_REQUIRED');
    expect(await prisma.narration.count({ where: { storyId } })).toBe(0);

    // A free system voice still narrates.
    const voices = await http()
      .get('/voices/system')
      .set(...V)
      .set(...auth(session))
      .expect(200);
    const freeVoice = (voices.body as Array<{ id: string; premiumOnly: boolean }>).find(
      (item) => !item.premiumOnly,
    );
    expect(freeVoice).toBeDefined();
    await http()
      .post(`/stories/${storyId}/narrations`)
      .set(...V)
      .set(...auth(session))
      .send({ systemVoiceId: freeVoice!.id })
      .expect(201);
  });

  it('D.4 — the admin panel cannot skip the order lifecycle (PENDING → SHIPPED = 409)', async () => {
    await prisma.featureFlag.update({
      where: { key: 'physical_books' },
      data: { enabled: true },
    });
    const session = await register('d4-order');
    // The print PDF is a Premium (hd_book_export) render.
    await mockPurchase(session, 'masalim_premium_monthly');
    const storyId = await generateShortStory(session);

    const book = await http()
      .post('/books')
      .set(...V)
      .set(...auth(session))
      .send({ storyId })
      .expect(201);
    const render = await http()
      .post(`/books/${book.body.id}/render`)
      .set(...V)
      .set(...auth(session))
      .send({ kind: 'print_pdf' })
      .expect(201);
    expect(await waitForJob(session, render.body.jobId)).toBe('SUCCEEDED');
    const address = await http()
      .post('/addresses')
      .set(...V)
      .set(...auth(session))
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
    const order = await http()
      .post('/orders')
      .set(...V)
      .set(...auth(session))
      .set('Idempotency-Key', `it-d4-order-${Date.now()}`)
      .send({
        bookId: book.body.id,
        quantity: 1,
        bookSize: 'SQUARE',
        coverType: 'HARDCOVER',
        shippingAddressId: address.body.id,
      })
      .expect(201);
    expect(order.body.status).toBe('PENDING');

    const login = await http()
      .post('/admin/auth/login')
      .set(...V)
      .send({ email: 'admin@masalim.local', password: 'admin-dev-password-1' })
      .expect(201);
    const adminAuth = ['Authorization', `Bearer ${login.body.accessToken}`] as const;

    const refused = await http()
      .patch(`/admin/orders/${order.body.id}`)
      .set(...V)
      .set(...adminAuth)
      .send({ status: 'SHIPPED' })
      .expect(409);
    expect(refused.body.error.code).toBe('VALIDATION_FAILED');

    // A legal transition goes through and lands on the user-visible timeline.
    const cancelled = await http()
      .patch(`/admin/orders/${order.body.id}`)
      .set(...V)
      .set(...adminAuth)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const detail = await http()
      .get(`/orders/${order.body.id}`)
      .set(...V)
      .set(...auth(session))
      .expect(200);
    expect(detail.body.status).toBe('CANCELLED');
    expect(detail.body.timeline.map((entry: { status: string }) => entry.status)).toEqual([
      'PENDING',
      'CANCELLED',
    ]);

    // Terminal states cannot be revived.
    await http()
      .patch(`/admin/orders/${order.body.id}`)
      .set(...V)
      .set(...adminAuth)
      .send({ status: 'PAID' })
      .expect(409);
  });
});
