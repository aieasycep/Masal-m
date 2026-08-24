/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedSystemVoices() {
  // System voices must carry provider voice ids the active TTS provider understands:
  // the narration pipeline forwards providerVoiceId verbatim to generateSpeech().
  // ElevenLabs premade voices are account-global and speak Turkish under
  // eleven_multilingual_v2 (TTS_MODEL default).
  const useElevenLabs = process.env.TTS_PROVIDER === 'elevenlabs';
  const provider = useElevenLabs ? 'elevenlabs' : 'mock';
  const elevenLabsIds: Record<string, string> = {
    Duru: '21m00Tcm4TlvDq8ikWAM', // Rachel — calm female
    Atlas: 'pNInz6obpgDQGcFmaJgB', // Adam — deep male
    Luna: 'EXAVITQu4vr4xnSDxMaL', // Sarah — soft female
    Çınar: 'ErXwobaYiN019PkySvjV', // Antoni — warm male
    Masal: 'AZnzlk1XvdvUeBnXmlld', // Domi — upbeat female
    Yıldız: 'TxGEqnHWrfWFTfGW9XjX', // Josh — energetic male
  };
  const voiceId = (name: string, mockId: string) =>
    useElevenLabs ? (elevenLabsIds[name] ?? mockId) : mockId;

  const voices = [
    {
      displayName: 'Duru',
      description: 'Yumuşak masal anlatıcısı',
      category: 'CALM' as const,
      provider,
      providerVoiceId: voiceId('Duru', 'mock-voice-duru'),
      premiumOnly: false,
      sortOrder: 1,
    },
    {
      displayName: 'Atlas',
      description: 'Sıcak erkek sesi',
      category: 'CALM' as const,
      provider,
      providerVoiceId: voiceId('Atlas', 'mock-voice-atlas'),
      premiumOnly: false,
      sortOrder: 2,
    },
    {
      displayName: 'Luna',
      description: 'Masalsı ve huzurlu',
      category: 'FAIRYTALE' as const,
      provider,
      providerVoiceId: voiceId('Luna', 'mock-voice-luna'),
      premiumOnly: false,
      sortOrder: 3,
    },
    {
      displayName: 'Çınar',
      description: 'Güven veren anlatıcı',
      category: 'CALM' as const,
      provider,
      providerVoiceId: voiceId('Çınar', 'mock-voice-cinar'),
      premiumOnly: true,
      sortOrder: 4,
    },
    {
      displayName: 'Masal',
      description: 'Neşeli ve oyuncu',
      category: 'CHEERFUL' as const,
      provider,
      providerVoiceId: voiceId('Masal', 'mock-voice-masal'),
      premiumOnly: true,
      sortOrder: 5,
    },
    {
      displayName: 'Yıldız',
      description: 'Enerjik macera sesi',
      category: 'ENERGETIC' as const,
      provider,
      providerVoiceId: voiceId('Yıldız', 'mock-voice-yildiz'),
      premiumOnly: true,
      sortOrder: 6,
    },
  ];

  for (const voice of voices) {
    // Keyed by displayName so a provider switch updates rows in place instead of
    // duplicating the roster; a changed voice id invalidates the cached preview.
    const existing = await prisma.systemVoice.findFirst({
      where: { displayName: voice.displayName },
    });
    if (existing) {
      const idChanged = existing.providerVoiceId !== voice.providerVoiceId;
      await prisma.systemVoice.update({
        where: { id: existing.id },
        data: idChanged ? { ...voice, previewKey: null } : voice,
      });
    } else {
      await prisma.systemVoice.create({ data: voice });
    }
  }
  console.log(`Seeded ${voices.length} system voices (provider: ${provider})`);
}

async function seedFeatureFlags() {
  const flags = [
    { key: 'physical_books', enabled: true, isPublic: true, description: 'Physical book ordering flow' },
    { key: 'parent_voice_cloning', enabled: true, isPublic: true, description: 'Parent voice recording & cloning' },
    { key: 'illustrations', enabled: true, isPublic: true, description: 'AI illustration generation' },
    { key: 'subscriptions', enabled: true, isPublic: true, description: 'Premium subscriptions & paywall' },
    { key: 'new_voice_providers', enabled: false, isPublic: false, description: 'Experimental voice providers' },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: { description: flag.description, isPublic: flag.isPublic },
    });
  }
  console.log(`Seeded ${flags.length} feature flags`);
}

async function seedPricing() {
  await prisma.pricingConfig.upsert({
    where: { key: 'book_pricing_v1' },
    create: {
      key: 'book_pricing_v1',
      value: {
        currency: 'TRY',
        basePrices: {
          SQUARE: { HARDCOVER: '649.00', SOFTCOVER: '449.00' },
          STANDARD: { HARDCOVER: '749.00', SOFTCOVER: '549.00' },
        },
        shippingFlat: '79.90',
        freeShippingThreshold: '1000.00',
        quantityDiscounts: [
          { minQuantity: 2, percentOff: 5 },
          { minQuantity: 4, percentOff: 10 },
        ],
        estimatedDeliveryDays: { min: 7, max: 12 },
      },
      active: true,
    },
    update: {},
  });
  console.log('Seeded pricing config');
}

async function seedRecommendationTemplates() {
  const templates = [
    { interest: 'uzay', title: 'Uzay Macerası', themes: ['SPACE', 'ADVENTURE'], promptSeed: 'Kahraman uzaya gidip kaybolan küçük bir yıldızı evine döndürsün.', emoji: '🚀' },
    { interest: 'dinozorlar', title: 'Dinozorlarla Tanışma', themes: ['ANIMALS', 'ADVENTURE'], promptSeed: 'Kahraman zamanda yolculuk yapıp dost bir dinozorla arkadaş olsun.', emoji: '🦕' },
    { interest: 'deniz', title: 'Denizin Altındaki Sır', themes: ['SEA', 'ADVENTURE'], promptSeed: 'Kahraman denizaltı keşfine çıkıp parlayan bir inciyi bulsun.', emoji: '🐠' },
    { interest: 'hayvanlar', title: 'Ormanın Küçük Kaşifi', themes: ['ANIMALS', 'NATURE'], promptSeed: 'Kahraman ormandaki hayvanlara yardım ederek yeni dostlar edinsin.', emoji: '🌿' },
    { interest: 'arabalar', title: 'Hızlı Tekerlekler', themes: ['ADVENTURE'], promptSeed: 'Kahraman konuşan bir yarış arabasıyla büyük yarışa katılsın.', emoji: '🏎️' },
    { interest: 'prensesler', title: 'Cesur Prenses', themes: ['FAIRY_TALE', 'COURAGE'], promptSeed: 'Kahraman cesur bir prenses olarak krallığı kurtarsın.', emoji: '👑' },
    { interest: 'doğa', title: 'Sihirli Bahçe', themes: ['NATURE', 'IMAGINATION'], promptSeed: 'Kahraman her tohumun bir dilek olduğu sihirli bir bahçe keşfetsin.', emoji: '🌱' },
    { interest: 'robotlar', title: 'Robot Arkadaşım', themes: ['FANTASY', 'FRIENDSHIP'], promptSeed: 'Kahraman kendi yaptığı küçük robotla dostluğun anlamını öğrensin.', emoji: '🤖' },
    { interest: 'futbol', title: 'Altın Gol', themes: ['ADVENTURE', 'FRIENDSHIP'], promptSeed: 'Kahraman takımıyla birlikte büyük maçta dostluğun gücünü keşfetsin.', emoji: '⚽' },
    { interest: 'periler', title: 'Peri Tozunun Sırrı', themes: ['FAIRY_TALE', 'IMAGINATION'], promptSeed: 'Kahraman kayıp peri tozunu bulmak için masal diyarına yolculuk etsin.', emoji: '🧚' },
    { interest: 'macera', title: 'Gizemli Harita', themes: ['ADVENTURE', 'COURAGE'], promptSeed: 'Kahraman eski bir haritanın izinde saklı bir hazineyi bulsun.', emoji: '🗺️' },
    { interest: 'müzik', title: 'Şarkı Söyleyen Yıldızlar', themes: ['IMAGINATION', 'SLEEP'], promptSeed: 'Kahraman gökyüzündeki yıldızların ninnisini keşfetsin.', emoji: '🎵' },
  ];
  for (const t of templates) {
    const existing = await prisma.recommendationTemplate.findFirst({ where: { interest: t.interest, title: t.title } });
    if (!existing) {
      await prisma.recommendationTemplate.create({
        data: { ...t, themes: t.themes as never },
      });
    }
  }
  console.log(`Seeded ${templates.length} recommendation templates`);
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@masalim.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin-dev-password-1';
  await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      name: 'Masalım Admin',
      role: 'ADMIN',
      passwordHash: await argon2.hash(password),
    },
    update: {},
  });
  console.log(`Seeded admin user ${email}`);
}

async function seedDevData() {
  if (process.env.NODE_ENV === 'production') return;

  const email = 'demo@masalim.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Dev demo data already present, skipping');
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Ayşe Yılmaz',
      passwordHash: await argon2.hash('demo-password-1'),
      locale: 'tr',
      onboardingCompleted: true,
      identities: { create: { provider: 'EMAIL', providerUserId: email } },
    },
  });

  const ege = await prisma.child.create({
    data: {
      userId: user.id,
      name: 'Ege',
      ageRange: 'AGE_6_8',
      interests: ['uzay', 'dinozorlar', 'macera'],
      preferences: {},
    },
  });
  await prisma.child.create({
    data: {
      userId: user.id,
      name: 'Ada',
      ageRange: 'AGE_3_5',
      interests: ['hayvanlar', 'deniz', 'periler'],
      preferences: {},
    },
  });

  const pageTexts = [
    'Ege, penceresinden gökyüzüne bakmayı çok severdi. Bir gece, yıldızlardan birinin göz kırptığını fark etti.',
    'Küçük yıldız kaybolmuştu! "Merak etme," diye fısıldadı Ege, "seni evine götüreceğim."',
    'Ege küçük uzay giysisini giydi ve hayal gücünden yaptığı roketine atladı. Roket ışıl ışıl parlıyordu.',
    'Gökyüzü karanlıktı ama Ege korkmuyordu. Milyonlarca yıldızın arasında küçük bir ışık yanıp sönüyordu.',
    '"Seni buldum!" dedi Ege sevinçle. Küçük yıldız mutluluktan daha da parlak parladı.',
    'Ege yıldızı ait olduğu takımyıldıza bıraktı. Gökyüzü ona teşekkür eder gibi ışıldadı. Ege yatağına döndüğünde gözleri yavaşça kapandı.',
  ];

  await prisma.story.create({
    data: {
      userId: user.id,
      childId: ege.id,
      title: 'Ege ve Kayıp Yıldız',
      heroName: 'Ege',
      heroType: 'CHILD',
      themes: ['SPACE', 'ADVENTURE'],
      ageRange: 'AGE_6_8',
      durationTarget: 'MEDIUM',
      language: 'tr',
      status: 'READY',
      moderationStatus: 'APPROVED',
      summary: 'Ege, kaybolan küçük bir yıldızı evine döndürmek için uzaya yolculuk eder.',
      storyText: pageTexts.join('\n\n'),
      pages: {
        create: pageTexts.map((text, i) => ({
          pageNumber: i + 1,
          text,
          illustrationPrompt: `Turkish children's storybook illustration, page ${i + 1}: ${text.slice(0, 80)}`,
        })),
      },
    },
  });

  console.log('Seeded dev demo user (demo@masalim.local / demo-password-1) with children and a story');
}

async function main() {
  await seedSystemVoices();
  await seedFeatureFlags();
  await seedPricing();
  await seedRecommendationTemplates();
  await seedAdminUser();
  await seedDevData();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
