/**
 * Minimal Turkish genitive helper for mock content. The full helper lives in
 * @masalim/localization (UI package); this trimmed copy avoids a dependency
 * from server-side AI mocks on the UI localization bundle.
 */
const BACK_VOWELS = 'aıouâû';
const FRONT_VOWELS = 'eiöüî';
const VOWELS = BACK_VOWELS + FRONT_VOWELS;
const ROUNDED = 'ouöüû';

export function withSuffixLite(name: string, suffixCase: 'gen'): string {
  const base = name.trim();
  const lower = base.toLocaleLowerCase('tr');
  let last: string | null = null;
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i]!;
    if (VOWELS.includes(ch)) {
      last = ch;
      break;
    }
  }
  const back = last != null && BACK_VOWELS.includes(last);
  const rounded = last != null && ROUNDED.includes(last);
  const v4 = back ? (rounded ? 'u' : 'ı') : rounded ? 'ü' : 'i';
  const endsWithVowel = lower.length > 0 && VOWELS.includes(lower[lower.length - 1]!);
  if (suffixCase === 'gen') {
    return `${base}'${endsWithVowel ? 'n' : ''}${v4}n`;
  }
  return base;
}
