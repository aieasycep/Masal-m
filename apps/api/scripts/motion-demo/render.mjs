// Motion-storybook demo — render step. Turns out/assets/manifest.json into a
// 1080×1920 MP4: night backdrop, square illustration with a slow Ken Burns
// move per page, crossfades, narration on the timeline and karaoke text
// (active word amber) in the lower panel — the reader screen as a video.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, 'out/assets');
const workDir = resolve(here, 'out/work');
const fontsDir = resolve(here, '../../assets/fonts');
const outFile = resolve(here, 'out/masalim-motion-demo.mp4');
await mkdir(workDir, { recursive: true });

const W = 1080;
const H = 1920;
const FPS = 30;
const ART_Y = 150;
const LEAD = 0.6; // silence before a page's narration starts
const TAIL = 1.0; // hold after the narration ends
const XFADE = 0.7;
const TITLE_SECONDS = 3.4;
const END_SECONDS = 3.0;

const manifest = JSON.parse(await readFile(resolve(assetsDir, 'manifest.json'), 'utf8'));

async function ffmpeg(args) {
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 64 * 1024 * 1024 });
}

/** Decoded duration in seconds (same probe the narration pipeline uses). */
async function probeSeconds(file) {
  const { stderr } = await run(ffmpegPath, ['-i', file, '-f', 'null', '-'], { maxBuffer: 8 * 1024 * 1024 }).catch(
    (error) => ({ stderr: error.stderr ?? '' }),
  );
  const times = [...stderr.matchAll(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g)];
  const last = times.at(-1) ?? stderr.match(/Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/);
  if (last == null) throw new Error(`no duration for ${file}`);
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
}

// Night backdrop (design: 160° #1A0F3C → #0D1B2E) with a soft star field.
const stars = Array.from({ length: 70 }, (_, i) => {
  const x = (i * 197) % W;
  const y = ((i * 379) % (H - 200)) + 40;
  const r = 1 + (i % 3) * 0.6;
  const o = 0.25 + ((i * 53) % 60) / 100;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" fill-opacity="${o.toFixed(2)}"/>`;
}).join('');
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#1A0F3C"/><stop offset="0.55" stop-color="#2D1B69"/><stop offset="1" stop-color="#0D1B2E"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>${stars}
  <rect x="0" y="${ART_Y + W}" width="${W}" height="${H - ART_Y - W}" fill="#0D1B2E" fill-opacity="0.35"/>
</svg>`;
const bgFile = resolve(workDir, 'bg.png');
await sharp(Buffer.from(bgSvg)).png().toFile(bgFile);
const frameSvg = bgSvg.replace(
  '</svg>',
  `<defs><mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/><rect x="0" y="${ART_Y}" width="${W}" height="${W}" rx="44" fill="#000"/></mask></defs></svg>`,
).replace('<rect width="', '<g mask="url(#hole)"><rect width="').replace('</defs></svg>', '</defs></g></svg>');
const frameFile = resolve(workDir, 'frame.png');
await sharp(Buffer.from(frameSvg)).png().toFile(frameFile);

// Rounded-corner mask for the artwork (radius 40) — applied once per page image.
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" rx="40" fill="#fff"/></svg>`;

const ASS_AMBER = '&H007DD2FF';
const ASS_LINEN = '&H00D4E0E8';
const ASS_LAVENDER = '&H00E09CB0';
const ASS_WHITE = '&H00FFFFFF';

function assTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

function assHeader() {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Body,Nunito,46,${ASS_LINEN},${ASS_LINEN},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,90,90,1330,1`,
    `Style: Eyebrow,Nunito,28,${ASS_LAVENDER},${ASS_LAVENDER},&H00000000,&H00000000,1,0,0,0,100,100,5,0,1,0,0,8,90,90,80,1`,
    `Style: Title,Fraunces,76,${ASS_WHITE},${ASS_WHITE},&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,8,90,90,1360,1`,
    `Style: Sub,Nunito,40,${ASS_LAVENDER},${ASS_LAVENDER},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,90,90,1500,1`,
    `Style: Dots,Nunito,30,${ASS_LAVENDER},${ASS_LAVENDER},&H00000000,&H00000000,0,0,0,0,100,100,6,0,1,0,0,2,90,90,60,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
}

const escapeAss = (text) => text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
const dialogue = (style, start, end, text) =>
  `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}`;

function estimateWords(text, duration) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.replace(/[^\p{L}\p{N}]+/gu, '').length + 1.2);
  const total = weights.reduce((a, b) => a + b, 0);
  // espeak/TTS typically leaves a short silence at both ends.
  const usable = Math.max(duration - 0.25, 0.5);
  let cursor = 0.1;
  return tokens.map((t, i) => {
    const span = (weights[i] / total) * usable;
    const word = { t, s: cursor, e: cursor + span };
    cursor += span;
    return word;
  });
}

function karaokeEvents(words, segmentSeconds, offset) {
  const tokens = words.map((w) => w.t);
  const render = (active) =>
    tokens
      .map((tok, i) => (i === active ? `{\\c${ASS_AMBER}&\\b1}${escapeAss(tok)}{\\r}` : escapeAss(tok)))
      .join(' ');
  const lines = [];
  const firstStart = words[0].s + offset;
  if (firstStart > 0) lines.push(dialogue('Body', 0, firstStart, render(-1)));
  words.forEach((w, i) => {
    const start = w.s + offset;
    const end = i + 1 < words.length ? words[i + 1].s + offset : Math.min(w.e + offset + 0.35, segmentSeconds);
    if (end > start) lines.push(dialogue('Body', start, end, render(i)));
  });
  const lastEnd = Math.min(words.at(-1).e + offset + 0.35, segmentSeconds);
  if (lastEnd < segmentSeconds) lines.push(dialogue('Body', lastEnd, segmentSeconds, render(-1)));
  return lines;
}

async function roundedArt(source, target) {
  await sharp(source)
    .resize(1024, 1024, { fit: 'cover' })
    .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
    .png()
    .toFile(target);
}

async function renderSegment({ index, art, seconds, assText, zoomIn }) {
  const frames = Math.round(seconds * FPS);
  const segFile = resolve(workDir, `seg-${index}.mp4`);
  if (process.env.REUSE_SEGMENTS && existsSync(segFile)) return { file: segFile, seconds };
  const assFile = resolve(workDir, `seg-${index}.ass`);
  await writeFile(assFile, `${assHeader()}\n${assText}\n`);
  const artFile = resolve(workDir, `art-${index}.png`);
  await roundedArt(art, artFile);
  const zoom = zoomIn ? `1+0.09*on/${frames}` : `1.09-0.09*on/${frames}`;
  const drift = zoomIn ? `-30*on/${frames}` : `+30*on/${frames}`;
  const x = zoomIn ? `iw/2-(iw/zoom/2)` : `iw/2-(iw/zoom/2)${drift}`;
  const y = zoomIn ? `ih/2-(ih/zoom/2)${drift}` : `ih/2-(ih/zoom/2)`;
  const seg = resolve(workDir, `seg-${index}.mp4`);
  const filter =
    `[1:v]scale=2160:2160:flags=lanczos,format=rgba,` +
    `zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${W}x${W}:fps=${FPS}[art];` +
    `[0:v][art]overlay=0:${ART_Y}:shortest=1:format=auto[base];` +
    `[base][2:v]overlay=0:0:format=auto,` +
    `ass=filename='${assFile}':fontsdir='${fontsDir}',format=yuv420p[v]`;
  await ffmpeg([
    '-loop', '1', '-framerate', String(FPS), '-i', bgFile,
    '-i', artFile,
    '-loop', '1', '-framerate', String(FPS), '-i', frameFile,
    '-filter_complex', filter,
    '-map', '[v]', '-frames:v', String(frames), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', seg,
  ]);
  return { file: seg, seconds };
}

// ---- timeline -------------------------------------------------------------
const pages = [];
for (const [i, page] of manifest.pages.entries()) {
  const audioFile = resolve(assetsDir, page.audio);
  const duration = await probeSeconds(audioFile);
  const words = page.words ?? estimateWords(page.text, duration);
  pages.push({ ...page, audioFile, duration, words, seconds: LEAD + duration + TAIL, index: i });
}
const total = manifest.pages.length;
const dots = (active) =>
  Array.from({ length: total }, (_, i) => (i === active ? '●' : '○')).join(' ');

const segments = [];
// Title card.
segments.push(
  await renderSegment({
    index: 0,
    art: resolve(assetsDir, manifest.cover),
    seconds: TITLE_SECONDS,
    zoomIn: true,
    assText: [
      dialogue('Eyebrow', 0, TITLE_SECONDS, 'MASALIM  ·  KİŞİSEL MASAL DÜNYASI'),
      dialogue('Title', 0.3, TITLE_SECONDS, escapeAss(manifest.title)),
      dialogue('Sub', 0.8, TITLE_SECONDS, escapeAss(`${manifest.heroName} için hazırlandı`)),
    ].join('\n'),
  }),
);
for (const page of pages) {
  segments.push(
    await renderSegment({
      index: page.index + 1,
      art: resolve(assetsDir, page.image),
      seconds: page.seconds,
      zoomIn: page.index % 2 === 0,
      assText: [
        dialogue('Eyebrow', 0, page.seconds, `MASALIM  ·  SAYFA ${page.index + 1} / ${total}`),
        dialogue('Dots', 0, page.seconds, dots(page.index)),
        ...karaokeEvents(page.words, page.seconds, LEAD),
      ].join('\n'),
    }),
  );
}
segments.push(
  await renderSegment({
    index: pages.length + 1,
    art: resolve(assetsDir, manifest.cover),
    seconds: END_SECONDS,
    zoomIn: false,
    assText: [
      dialogue('Title', 0.2, END_SECONDS, escapeAss(`Tatlı rüyalar, ${manifest.heroName}`)),
      dialogue('Sub', 0.7, END_SECONDS, 'Masalım ile hazırlandı'),
    ].join('\n'),
  }),
);

// Segment start times on the final timeline (crossfades overlap by XFADE).
const starts = [];
let cursor = 0;
segments.forEach((seg, i) => {
  starts.push(cursor);
  cursor += seg.seconds - (i < segments.length - 1 ? XFADE : 0);
});
const totalSeconds = cursor;

// ---- final mix ------------------------------------------------------------
const inputs = [];
segments.forEach((seg) => inputs.push('-i', seg.file));
pages.forEach((page) => inputs.push('-i', page.audioFile));

const vf = [];
let last = '[0:v]';
for (let i = 1; i < segments.length; i += 1) {
  const offset = starts[i];
  const label = i === segments.length - 1 ? '[vx]' : `[x${i}]`;
  vf.push(`${last}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${label}`);
  last = label;
}
vf.push(`[vx]fade=t=out:st=${(totalSeconds - 0.9).toFixed(3)}:d=0.9[v]`);

const af = [];
pages.forEach((page, i) => {
  const inputIndex = segments.length + i;
  const delayMs = Math.round((starts[page.index + 1] + LEAD) * 1000);
  af.push(`[${inputIndex}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${delayMs}:all=1[a${i}]`);
});
af.push(`${pages.map((_, i) => `[a${i}]`).join('')}amix=inputs=${pages.length}:normalize=0:duration=longest,apad=whole_dur=${totalSeconds.toFixed(3)}[a]`);

await ffmpeg([
  ...inputs,
  '-filter_complex', [...vf, ...af].join(';'),
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart',
  outFile,
]);
console.log(`rendered ${outFile} (${totalSeconds.toFixed(1)}s)`);
