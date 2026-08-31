import { describe, expect, it } from 'vitest';
import { parseVerdict } from '../classifier';
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
