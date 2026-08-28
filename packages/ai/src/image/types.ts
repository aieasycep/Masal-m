import type { IllustrationStyle } from '@masalim/types';

export interface CharacterBible {
  name: string;
  age?: number | null;
  appearance: string;
  clothes: string;
  importantFeatures: string[];
}

export interface GeneratedImage {
  image: Buffer;
  contentType: string;
  /** Opaque provider reference (character sheet image / seed) for consistency across pages. */
  characterRef?: string;
}

export interface ImageGenerationProvider {
  readonly name: string;

  /**
   * Generate one illustration. `characterRef` (from a prior character-sheet
   * call) anchors character consistency when the provider supports it (§27).
   */
  generateImage(input: {
    prompt: string;
    style: IllustrationStyle;
    characterBible: CharacterBible;
    characterRef?: string;
    quality: 'standard' | 'hd';
    /** true for the first call of a set: produce the character sheet itself. */
    isCharacterSheet?: boolean;
  }): Promise<GeneratedImage>;
}

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

/** Server-side style templates (§26) — the client only ever sends the style enum. */
export const STYLE_TEMPLATES: Record<IllustrationStyle, string> = {
  WATERCOLOR:
    'soft watercolor children\'s book illustration, delicate washes, warm paper texture, gentle pastel palette',
  SOFT_3D:
    'soft 3D rendered children\'s illustration, rounded friendly shapes, warm studio lighting, subtle subsurface scattering',
  CLASSIC_STORYBOOK:
    'classic storybook illustration, warm editorial style, rich but gentle colors, timeless picture-book feel',
  PASTEL:
    'pastel chalk children\'s illustration, soft grain, dreamy muted colors, cozy atmosphere',
  HAND_DRAWN:
    'hand-drawn colored pencil children\'s illustration, visible strokes, warm playful linework',
};

export function buildCharacterBlock(bible: CharacterBible): string {
  const parts = [
    `Main character: ${bible.name}`,
    bible.age != null ? `${bible.age} years old` : null,
    `appearance: ${bible.appearance}`,
    `clothes: ${bible.clothes}`,
    bible.importantFeatures.length > 0
      ? `distinctive features: ${bible.importantFeatures.join(', ')}`
      : null,
    'The character MUST look identical in every image of this book.',
  ].filter(Boolean);
  return parts.join('; ');
}
