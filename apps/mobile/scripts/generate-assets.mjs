/**
 * One-shot brand asset generator (icon / adaptive icon / splash logo).
 *
 * Renders the open-book logo mark — same paths as the splash screen's
 * BookLogo component — into the PNGs Expo prebuild needs. Run from repo root:
 *
 *   node apps/mobile/scripts/generate-assets.mjs
 *
 * Android resource linking fails without these (expo-splash-screen generates
 * a drawable/splashscreen_logo reference that must resolve to a real image).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(assetsDir, { recursive: true });

// Open-book glyph in a 52×52 viewBox — copied from app/(onboarding)/splash.tsx.
const bookGlyph = `
  <path d="M26 10C22 6 14 5 6 8v28c8-3 16-2 20 2V10z"
        fill="rgba(255,220,150,0.85)" stroke="rgba(255,220,150,0.95)"
        stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M26 10C30 6 38 5 46 8v28c-8-3-16-2-20 2V10z"
        fill="rgba(176,156,224,0.8)" stroke="rgba(176,156,224,0.95)"
        stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="26" y1="10" x2="26" y2="40" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
  <circle cx="14" cy="22" r="2" fill="rgba(255,220,150,0.95)"/>
  <circle cx="38" cy="18" r="1.5" fill="rgba(176,156,224,1)"/>
  <circle cx="38" cy="26" r="1" fill="rgba(255,255,255,0.8)"/>
`;

const glyphAt = (scale) => {
  const offset = (1024 - 52 * scale) / 2;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${bookGlyph}</g>`;
};

// App icon: night gradient + starfield + centered glyph (full-bleed square;
// the launchers apply their own corner masks).
const iconSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1A0F3C"/>
      <stop offset="0.6" stop-color="#2D1B69"/>
      <stop offset="1" stop-color="#1A0F3C"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#night)"/>
  <circle cx="160" cy="180" r="7" fill="rgba(255,255,255,0.75)"/>
  <circle cx="840" cy="150" r="5" fill="rgba(255,220,150,0.8)"/>
  <circle cx="900" cy="360" r="6" fill="rgba(255,255,255,0.55)"/>
  <circle cx="120" cy="700" r="5" fill="rgba(176,156,224,0.8)"/>
  <circle cx="820" cy="840" r="7" fill="rgba(255,255,255,0.6)"/>
  <circle cx="250" cy="880" r="4" fill="rgba(255,220,150,0.7)"/>
  ${glyphAt(11)}
</svg>`;

// Android adaptive-icon foreground: transparent, glyph inside the ~66% safe zone.
const adaptiveSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${glyphAt(8.5)}
</svg>`;

// Splash logo: transparent background — expo-splash-screen composites it over
// the configured #1A0F3C backdrop, matching the in-app splash screen.
const splashSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${glyphAt(12)}
</svg>`;

const jobs = [
  ['icon.png', iconSvg],
  ['adaptive-icon.png', adaptiveSvg],
  ['splash-icon.png', splashSvg],
];

for (const [file, svg] of jobs) {
  const target = join(assetsDir, file);
  await sharp(Buffer.from(svg)).png().toFile(target);
  const { width, height } = await sharp(target).metadata();
  console.log(`${file}: ${width}x${height}`);
}
