import { DURATION_TARGETS, type AgeRange, type StoryDuration } from '@masalim/types';
import type { StoryGenerationInput } from './types';

/**
 * Prompt engine (§16): builds the system + user prompts for story generation.
 * Child age drives vocabulary, sentence length, plot complexity and scare level.
 */

const AGE_GUIDANCE: Record<AgeRange, string> = {
  AGE_0_2:
    'Yaş grubu 0–2: Çok kısa ve basit cümleler (3–6 kelime). Tekrarlayan, ritmik ifadeler kullan; sahneye uygun ses taklitleri üretebilirsin ama sesleri bu hikâyeye özgü seç, başka masallarda sık geçen kalıp sesleri tekrarlama. Somut, tanıdık nesneler ve rutinler. Hiç korku öğesi olmasın. Olay örgüsü çok basit, tek bir küçük olay.',
  AGE_3_5:
    'Yaş grubu 3–5: Kısa cümleler (5–9 kelime). Basit, günlük kelimeler; arada bir yeni kelime tanıtılabilir. Net ve doğrusal olay örgüsü. Korku yok; en fazla çok hafif, hemen çözülen bir merak anı. Bolca sıcaklık ve güven duygusu.',
  AGE_6_8:
    'Yaş grubu 6–8: Orta uzunlukta cümleler. Daha zengin kelime dağarcığı, hafif mizah ve küçük sürprizler kullanılabilir. Kahramanın küçük bir sorunu çözmesi, hafif heyecan olabilir; korkutucu olmayan, güven veren bir ton korunmalı.',
  AGE_9_12:
    'Yaş grubu 9–12: Daha karmaşık cümleler ve olay örgüsü kurulabilir. Katmanlı karakterler, ikilemler ve duygusal derinlik olabilir. Gerilim ölçülü kalmalı; şiddet, dehşet veya yetişkin temaları asla olmamalı.',
};

const HUMOR_GUIDANCE = {
  none: 'Mizah kullanma; ton sakin ve yumuşak olsun.',
  light: 'Hafif, tatlı bir mizah kullanabilirsin.',
  playful: 'Oyuncu ve neşeli bir mizah tonu kullan; yine de uyku öncesine uygun kalsın.',
} as const;

const FANTASY_GUIDANCE = {
  grounded: 'Hikâye gerçekçi ve gündelik dünyada geçsin; fantastik öğe kullanma.',
  balanced: 'Hafif fantastik dokunuşlar olabilir ama hikâye tanıdık bir dünyada köklenmiş kalsın.',
  high: 'Hayal gücü yüksek, masalsı ve fantastik bir dünya kurabilirsin.',
} as const;

export function buildSystemPrompt(input: StoryGenerationInput): string {
  const lang = input.language === 'tr' ? 'Türkçe' : 'English';
  return [
    `Sen çocuklar için uyku öncesi masallar yazan usta bir masal yazarı ve pedagogsun. ${lang} yazıyorsun.`,
    '',
    'KESIN GÜVENLİK KURALLARI — hiçbir koşulda ihlal etme:',
    '- Cinsel içerik, şiddet, kan, ölüm detayı, kendine zarar verme, madde kullanımı, nefret, zorbalık övgüsü, tehlikeli aktivite özendirmesi veya yetişkin temaları ASLA yer almaz.',
    '- Çocuğa uygun olmayan korku öğesi yer almaz. Gerilim varsa yumuşak ve hemen güvene dönen türden olmalı.',
    '- İstenen konu çocuk masalına dönüştürülemeyecek kadar uygunsuzsa hikâye üretme; bunun yerine title alanına "___UNSAFE___" yaz ve diğer alanları kısa tut.',
    '',
    'YAZIM KURALLARI:',
    '- Akıcı, sıcak, masalsı bir dil kullan. Ders verir gibi değil, hikâye anlatır gibi yaz.',
    '- Kahramanın adını Türkçe ek kurallarına göre doğal biçimde çek (örn. Ege → Ege\'nin, Ada → Ada\'yı).',
    '- Her sayfa tek başına sesli okunabilecek bir bölüm olsun.',
    '- Sayfa metinlerini dolgun tut: verilen kelime bütçesine uy, bütçenin altına inme. Bir-iki cümlelik cılız sayfalar kabul edilmez.',
    '- Her sayfa için, o sayfanın sahnesini betimleyen İngilizce bir "illustrationPrompt" yaz (çizim yönergesi; karakter görünümünü tutarlı tut).',
    '- Hikâye huzurlu ve güven veren bir sonla bitmeli.',
  ].join('\n');
}

export function buildUserPrompt(input: StoryGenerationInput): string {
  const target = DURATION_TARGETS[input.durationTarget];
  const lines: string[] = [];

  lines.push('Aşağıdaki bilgilere göre kişiselleştirilmiş bir çocuk masalı yaz.');
  lines.push('');
  lines.push(`Kahramanın adı: ${input.heroName}`);
  lines.push(`Kahraman türü: ${input.heroType}`);
  if (input.child) {
    lines.push(`Hikâye şu çocuk için yazılıyor: ${input.child.name}`);
    if (input.child.interests.length > 0) {
      lines.push(
        `Çocuğun ilgi alanları: ${input.child.interests.join(', ')}. Bunlardan en fazla birini, seçilen temayla doğal biçimde örtüşüyorsa ince bir dokunuş olarak kullan; hepsini sayma ve aynı ilgi alanını her hikâyenin merkezine koyma. Temayla örtüşen yoksa hiçbirini kullanmaman daha iyidir.`,
      );
    }
  }
  lines.push(`Temalar: ${input.themes.join(', ')}`);
  lines.push(
    `Hedef uzunluk: yaklaşık ${target.minutes} dakika sesli okuma. KELİME BÜTÇESİ (kesin kural): tam ${target.pages} sayfa; her sayfa ${target.wordsPerPage - 15}–${target.wordsPerPage + 15} kelime; hikâyenin TOPLAMI EN AZ ${minTotalWords(input.durationTarget)} kelime olmalı. Bu bir alt sınırdır — daha kısa bir hikâye yanlış kabul edilir.`,
  );
  lines.push('');
  lines.push(AGE_GUIDANCE[input.ageRange]);
  if (input.educationalGoal) {
    lines.push(`Hikâyenin vermesi istenen mesaj: ${input.educationalGoal}. Mesajı hikâyenin doğal akışına işle, açıkça ders verme.`);
  }
  if (input.advanced.teachNewWords) {
    lines.push('Yaşa uygun 2–3 yeni kelimeyi bağlam içinde doğal şekilde tanıt.');
  }
  if (input.advanced.calmEnding !== false) {
    lines.push('Son sayfa uykuya geçişe uygun, sakinleştirici ve huzurlu olsun.');
  }
  lines.push(HUMOR_GUIDANCE[input.advanced.humorLevel ?? 'light']);
  lines.push(FANTASY_GUIDANCE[input.advanced.fantasyLevel ?? 'balanced']);
  if (input.customPrompt) {
    lines.push('');
    lines.push(`Ebeveynin hikâye fikri: "${input.customPrompt}"`);
    lines.push('Bu fikri çocuğa uygun şekilde hikâyenin merkezine al.');
  }
  lines.push('');
  lines.push('ÇEŞİTLİLİK KURALLARI:');
  lines.push(
    '- Bu çocuk uygulamadan birçok masal dinliyor; her yeni hikâye öncekilerden belirgin biçimde farklı hissettirmeli.',
  );
  lines.push(
    '- Basmakalıp açılışlardan kaçın; hikâyeye özgü, taze bir açılış cümlesi kur.',
  );
  lines.push(
    '- Ses taklidi veya yinelenen ifade kullanacaksan bu hikâyeye özgü üret; masallarda sık geçen hazır kalıpları tekrarlama.',
  );
  lines.push('- Anlatım tekniğini, mekânı ve yan karakterleri hikâyeden hikâyeye değiştir.');
  if (input.recentStories != null && input.recentStories.length > 0) {
    lines.push('');
    lines.push('Bu çocuk için daha önce yazılan hikâyeler:');
    for (const prev of input.recentStories) {
      lines.push(`- ${prev.title}${prev.summary ? ` — ${prev.summary}` : ''}`);
    }
    lines.push(
      'Yeni hikâye bunların hiçbirini andırmamalı: aynı açılışları, motifleri, ses taklitlerini ve olay örgüsünü tekrarlama.',
    );
  }
  lines.push('');
  lines.push(
    `Çıktıyı şu yapıda üret: title (hikâye başlığı), summary (1-2 cümle özet), coverIllustrationPrompt (İngilizce kapak çizim yönergesi), pages (pageNumber, text, illustrationPrompt alanlarıyla tam ${target.pages} sayfa).`,
  );
  return lines.join('\n');
}

/** Sentinel the model uses to flag an unsafe request inside a valid schema. */
export const UNSAFE_SENTINEL = '___UNSAFE___';

/**
 * Word floor a generated story must reach for its duration (80% of the
 * pages×wordsPerPage budget). Quoted in the prompt as the hard minimum and
 * enforced by the providers with an expand-repair round — models (GPT-4o in
 * particular) otherwise undershoot "yaklaşık N kelime" by 3-4x.
 */
export function minTotalWords(duration: StoryDuration): number {
  const target = DURATION_TARGETS[duration];
  return Math.round(target.pages * target.wordsPerPage * 0.8);
}

export function countStoryWords(pages: ReadonlyArray<{ text: string }>): number {
  return pages.reduce((sum, page) => sum + page.text.split(/\s+/).filter(Boolean).length, 0);
}
