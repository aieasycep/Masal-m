import type { AgeRange, HeroType, StoryDuration, StoryTheme } from '@masalim/types';
import type { GeneratedStory } from '@masalim/validation';

export interface StoryGenerationInput {
  child: {
    name: string;
    ageRange: AgeRange;
    interests: string[];
  } | null;
  heroName: string;
  heroType: HeroType;
  themes: StoryTheme[];
  ageRange: AgeRange;
  durationTarget: StoryDuration;
  customPrompt?: string;
  educationalGoal?: string;
  advanced: {
    teachNewWords?: boolean;
    calmEnding?: boolean;
    humorLevel?: 'none' | 'light' | 'playful';
    fantasyLevel?: 'grounded' | 'balanced' | 'high';
  };
  language: 'tr' | 'en';
  /** Recent stories written for the same child — the model is told to diverge from them. */
  recentStories?: { title: string; summary: string | null }[];
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export interface StoryGenerationResult {
  story: GeneratedStory;
  usage: AIUsage;
}

export interface StoryGenerationProvider {
  readonly name: string;
  generateStory(input: StoryGenerationInput): Promise<StoryGenerationResult>;
}

/**
 * INVALID_OUTPUT / PROVIDER_ERROR are worth a retry; REFUSED is a moderation
 * outcome; TRUNCATED (output hit max_tokens) repeats deterministically and
 * must NOT be retried — each attempt would bill the full output budget again.
 */
export class StoryGenerationError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_OUTPUT' | 'PROVIDER_ERROR' | 'REFUSED' | 'TRUNCATED',
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StoryGenerationError';
  }
}
