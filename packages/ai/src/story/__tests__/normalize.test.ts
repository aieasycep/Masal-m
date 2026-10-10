import { describe, expect, it } from 'vitest';
import type { GeneratedStory } from '@masalim/validation';
import { MAX_PAGE_TEXT_CHARS, normalizeGeneratedStory } from '../normalize';
import { StoryGenerationError } from '../types';

const page = (pageNumber: number, text = `Sayfa ${pageNumber} metni.`) => ({
  pageNumber,
  text,
  illustrationPrompt: `Scene ${pageNumber}`,
});

const story = (pages: GeneratedStory['pages']): GeneratedStory => ({
  title: 'Ege ve Ay',
  summary: 'Ege ayla arkadaş olur.',
  coverIllustrationPrompt: 'A child waving at the moon',
  pages,
});

describe('normalizeGeneratedStory', () => {
  it('returns an already-clean story unchanged', () => {
    const input = story([page(1), page(2), page(3), page(4), page(5), page(6)]);
    expect(normalizeGeneratedStory(input, 6)).toEqual(input);
  });

  it('renumbers duplicate page numbers, keeping the original order of the duplicates', () => {
    const input = story([page(1, 'bir'), page(2, 'iki'), page(2, 'üç'), page(3, 'dört')]);
    const result = normalizeGeneratedStory(input, 6);
    expect(result.pages.map((item) => item.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(result.pages.map((item) => item.text)).toEqual(['bir', 'iki', 'üç', 'dört']);
  });

  it('closes gaps and sorts by the model’s page order', () => {
    const input = story([page(7, 'son'), page(1, 'ilk'), page(4, 'orta')]);
    const result = normalizeGeneratedStory(input, 6);
    expect(result.pages.map((item) => [item.pageNumber, item.text])).toEqual([
      [1, 'ilk'],
      [2, 'orta'],
      [3, 'son'],
    ]);
  });

  it('drops blank pages before renumbering', () => {
    const input = story([page(1), page(2, '   \n'), page(3), page(4)]);
    const result = normalizeGeneratedStory(input, 6);
    expect(result.pages.map((item) => item.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages.some((item) => item.text.trim() === '')).toBe(false);
  });

  it('merges a 25-page overflow into page targetPages + 2, keeping that page’s prompt', () => {
    const input = story(Array.from({ length: 25 }, (_, i) => page(i + 1, `Sayfa ${i + 1}.`)));
    const result = normalizeGeneratedStory(input, 14);
    expect(result.pages).toHaveLength(16);
    expect(result.pages.map((item) => item.pageNumber)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    const last = result.pages[15] as GeneratedStory['pages'][number];
    expect(last.text).toBe(Array.from({ length: 10 }, (_, i) => `Sayfa ${i + 16}.`).join('\n\n'));
    expect(last.illustrationPrompt).toBe('Scene 16');
    expect(last.text.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARS);
  });

  it('throws INVALID_OUTPUT when the overflow does not fit one page', () => {
    const long = 'a'.repeat(1500);
    const input = story(Array.from({ length: 10 }, (_, i) => page(i + 1, long)));
    expect(() => normalizeGeneratedStory(input, 6)).toThrowError(StoryGenerationError);
    try {
      normalizeGeneratedStory(input, 6);
    } catch (error) {
      expect((error as StoryGenerationError).code).toBe('INVALID_OUTPUT');
    }
  });

  it('throws INVALID_OUTPUT when fewer than three pages have text', () => {
    const input = story([page(1), page(2, ' '), page(3, '')]);
    expect(() => normalizeGeneratedStory(input, 6)).toThrowError(/at least 3/);
  });
});
