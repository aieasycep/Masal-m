/**
 * Turkish suffix helper for proper nouns in UI strings (written form, TDK rules):
 * proper nouns take an apostrophe before the suffix and NO consonant mutation
 * in writing ("Zeynep'in", never "Zeybin"). Handles 2-way (a/e) and 4-way
 * (ı/i/u/ü) vowel harmony plus buffer consonants (y/n).
 *
 * UI strings only — in-story name inflection is delegated to the LLM.
 */

export type SuffixCase = 'gen' | 'dat' | 'acc' | 'loc' | 'abl' | 'com';

const BACK_VOWELS = 'aıouâû';
const FRONT_VOWELS = 'eiöüî';
const VOWELS = BACK_VOWELS + FRONT_VOWELS;
const ROUNDED = 'ouöüû';
const VOICELESS_FINALS = 'fstkçşhp';

function lastVowel(word: string): string | null {
  const lower = word.toLocaleLowerCase('tr');
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i]!;
    if (VOWELS.includes(ch)) return ch;
  }
  return null;
}

function endsWithVowel(word: string): boolean {
  const lower = word.toLocaleLowerCase('tr');
  const ch = lower[lower.length - 1];
  return ch != null && VOWELS.includes(ch);
}

function endsWithVoiceless(word: string): boolean {
  const lower = word.toLocaleLowerCase('tr');
  const ch = lower[lower.length - 1];
  return ch != null && VOICELESS_FINALS.includes(ch);
}

/** 2-way harmony: a (back) / e (front). Defaults to front for vowel-less inputs. */
function harmony2(word: string): 'a' | 'e' {
  const v = lastVowel(word);
  if (v == null) return 'e';
  return BACK_VOWELS.includes(v) ? 'a' : 'e';
}

/** 4-way harmony: ı / i / u / ü. Defaults to i. */
function harmony4(word: string): 'ı' | 'i' | 'u' | 'ü' {
  const v = lastVowel(word);
  if (v == null) return 'i';
  const back = BACK_VOWELS.includes(v);
  const rounded = ROUNDED.includes(v);
  if (back) return rounded ? 'u' : 'ı';
  return rounded ? 'ü' : 'i';
}

/**
 * Attach a case suffix to a proper noun with an apostrophe.
 *
 * gen: -(n)In   → Ege'nin, Aslı'nın, Umut'un, Gül'ün
 * dat: -(y)A    → Ege'ye, Umut'a
 * acc: -(y)I    → Ege'yi, Ada'yı, Umut'u
 * loc: -DA      → Ege'de, Umut'ta
 * abl: -DAn     → Ege'den, Umut'tan
 * com: -(y)lA   → Ege'yle, Umut'la
 */
export function withSuffix(name: string, suffixCase: SuffixCase): string {
  const base = name.trim();
  if (base.length === 0) return base;
  const v4 = harmony4(base);
  const v2 = harmony2(base);
  const vowelEnd = endsWithVowel(base);

  switch (suffixCase) {
    case 'gen':
      return `${base}'${vowelEnd ? 'n' : ''}${v4}n`;
    case 'dat':
      return `${base}'${vowelEnd ? 'y' : ''}${v2}`;
    case 'acc':
      return `${base}'${vowelEnd ? 'y' : ''}${v4}`;
    case 'loc': {
      const consonant = endsWithVoiceless(base) ? 't' : 'd';
      return `${base}'${consonant}${v2}`;
    }
    case 'abl': {
      const consonant = endsWithVoiceless(base) ? 't' : 'd';
      return `${base}'${consonant}${v2}n`;
    }
    case 'com':
      return `${base}'${vowelEnd ? 'y' : ''}l${v2}`;
  }
}

/** "{name}'nin Masalı" — convenience for the recurring possessive template. */
export function possessive(name: string): string {
  return withSuffix(name, 'gen');
}

/** "{name} için" needs no suffix; exported for symmetric usage in templates. */
export function forName(name: string): string {
  return `${name.trim()} için`;
}
