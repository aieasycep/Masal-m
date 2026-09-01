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

/**
 * Server-side style templates (§26) — the client only ever sends the style enum.
 * Each template is a mutually exclusive MEDIUM spec with explicit negatives:
 * the earlier near-synonym one-liners ("soft", "warm", "children's book" in
 * every entry) let gpt-image-1 collapse all five styles into one generic look,
 * especially once a reference image dominates the edit call.
 */
export const STYLE_TEMPLATES: Record<IllustrationStyle, string> = {
  WATERCOLOR:
    'Traditional watercolor painting on cold-press paper: transparent washes, visible pigment blooms and wet edges, white paper showing through highlights, loose wet-on-wet backgrounds. Strictly no 3D rendering, no digital airbrush, no hard vector outlines',
  SOFT_3D:
    'Polished 3D animated-movie render (Pixar-like): smooth rounded geometry, glossy plastic-clay surfaces, volumetric lighting with soft shadows, shallow depth of field. Strictly no painterly texture, no visible brushstrokes, no paper grain',
  CLASSIC_STORYBOOK:
    'Mid-century classic storybook gouache illustration: flat opaque paint layers, bold simplified shapes, textured printmaking feel, limited rich palette with ink-line accents. Strictly no 3D rendering, no photorealism, no airbrushed gradients',
  PASTEL:
    'Soft chalk pastel drawing on toned paper: powdery smudged strokes, heavy visible grain, dreamy hazy edges, muted dusty colors blended by finger. Strictly no crisp outlines, no glossy surfaces, no 3D rendering',
  HAND_DRAWN:
    'Colored-pencil hand drawing: visible directional pencil strokes and cross-hatching, sketchy graphite outlines, paper tooth texture, lively imperfect linework. Strictly no smooth digital gradients, no 3D rendering, no watercolor washes',
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
