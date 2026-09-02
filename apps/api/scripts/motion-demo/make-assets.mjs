// Motion-storybook demo — asset step. Produces out/assets/manifest.json with a
// square PNG per page (+cover), one narration audio per page and, when a real
// TTS provider is available, word timings from forced alignment.
//   DEMO_MODE=local  → style-sample thumbnails + espeak-ng placeholder voice
//   DEMO_MODE=real   → OpenAI gpt-image-1 (sheet-first) + ElevenLabs voice + alignment
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'out/assets');
const story = JSON.parse(await readFile(resolve(here, 'story.json'), 'utf8'));
const mode =
  process.env.DEMO_MODE ?? (process.env.IMAGE_API_KEY && process.env.TTS_API_KEY ? 'real' : 'local');
await mkdir(outDir, { recursive: true });
console.log(`mode: ${mode}`);

const SAMPLE_DIR = resolve(here, '../../../mobile/assets/style-samples');
const SAMPLE_ORDER = ['SOFT_3D', 'WATERCOLOR', 'CLASSIC_STORYBOOK', 'PASTEL', 'HAND_DRAWN'];

async function squarePng(buffer, file) {
  await sharp(buffer).resize(1024, 1024, { fit: 'cover', position: 'attention' }).png().toFile(file);
}

async function localImage(index, file) {
  const style = SAMPLE_ORDER[index % SAMPLE_ORDER.length];
  await squarePng(await readFile(resolve(SAMPLE_DIR, `${style}.webp`)), file);
}

async function localSpeech(text, file) {
  // Turkish espeak voice — a placeholder so the pipeline can be judged offline.
  await run('espeak-ng', ['-v', 'tr+f3', '-s', '135', '-p', '45', '-a', '170', '-w', file, text]);
}

let imageProvider = null;
let ttsProvider = null;
let characterRef;
if (mode === 'real') {
  const ai = await import('@masalim/ai');
  imageProvider = new ai.OpenAIImageProvider({
    apiKey: process.env.IMAGE_API_KEY,
    model: process.env.IMAGE_MODEL || 'gpt-image-1',
  });
  ttsProvider = new ai.ElevenLabsTtsProvider({
    apiKey: process.env.TTS_API_KEY,
    modelId: process.env.TTS_MODEL || 'eleven_multilingual_v2',
  });
  console.log('character sheet…');
  const sheet = await imageProvider.generateImage({
    prompt: 'Neutral full-body pose, plain background',
    style: story.style,
    characterBible: story.characterBible,
    quality: 'standard',
    isCharacterSheet: true,
  });
  characterRef = sheet.characterRef;
}

async function realImage(prompt, file) {
  const image = await imageProvider.generateImage({
    prompt: `${prompt}; full-bleed square composition, no text or letters`,
    style: story.style,
    characterBible: story.characterBible,
    characterRef,
    quality: 'standard',
    isCharacterSheet: false,
  });
  await squarePng(image.image, file);
}

/** Map aligned words onto the page's whitespace tokens (greedy, small lookahead). */
function mapWords(text, aligned) {
  const norm = (w) => w.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '');
  const tokens = text.split(/\s+/).filter(Boolean);
  const out = [];
  let j = 0;
  for (const tok of tokens) {
    const target = norm(tok);
    let hit = null;
    for (let k = j; k < Math.min(j + 4, aligned.length); k += 1) {
      if (norm(aligned[k].text) === target) {
        hit = k;
        break;
      }
    }
    if (hit == null && j < aligned.length && target.length > 0) {
      // Accept the next aligned word when it shares a prefix (apostrophe/suffix drift).
      const next = norm(aligned[j].text);
      if (next.length > 0 && (target.startsWith(next) || next.startsWith(target))) hit = j;
    }
    if (hit != null) {
      out.push({ t: tok, s: aligned[hit].start, e: aligned[hit].end });
      j = hit + 1;
    } else {
      out.push({ t: tok, s: null, e: null });
    }
  }
  // Interpolate the gaps.
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].s != null) continue;
    let a = i - 1;
    while (a >= 0 && out[a].s == null) a -= 1;
    let b = i + 1;
    while (b < out.length && out[b].s == null) b += 1;
    const start = a >= 0 ? out[a].e : 0;
    const end = b < out.length ? out[b].s : aligned.at(-1)?.end ?? start + 0.4;
    const span = b - a - 1;
    const slot = (end - start) / Math.max(span, 1);
    const k = i - a - 1;
    out[i].s = start + slot * k;
    out[i].e = start + slot * (k + 1);
  }
  return out;
}

async function realSpeech(text, file) {
  const speech = await ttsProvider.generateSpeech({ text, providerVoiceId: story.voiceId, language: 'tr' });
  await writeFile(file, speech.audio);
  try {
    const alignment = await ttsProvider.alignWords({ audio: speech.audio, contentType: speech.contentType, text });
    return mapWords(text, alignment.words);
  } catch (error) {
    console.warn('alignment failed, falling back to estimated timings:', error.message);
    return null;
  }
}

const manifest = { title: story.title, heroName: story.heroName, cover: 'cover.png', pages: [] };
console.log('cover…');
if (mode === 'real') await realImage(story.coverPrompt, resolve(outDir, 'cover.png'));
else await localImage(0, resolve(outDir, 'cover.png'));

for (const [index, page] of story.pages.entries()) {
  const n = index + 1;
  console.log(`page ${n}…`);
  const image = `page-${n}.png`;
  const audio = mode === 'real' ? `page-${n}.mp3` : `page-${n}.wav`;
  let words = null;
  if (mode === 'real') {
    await realImage(page.prompt, resolve(outDir, image));
    words = await realSpeech(page.text, resolve(outDir, audio));
  } else {
    await localImage(index + 1, resolve(outDir, image));
    await localSpeech(page.text, resolve(outDir, audio));
  }
  manifest.pages.push({ text: page.text, image, audio, words });
}
await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('assets ready →', outDir);
