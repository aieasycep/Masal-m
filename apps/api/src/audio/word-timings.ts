import type { NarrationTiming, NarrationWordTiming, NarrationWordTimings } from '@masalim/validation';
import type { WordAlignment } from '@masalim/ai';

/** Pages joined exactly like `chunkStoryPages` does, so char offsets agree. */
export const PAGE_JOINER = '\n\n';

export interface StoryPageText {
  pageNumber: number;
  text: string;
}

interface Token {
  text: string;
  pageNumber: number;
  /** Index of the word inside its page (whitespace tokenization, `/\S+/g`). */
  index: number;
  charStart: number;
  charEnd: number;
}

/** Minimum share of words that must receive a timestamp for an alignment to count. */
const MIN_ALIGNED_COVERAGE = 0.6;
const MATCH_LOOKAHEAD = 3;

export function fullStoryText(pages: readonly StoryPageText[]): string {
  return pages.map((page) => page.text).join(PAGE_JOINER);
}

/**
 * Whitespace tokens of every page with offsets into the full story text. The
 * mobile reader splits page text with the same `/\S+/g` rule, so `index`
 * addresses the same visual word on both sides.
 */
export function tokenizePages(pages: readonly StoryPageText[]): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  for (const [pageIdx, page] of pages.entries()) {
    if (pageIdx > 0) offset += PAGE_JOINER.length;
    let index = 0;
    for (const match of page.text.matchAll(/\S+/g)) {
      const start = offset + (match.index ?? 0);
      tokens.push({
        text: match[0],
        pageNumber: page.pageNumber,
        index,
        charStart: start,
        charEnd: start + match[0].length,
      });
      index += 1;
    }
    offset += page.text.length;
  }
  return tokens;
}

/**
 * Word timestamps from a provider alignment of the FINAL audio against the
 * clean story text. Exact path: the provider echoes every input character with
 * timing → each token reads its first/last character. Fuzzy path: providers
 * that normalize text (dropped punctuation, casing) are matched word by word
 * with a small lookahead. Returns null when too few words could be timed —
 * the caller then falls back to the estimated timeline.
 */
export function wordTimingsFromAlignment(
  pages: readonly StoryPageText[],
  alignment: WordAlignment,
): NarrationWordTimings | null {
  const tokens = tokenizePages(pages);
  if (tokens.length === 0) return null;

  const exact = fromCharacters(tokens, fullStoryText(pages), alignment);
  const words = exact ?? fromWords(tokens, alignment);
  if (words == null) return null;
  if (words.length / tokens.length < MIN_ALIGNED_COVERAGE) return null;
  return { source: 'aligned', words: makeMonotonic(words) };
}

function fromCharacters(
  tokens: Token[],
  fullText: string,
  alignment: WordAlignment,
): NarrationWordTiming[] | null {
  const chars = alignment.characters;
  if (chars.length !== fullText.length) return null;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i]?.text !== fullText[i]) return null;
  }
  const words: NarrationWordTiming[] = [];
  for (const token of tokens) {
    const first = chars[token.charStart];
    const last = chars[token.charEnd - 1];
    if (first == null || last == null) continue;
    words.push(timing(token, first.start, last.end));
  }
  return words;
}

function fromWords(tokens: Token[], alignment: WordAlignment): NarrationWordTiming[] | null {
  const provided = alignment.words
    .map((word) => ({ key: normalizeWord(word.text), start: word.start, end: word.end }))
    .filter((word) => word.key.length > 0);
  if (provided.length === 0) return null;

  const words: NarrationWordTiming[] = [];
  let p = 0;
  for (let t = 0; t < tokens.length && p < provided.length; t++) {
    const token = tokens[t];
    if (token == null) continue;
    const key = normalizeWord(token.text);
    if (key.length === 0) continue;

    // Direct hit, else look a few words ahead on either side (dropped or merged tokens).
    let hit = -1;
    for (let k = 0; k <= MATCH_LOOKAHEAD && p + k < provided.length; k++) {
      if (provided[p + k]?.key === key) {
        hit = p + k;
        break;
      }
    }
    if (hit === -1) {
      // Maybe the provider merged/split this token; skip it but keep scanning.
      continue;
    }
    const word = provided[hit];
    if (word == null) continue;
    words.push(timing(token, word.start, word.end));
    p = hit + 1;
  }
  return words;
}

/**
 * Timeline when no provider alignment exists: each chunk's measured duration is
 * spread over its words in proportion to character count. Coarse but honest —
 * the client shows it as a reading guide, never as exact sync.
 */
export function estimateWordTimings(
  pages: readonly StoryPageText[],
  chunkTimings: readonly NarrationTiming[],
): NarrationWordTimings | null {
  const tokens = tokenizePages(pages);
  if (tokens.length === 0 || chunkTimings.length === 0) return null;
  const words: NarrationWordTiming[] = [];
  for (const chunk of chunkTimings) {
    const inChunk = tokens.filter(
      (token) => token.charStart >= chunk.charStart && token.charStart < chunk.charEnd,
    );
    if (inChunk.length === 0) continue;
    // +1 per word stands in for the pause a space carries.
    const weights = inChunk.map((token) => token.text.length + 1);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let cursor = chunk.startSeconds;
    for (const [i, token] of inChunk.entries()) {
      const share = ((weights[i] ?? 1) / total) * chunk.durationSeconds;
      words.push(timing(token, cursor, cursor + share));
      cursor += share;
    }
  }
  return words.length === 0 ? null : { source: 'estimated', words: makeMonotonic(words) };
}

function timing(token: Token, start: number, end: number): NarrationWordTiming {
  return {
    t: token.text,
    p: token.pageNumber,
    i: token.index,
    s: round3(Math.max(0, start)),
    e: round3(Math.max(start, end)),
  };
}

/** Never let a word start before the previous one — keeps the highlight moving forward. */
function makeMonotonic(words: NarrationWordTiming[]): NarrationWordTiming[] {
  let last = 0;
  return words.map((word) => {
    const s = Math.max(word.s, last);
    const e = Math.max(word.e, s);
    last = s;
    return { ...word, s: round3(s), e: round3(e) };
  });
}

function normalizeWord(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '');
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
