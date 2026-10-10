// One-off: render the SAME scene + character in every illustration style so
// the picker can show what each style really looks like. Runs in the
// "Style Samples" workflow with IMAGE_API_KEY; output lands in
// apps/mobile/assets/style-samples/<STYLE>.webp (bundled with the app).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { IllustrationStyle } from '@masalim/types';
import { OpenAIImageProvider } from '@masalim/ai';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../mobile/assets/style-samples');

const apiKey = process.env.IMAGE_API_KEY;
if (!apiKey) {
  console.error('IMAGE_API_KEY is required');
  process.exit(1);
}
const provider = new OpenAIImageProvider({ apiKey, model: process.env.IMAGE_MODEL || 'gpt-image-1' });

// Same hero + same moment in every style — the only variable is the medium.
const characterBible = {
  name: 'Ege',
  age: 6,
  appearance: 'a cheerful six-year-old child with short wavy brown hair, round face, big curious eyes and freckles',
  clothes: 'a yellow raincoat over a striped shirt and blue boots',
  importantFeatures: ['a small star-shaped pin on the raincoat'],
};
const prompt =
  "Ege sits on a grassy hill at night with a small orange fox friend, both looking up at a friendly smiling moon and a sky full of stars; warm, cozy children's-book scene, full-bleed square composition, no text or letters";

await mkdir(outDir, { recursive: true });
for (const style of Object.values(IllustrationStyle)) {
  console.log(`rendering ${style}…`);
  const image = await provider.generateImage({
    prompt,
    style,
    characterBible,
    quality: 'standard',
    isCharacterSheet: false,
  });
  // Card thumb is ~96×140 pt → 3x = 288×420; a 360×520 webp stays ~30KB.
  const webp = await sharp(image.image)
    .resize(360, 520, { fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer();
  await writeFile(resolve(outDir, `${style}.webp`), webp);
  console.log(`  → ${style}.webp (${webp.length} bytes)`);
}
console.log('done');
