import { estimateWordTimings, fullStoryText, tokenizePages, wordTimingsFromAlignment } from '../word-timings';
import type { WordAlignment } from '@masalim/ai';

const pages = [
  { pageNumber: 1, text: 'Ege uzaya gitti.' },
  { pageNumber: 2, text: 'Küçük yıldız, "merhaba" dedi!' },
];

/** Alignment that echoes every character of the input at 0.1s per char. */
function exactAlignment(text: string): WordAlignment {
  const characters = [...text].map((ch, i) => ({ text: ch, start: i * 0.1, end: (i + 1) * 0.1 }));
  const words = [...text.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: (m.index ?? 0) * 0.1,
    end: ((m.index ?? 0) + m[0].length) * 0.1,
    loss: 0,
  }));
  return { characters, words };
}

describe('word timings', () => {
  it('tokenizes pages with page-local indexes and full-text offsets', () => {
    const tokens = tokenizePages(pages);
    expect(tokens.map((t) => `${t.pageNumber}:${t.index}:${t.text}`)).toEqual([
      '1:0:Ege',
      '1:1:uzaya',
      '1:2:gitti.',
      '2:0:Küçük',
      '2:1:yıldız,',
      '2:2:"merhaba"',
      '2:3:dedi!',
    ]);
    // Page 2 starts after "Ege uzaya gitti." + "\n\n".
    expect(tokens[3]?.charStart).toBe('Ege uzaya gitti.'.length + 2);
  });

  it('uses exact character timings when the provider echoes the input text', () => {
    const result = wordTimingsFromAlignment(pages, exactAlignment(fullStoryText(pages)));
    expect(result?.source).toBe('aligned');
    expect(result?.words).toHaveLength(7);
    const dedi = result?.words.find((w) => w.t === 'dedi!');
    expect(dedi?.p).toBe(2);
    expect(dedi?.i).toBe(3);
    expect(dedi?.s).toBeLessThan(dedi?.e ?? 0);
  });

  it('falls back to fuzzy word matching when punctuation/casing differ', () => {
    const alignment: WordAlignment = {
      characters: [],
      words: [
        { text: 'ege', start: 0, end: 0.4 },
        { text: 'uzaya', start: 0.4, end: 0.9 },
        { text: 'gitti', start: 0.9, end: 1.4 },
        { text: 'küçük', start: 2.4, end: 2.8 },
        { text: 'yıldız', start: 2.8, end: 3.3 },
        { text: 'merhaba', start: 3.3, end: 3.9 },
        { text: 'dedi', start: 3.9, end: 4.3 },
      ],
      loss: 0,
    };
    const result = wordTimingsFromAlignment(pages, alignment);
    expect(result?.source).toBe('aligned');
    expect(result?.words.map((w) => w.t)).toEqual([
      'Ege',
      'uzaya',
      'gitti.',
      'Küçük',
      'yıldız,',
      '"merhaba"',
      'dedi!',
    ]);
    expect(result?.words[3]?.s).toBe(2.4);
  });

  it('rejects an alignment that times too few words', () => {
    const alignment: WordAlignment = {
      characters: [],
      words: [{ text: 'ege', start: 0, end: 0.4 }],
      loss: 0,
    };
    expect(wordTimingsFromAlignment(pages, alignment)).toBeNull();
  });

  it('estimates a monotonic timeline from chunk timings when no alignment exists', () => {
    const full = fullStoryText(pages);
    const p2Start = 'Ege uzaya gitti.'.length + 2;
    const result = estimateWordTimings(pages, [
      { pageNumber: 1, charStart: 0, charEnd: p2Start - 2, startSeconds: 0, durationSeconds: 2 },
      { pageNumber: 2, charStart: p2Start, charEnd: full.length, startSeconds: 3, durationSeconds: 3 },
    ]);
    expect(result?.source).toBe('estimated');
    expect(result?.words).toHaveLength(7);
    const starts = result?.words.map((w) => w.s) ?? [];
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // Page 2 words begin after the page-turn gap.
    expect(result?.words[3]?.s).toBe(3);
    // Last word ends at the chunk end.
    expect(result?.words[6]?.e).toBeCloseTo(6, 2);
  });
});
