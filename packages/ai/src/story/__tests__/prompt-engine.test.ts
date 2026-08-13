import { describe, expect, it } from 'vitest';
import { AgeRange, DURATION_TARGETS, HeroType, StoryDuration, StoryTheme } from '@masalim/types';
import { buildSystemPrompt, buildUserPrompt, UNSAFE_SENTINEL } from '../prompt-engine';
import type { StoryGenerationInput } from '../types';

const baseInput: StoryGenerationInput = {
  child: { name: 'Ege', ageRange: AgeRange.AGE_3_5, interests: ['uzay', 'dinozorlar'] },
  heroName: 'Ege',
  heroType: HeroType.CHILD,
  themes: [StoryTheme.SPACE, StoryTheme.ADVENTURE],
  ageRange: AgeRange.AGE_3_5,
  durationTarget: StoryDuration.MEDIUM,
  customPrompt: 'Uzaya gitsin',
  advanced: { calmEnding: true },
  language: 'tr',
};

describe('prompt engine (§16)', () => {
  it('user prompt carries the page/word budget; age changes system guidance', () => {
    const user = buildUserPrompt(baseInput);
    const budget = DURATION_TARGETS[StoryDuration.MEDIUM];
    expect(user).toContain(String(budget.pages));
    expect(user).toContain(String(budget.wordsPerPage));
    // Different age ranges must change the guidance text (lives in the user prompt).
    const toddler = buildUserPrompt({ ...baseInput, ageRange: AgeRange.AGE_0_2 });
    const preteen = buildUserPrompt({ ...baseInput, ageRange: AgeRange.AGE_9_12 });
    expect(toddler).not.toEqual(preteen);
  });

  it('system prompt instructs the unsafe sentinel for inappropriate requests', () => {
    expect(buildSystemPrompt(baseInput)).toContain(UNSAFE_SENTINEL);
  });

  it('user prompt personalizes with child name, interests, themes and idea', () => {
    const user = buildUserPrompt(baseInput);
    expect(user).toContain('Ege');
    expect(user).toContain('uzay');
    expect(user).toContain('Uzaya gitsin');
  });

  it('supports child-less (general) stories', () => {
    const user = buildUserPrompt({ ...baseInput, child: null, heroName: 'Luna' });
    expect(user).toContain('Luna');
    expect(user).not.toContain('Ege');
  });

  it('writes the story in the requested language', () => {
    const tr = buildSystemPrompt(baseInput);
    const en = buildSystemPrompt({ ...baseInput, language: 'en' });
    expect(tr).not.toEqual(en);
  });
});
