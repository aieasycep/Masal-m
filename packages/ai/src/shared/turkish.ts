/**
 * Minimal Turkish suffix helpers for mock content. The full helper lives in
 * @masalim/localization (UI package); this trimmed copy avoids a dependency
 * from server-side AI mocks on the UI localization bundle.
 */
const BACK_VOWELS = 'aıouâû';
const FRONT_VOWELS = 'eiöüî';
const VOWELS = BACK_VOWELS + FRONT_VOWELS;
const ROUNDED = 'ouöüû';

interface Harmony {
  back: boolean;
  rounded: boolean;
  endsWithVowel: boolean;
}

function harmonyOf(word: string): Harmony {
  const lower = word.toLocaleLowerCase('tr');
  let last: string | null = null;
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i]!;
    if (VOWELS.includes(ch)) {
      last = ch;
      break;
    }
  }
  return {
    back: last != null && BACK_VOWELS.includes(last),
    rounded: last != null && ROUNDED.includes(last),
    endsWithVowel: lower.length > 0 && VOWELS.includes(lower[lower.length - 1]!),
  };
}

/** Fourfold vowel (ı/i/u/ü) for the word's harmony. */
function v4(h: Harmony): string {
  return h.back ? (h.rounded ? 'u' : 'ı') : h.rounded ? 'ü' : 'i';
}

/** Twofold vowel (a/e) for the word's harmony. */
function v2(h: Harmony): string {
  return h.back ? 'a' : 'e';
}

/** Proper-noun suffix with apostrophe (hero names): genitive or dative. */
export function withSuffixLite(name: string, suffixCase: 'gen' | 'dat'): string {
  const base = name.trim();
  const h = harmonyOf(base);
  if (suffixCase === 'gen') {
    return `${base}'${h.endsWithVowel ? 'n' : ''}${v4(h)}n`;
  }
  return `${base}'${h.endsWithVowel ? 'y' : ''}${v2(h)}`;
}

/** Final-stop softening before a vowel-initial suffix (kitap → kitabı). */
function soften(word: string): string {
  const last = word[word.length - 1];
  const softened = last === 'p' ? 'b' : last === 'ç' ? 'c' : last === 'k' ? 'ğ' : null;
  return softened == null ? word : word.slice(0, -1) + softened;
}

/**
 * Genitive for a common-noun phrase — suffix attaches to the last word with
 * no apostrophe: "konuşan bir sincap" → "konuşan bir sincabın".
 */
export function nounGenitive(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  const last = words[words.length - 1] ?? '';
  const h = harmonyOf(last);
  const stem = h.endsWithVowel ? last : soften(last);
  words[words.length - 1] = `${stem}${h.endsWithVowel ? 'n' : ''}${v4(h)}n`;
  return words.join(' ');
}

/**
 * Evidential copula -(y)mIş for a phrase: "konuşan bir sincap" →
 * "konuşan bir sincapmış", "saklı bir hazine" → "saklı bir hazineymiş".
 */
export function evidential(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  const last = words[words.length - 1] ?? '';
  const h = harmonyOf(last);
  words[words.length - 1] = `${last}${h.endsWithVowel ? 'y' : ''}m${v4(h)}ş`;
  return words.join(' ');
}
