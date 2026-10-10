import { describe, expect, it, vi } from 'vitest';
import {
  MODERATION_TEXT_WINDOW,
  moderateWindows,
  parseVerdict,
  splitForModeration,
} from '../classifier';
import { hitsBlocklist } from '../blocklist';
import { OpenAIContentModerator } from '../openai-moderator';

describe('parseVerdict', () => {
  it('accepts SAFE replies (with surrounding whitespace)', () => {
    expect(parseVerdict('SAFE')).toEqual({ safe: true });
    expect(parseVerdict('  SAFE\n')).toEqual({ safe: true });
  });

  it('extracts the category from UNSAFE replies', () => {
    expect(parseVerdict('UNSAFE:graphic_violence')).toEqual({
      safe: false,
      category: 'graphic_violence',
    });
    expect(parseVerdict('UNSAFE: adult_theme ')).toEqual({ safe: false, category: 'adult_theme' });
  });

  it('treats malformed replies as unsafe with unknown category', () => {
    expect(parseVerdict('I cannot help with that.')).toEqual({ safe: false, category: 'unknown' });
    expect(parseVerdict('')).toEqual({ safe: false, category: 'unknown' });
  });
});

describe('OpenAIContentModerator', () => {
  it('short-circuits on the blocklist without calling the API', async () => {
    const moderator = new OpenAIContentModerator({ apiKey: 'test-key-unused' });
    await expect(moderator.checkStoryIdea('cinayet dolu bir hikaye', 'tr')).resolves.toEqual({
      safe: false,
      category: 'blocklist',
    });
  });
});

describe('hitsBlocklist', () => {
  it.each([
    ['cinayet dolu bir hikaye', true],
    ['Cinayeti kim işledi?', true],
    ['Kumarı bırak', true],
    ['kendini öldürmek isteyen kahraman', true],
    ['a story about murder', true],
    ['two murders in the castle', true],
    ['SEX education', true],
  ])('blocks %s', (text, expected) => {
    expect(hitsBlocklist(text)).toBe(expected);
  });

  it.each([
    'Esrarengiz bir orman',
    'Ege üzüm (grape) topluyor',
    'Perdeyi (drape) açtı',
    'Kumaş toplarından bir kale',
    'The sextet played a lullaby',
    'Bir masal dinle',
  ])('does not block innocent text: %s', (text) => {
    expect(hitsBlocklist(text)).toBe(false);
  });
});

describe('splitForModeration', () => {
  it('returns a single window for text within the limit', () => {
    expect(splitForModeration('Kısa bir masal.', 100)).toEqual(['Kısa bir masal.']);
  });

  it('splits a 45k-character story into 3 sentence-bounded windows that re-join losslessly', () => {
    const sentence = 'Ege ormanda yürüdü ve kuşları dinledi. ';
    const text = sentence.repeat(Math.ceil(45_000 / sentence.length));
    const windows = splitForModeration(text);
    expect(windows).toHaveLength(3);
    expect(windows.join('')).toBe(text);
    for (const window of windows) {
      expect(window.length).toBeLessThanOrEqual(MODERATION_TEXT_WINDOW);
      expect(window.trimEnd().endsWith('.')).toBe(true); // never cut mid-sentence
    }
  });

  it('hard-splits only a single sentence that exceeds the window', () => {
    const text = `Önce kısa. ${'a'.repeat(250)} Sonra kısa.`;
    const windows = splitForModeration(text, 100);
    expect(windows.join('')).toBe(text);
    expect(windows[0]).toBe('Önce kısa. ');
    expect(windows.every((window) => window.length <= 100)).toBe(true);
  });
});

describe('moderateWindows', () => {
  it('detects unsafe content in the third window and stops there', async () => {
    const sentence = 'Ege ormanda yürüdü ve kuşları dinledi. ';
    const text = `${sentence.repeat(1100)}Sonra korkunç bir cinayet işlendi.`;
    const windows = splitForModeration(text);
    expect(windows).toHaveLength(3);
    expect(windows[2]).toContain('cinayet');
    const classify = vi.fn(async (window: string) =>
      window.includes('cinayet') ? { safe: false, category: 'violence' } : { safe: true },
    );
    await expect(moderateWindows(windows, classify)).resolves.toEqual({
      safe: false,
      category: 'violence',
    });
    expect(classify).toHaveBeenCalledTimes(3);
  });

  it('returns SAFE when every window is safe', async () => {
    const classify = vi.fn(async () => ({ safe: true }));
    await expect(moderateWindows(['a', 'b'], classify)).resolves.toEqual({ safe: true });
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it('short-circuits on the first unsafe window', async () => {
    const classify = vi.fn(async (window: string) =>
      window === 'bad' ? { safe: false, category: 'x' } : { safe: true },
    );
    await expect(moderateWindows(['ok', 'bad', 'never'], classify)).resolves.toEqual({
      safe: false,
      category: 'x',
    });
    expect(classify).toHaveBeenCalledTimes(2);
  });
});
