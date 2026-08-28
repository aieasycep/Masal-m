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

  it('never ships copyable example onomatopoeia (models echo them into every story)', () => {
    const toddler = buildUserPrompt({ ...baseInput, ageRange: AgeRange.AGE_0_2 });
    expect(toddler).not.toContain('vın vın');
    expect(toddler).not.toContain('pat pat');
  });

  it('tells the model to use at most one interest, not all of them', () => {
    const user = buildUserPrompt(baseInput);
    expect(user).toContain('en fazla birini');
  });

  it('always includes the variety rules block', () => {
    expect(buildUserPrompt(baseInput)).toContain('ÇEŞİTLİLİK KURALLARI');
  });

  it('lists recent stories and demands divergence when provided', () => {
    const user = buildUserPrompt({
      ...baseInput,
      recentStories: [
        { title: 'İrem’in Uzay Yolculuğu', summary: 'İrem uzaya çıkar.' },
        { title: 'Kayıp Yıldız', summary: null },
      ],
    });
    expect(user).toContain('İrem’in Uzay Yolculuğu');
    expect(user).toContain('Kayıp Yıldız');
    expect(user).toContain('daha önce yazılan hikâyeler');
    // Without the field the block is absent.
    expect(buildUserPrompt(baseInput)).not.toContain('daha önce yazılan hikâyeler');
  });
});
