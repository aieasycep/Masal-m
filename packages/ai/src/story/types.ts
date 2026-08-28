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

export class StoryGenerationError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_OUTPUT' | 'PROVIDER_ERROR' | 'REFUSED',
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StoryGenerationError';
  }
}
