import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { IllustrationStyle } from '@masalim/types';
import type { GeneratedImage, ImageGenerationProvider, CharacterBible } from './types';

const STYLE_PALETTES: Record<IllustrationStyle, { bg: string; accent: string; label: string }> = {
  WATERCOLOR: { bg: '#DCEAF5', accent: '#7BA7C9', label: 'Suluboya' },
  SOFT_3D: { bg: '#EDE8F8', accent: '#B09CE0', label: 'Yumuşak 3D' },
  CLASSIC_STORYBOOK: { bg: '#F5E9D8', accent: '#D9A05B', label: 'Klasik Masal' },
  PASTEL: { bg: '#FBE8EE', accent: '#F5C4A8', label: 'Pastel' },
  HAND_DRAWN: { bg: '#E7F0E4', accent: '#8DB89A', label: 'El Çizimi' },
};

/**
 * Mock image provider: renders a style-tinted 1024px PNG with a simple scene
 * (sun, hills, character silhouette) and the prompt excerpt, deterministic per
 * prompt — so books look coherent in dev without any API credits.
 */
export class MockImageProvider implements ImageGenerationProvider {
  readonly name = 'mock';
  private readonly delayMs: number;

  constructor(options?: { delayMs?: number }) {
    this.delayMs = options?.delayMs ?? 1200;
  }

  async generateImage(input: {
    prompt: string;
    style: IllustrationStyle;
    characterBible: CharacterBible;
    characterRef?: string;
    isCharacterSheet?: boolean;
  }): Promise<GeneratedImage> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const palette = STYLE_PALETTES[input.style];
    const seed = parseInt(
      createHash('sha1').update(input.prompt).digest('hex').slice(0, 6),
      16,
    );
    const sunX = 180 + (seed % 600);
    const heroHue = (seed >> 3) % 360;
    const caption = escapeXml(truncate(input.prompt, 60));
    const title = escapeXml(truncate(input.characterBible.name, 24));

    const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${palette.bg}"/>
  <circle cx="${sunX}" cy="200" r="90" fill="#FFD97D" opacity="0.9"/>
  <ellipse cx="300" cy="950" rx="500" ry="220" fill="${palette.accent}" opacity="0.5"/>
  <ellipse cx="820" cy="1000" rx="480" ry="240" fill="${palette.accent}" opacity="0.7"/>
  <g transform="translate(512, 640)">
    <circle cx="0" cy="-70" r="55" fill="hsl(${heroHue}, 45%, 75%)"/>
    <rect x="-45" y="-20" width="90" height="130" rx="30" fill="hsl(${heroHue}, 50%, 60%)"/>
    <circle cx="-18" cy="-80" r="7" fill="#2C2825"/>
    <circle cx="18" cy="-80" r="7" fill="#2C2825"/>
    <path d="M -18 -55 Q 0 -42 18 -55" stroke="#2C2825" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <text x="512" y="90" font-family="sans-serif" font-size="42" font-weight="bold" fill="#2C2825" text-anchor="middle">${title}</text>
  <text x="512" y="985" font-family="sans-serif" font-size="26" fill="#2C2825" opacity="0.55" text-anchor="middle">${palette.label} · ${caption}</text>
</svg>`;

    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    return {
      image,
      contentType: 'image/png',
      characterRef: input.isCharacterSheet ? `mock-ref-${heroHue}` : input.characterRef,
    };
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
