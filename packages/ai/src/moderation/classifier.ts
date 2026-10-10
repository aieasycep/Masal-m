import type { ModerationVerdict } from './types';

export const CLASSIFIER_SYSTEM = [
  'You are a strict child-safety classifier for a bedtime-story app for children aged 0-12.',
  "Given content, decide if it is appropriate as (or as the basis of) a children's story.",
  'Block: sexual content, graphic violence, self-harm encouragement, drug use promotion, abuse,',
  'dangerous activities children could imitate, hate content, adult themes, and horror unsuitable for children.',
  'Mild, warm adventure/tension appropriate for bedtime stories is fine.',
  'Respond with EXACTLY one line: SAFE or UNSAFE:<category> where category is one snake_case word.',
].join(' ');

/**
 * Characters of story text sent to the classifier. A LONG story is ~10.5k
 * characters, so this covers the whole text (the old 8k window silently left
 * the last quarter of long stories unmoderated).
 */
export const MODERATION_TEXT_WINDOW = 20_000;

/**
 * Cut `text` into classifier windows of at most `windowChars` characters at
 * sentence boundaries. Lossless: the windows concatenate back to the input.
 * A sentence is only split when it alone exceeds the window.
 */
export function splitForModeration(
  text: string,
  windowChars: number = MODERATION_TEXT_WINDOW,
): string[] {
  if (text.length <= windowChars) return [text];
  const windows: string[] = [];
  let current = '';
  for (const sentence of sentencesOf(text)) {
    if (sentence.length > windowChars) {
      if (current.length > 0) {
        windows.push(current);
        current = '';
      }
      for (let start = 0; start < sentence.length; start += windowChars) {
        windows.push(sentence.slice(start, start + windowChars));
      }
      continue;
    }
    if (current.length + sentence.length > windowChars && current.length > 0) {
      windows.push(current);
      current = '';
    }
    current += sentence;
  }
  if (current.length > 0) windows.push(current);
  return windows;
}

/** Sentence pieces (terminator + following whitespace included) that re-join to `text`. */
function sentencesOf(text: string): string[] {
  const pieces: string[] = [];
  let last = 0;
  for (const match of text.matchAll(/[.!?…]+["'”)]?(?:\s+|$)/g)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end <= last) continue;
    pieces.push(text.slice(last, end));
    last = end;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return pieces;
}

/**
 * Classify every window in order; the first UNSAFE verdict is final (later
 * windows are not sent), otherwise the last verdict (SAFE) is returned.
 */
export async function moderateWindows(
  windows: string[],
  classify: (window: string) => Promise<ModerationVerdict>,
): Promise<ModerationVerdict> {
  let verdict: ModerationVerdict = { safe: true };
  for (const window of windows) {
    verdict = await classify(window);
    if (!verdict.safe) return verdict;
  }
  return verdict;
}

/** Parse the classifier's SAFE / UNSAFE:<category> reply into a verdict. */
export const parseVerdict = (text: string): ModerationVerdict => {
  const trimmed = text.trim();
  if (trimmed.startsWith('SAFE')) return { safe: true };
  const category = trimmed.startsWith('UNSAFE:')
    ? trimmed.slice('UNSAFE:'.length).trim()
    : 'unknown';
  return { safe: false, category };
};
