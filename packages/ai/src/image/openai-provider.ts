import OpenAI, { toFile } from 'openai';
import {
  buildCharacterBlock,
  ImageGenerationError,
  STYLE_TEMPLATES,
  type GeneratedImage,
  type ImageGenerationProvider,
} from './types';

export interface OpenAIImageProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * OpenAI image adapter (gpt-image-1), character-sheet-first strategy:
 * the first call renders a neutral character sheet; every page call passes
 * that sheet via images.edit as the visual reference, plus the verbatim
 * CharacterBible text — reference image + repeated bible holds consistency.
 */
export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAIImageProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-image-1';
  }

  async generateImage(input: {
    prompt: string;
    style: keyof typeof STYLE_TEMPLATES;
    characterBible: Parameters<typeof buildCharacterBlock>[0];
    characterRef?: string;
    quality: 'standard' | 'hd';
    isCharacterSheet?: boolean;
  }): Promise<GeneratedImage> {
    const styleBlock = STYLE_TEMPLATES[input.style];
    const characterBlock = buildCharacterBlock(input.characterBible);
    const quality = input.quality === 'hd' ? 'high' : 'medium';

    try {
      if (input.isCharacterSheet || input.characterRef == null) {
        const prompt = input.isCharacterSheet
          ? `Character sheet: ${characterBlock}. Neutral standing pose, plain light background, full body. ${styleBlock}. No text.`
          : `${input.prompt}. ${characterBlock}. ${styleBlock}. Children's book illustration, no text.`;
        const result = await this.client.images.generate({
          model: this.model,
          prompt,
          size: '1024x1024',
          quality,
        });
        const b64 = result.data?.[0]?.b64_json;
        if (!b64) throw new ImageGenerationError('OpenAI returned no image data');
        const image = Buffer.from(b64, 'base64');
        return {
          image,
          contentType: 'image/png',
          characterRef: input.isCharacterSheet ? b64 : input.characterRef,
        };
      }

      // Page/cover render referencing the character sheet image.
      const sheet = Buffer.from(input.characterRef, 'base64');
      const result = await this.client.images.edit({
        model: this.model,
        image: await toFile(sheet, 'character-sheet.png', { type: 'image/png' }),
        prompt: `Using this exact character, illustrate: ${input.prompt}. ${characterBlock}. ${styleBlock}. Children's book illustration, no text.`,
        size: '1024x1024',
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new ImageGenerationError('OpenAI returned no image data');
      return {
        image: Buffer.from(b64, 'base64'),
        contentType: 'image/png',
        characterRef: input.characterRef,
      };
    } catch (err) {
      if (err instanceof ImageGenerationError) throw err;
      throw new ImageGenerationError('OpenAI image generation failed', err);
    }
  }
}
