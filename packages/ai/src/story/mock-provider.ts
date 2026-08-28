import { DURATION_TARGETS } from '@masalim/types';
import { evidential, nounGenitive, withSuffixLite } from '../shared/turkish';
import type {
  StoryGenerationInput,
  StoryGenerationProvider,
  StoryGenerationResult,
} from './types';

const THEME_MOTIFS: Record<string, { setting: string; object: string; emoji: string }> = {
  SPACE: { setting: 'yıldızların arasında', object: 'küçük bir yıldız', emoji: '⭐' },
  ADVENTURE: { setting: 'gizemli bir haritanın izinde', object: 'saklı bir hazine', emoji: '🗺️' },
  SLEEP: { setting: 'ay ışığının altında', object: 'uykucu bir bulut', emoji: '🌙' },
  FRIENDSHIP: { setting: 'neşeli bir kasabada', object: 'yeni bir arkadaş', emoji: '🤝' },
  COURAGE: { setting: 'yüksek dağların eteğinde', object: 'cesaret rozeti', emoji: '💪' },
  ANIMALS: { setting: 'ormanın derinliklerinde', object: 'konuşan bir sincap', emoji: '🐿️' },
  SEA: { setting: 'denizin altında', object: 'parlayan bir inci', emoji: '🐠' },
  FAIRY_TALE: { setting: 'masal diyarında', object: 'sihirli bir anahtar', emoji: '🧚' },
  EMOTIONS: { setting: 'renklerin ülkesinde', object: 'kayıp bir gülümseme', emoji: '💛' },
  EDUCATIONAL: { setting: 'meraklılar okulunda', object: 'bilgelik feneri', emoji: '📚' },
  FANTASY: { setting: 'bulutların üzerindeki krallıkta', object: 'minik bir ejderha', emoji: '🐉' },
  NATURE: { setting: 'sihirli bahçede', object: 'dilek tohumu', emoji: '🌱' },
  IMAGINATION: { setting: 'hayallerin ülkesinde', object: 'uçan bir kitap', emoji: '✨' },
};

/**
 * Deterministic mock story provider — produces a coherent Turkish bedtime story
 * shaped by the wizard inputs, so every dev flow works without API credits.
 */
export class MockStoryProvider implements StoryGenerationProvider {
  readonly name = 'mock';
  private readonly delayMs: number;

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 2000;
  }

  async generateStory(input: StoryGenerationInput): Promise<StoryGenerationResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const hero = input.heroName;
    const heroGen = withSuffixLite(hero, 'gen');
    const motif = THEME_MOTIFS[input.themes[0] ?? 'FAIRY_TALE'] ?? THEME_MOTIFS.FAIRY_TALE!;
    const target = DURATION_TARGETS[input.durationTarget];
    const title = `${hero} ve ${capitalize(motif.object)}`;

    const openings = [
      `Bir varmış bir yokmuş, ${motif.setting} yaşayan ${hero} adında meraklı bir kahraman varmış. ${hero} her akşam pencereden dışarı bakar, yeni bir macera hayal edermiş.`,
      `Bir gece ${hero}, uzaktan gelen yumuşacık bir ışık fark etmiş. "Bu da ne olabilir?" diye fısıldamış ve merakla ışığa doğru yaklaşmış.`,
      `Işığın kaynağı ${evidential(motif.object)}! ${capitalize(motif.object)} biraz üzgün görünüyormuş, çünkü evine dönmenin yolunu bulamıyormuş. ${hero} hiç düşünmeden yardım etmeye karar vermiş.`,
    ];
    const middles = [
      `${hero} ve ${motif.object} birlikte yola koyulmuşlar. Yol boyunca birbirlerine en sevdikleri şarkıları mırıldanmışlar, küçük engelleri el ele aşmışlar.`,
      `Bir ara yolları kocaman bir nehirle kesişmiş. ${hero} derin bir nefes almış, etrafına bakınmış ve parlak bir fikir bulmuş: yapraklardan küçük bir sal yapmışlar!`,
      `Salın üzerinde süzülürken ${motif.object}, ${heroGen} cesaretine hayran kalmış. "Sen olmasaydın asla bu kadar ilerleyemezdim," demiş minnetle.`,
      `Derken karşılarına bilge bir baykuş çıkmış. Baykuş onlara doğru yolu göstermiş ve kulaklarına küçük bir sır fısıldamış: "En güzel yol, birlikte yürünen yoldur."`,
      `${hero} baykuşa teşekkür etmiş. İçinde sıcacık bir duygu büyüyormuş; yardım etmenin mutluluğu buymuş demek!`,
      `Sonunda ${nounGenitive(motif.object)} evine varmışlar. Herkes onları sevinçle karşılamış, gökyüzü ışıl ışıl parlamış.`,
      `${capitalize(motif.object)} evine kavuşunca ${withSuffixLite(hero, 'dat')} sımsıkı sarılmış. "Seni hiç unutmayacağım," demiş. ${hero} gülümsemiş; kalbi kocaman olmuş.`,
      `Dönüş yolunda ${hero}, gördüğü her güzelliği tek tek aklına yazmış: parlayan yıldızları, şarkı söyleyen rüzgârı ve yeni dostunun gülüşünü.`,
      `Eve vardığında ${hero} yatağına uzanmış. Bugün öğrendiği en önemli şeyi düşünmüş: iyilik, paylaştıkça çoğalıyormuş.`,
      `${heroGen} gözkapakları yavaş yavaş ağırlaşmış. Pencereden süzülen ay ışığı, odayı gümüş bir örtü gibi kaplamış.`,
      `O gece rüyasında yine ${motif.setting} dolaşmış ${hero}; ama bu kez yanında yepyeni dostları da varmış.`,
      `Sabah uyandığında yastığının üzerinde minicik, parlak bir iz bulmuş: dostluğunun hatırası.`,
    ];
    const ending = `${hero} gözlerini kapatmış ve huzurla uykuya dalmış. Yıldızlar ona güzel rüyalar fısıldıyormuş. İyi geceler, ${hero}... 🌙`;

    const bodyPool = [...openings, ...middles];
    const pageCount = target.pages;
    const texts: string[] = [];
    for (let i = 0; i < pageCount - 1; i++) {
      texts.push(bodyPool[i % bodyPool.length]!);
    }
    texts.push(ending);

    const styleHint =
      'soft editorial children\'s book illustration, warm light, gentle textures, consistent hero appearance';

    return {
      story: {
        title,
        summary: `${hero}, ${motif.object} için ${motif.setting} unutulmaz bir yolculuğa çıkıyor.`,
        coverIllustrationPrompt: `Book cover: ${hero} the ${input.heroType.toLowerCase()} ${motif.emoji}, ${styleHint}`,
        pages: texts.map((text, i) => ({
          pageNumber: i + 1,
          text,
          illustrationPrompt: `Page ${i + 1}: ${hero} — scene: ${text.slice(0, 90)} — ${styleHint}`,
        })),
      },
      usage: { inputTokens: 0, outputTokens: 0, model: 'mock' },
    };
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase('tr') + value.slice(1);
}
