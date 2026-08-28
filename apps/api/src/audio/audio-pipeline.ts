import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

/** Provider chunk limit (§6a): split at sentence boundaries, never mid-sentence. */
export const MAX_CHUNK_CHARS = 2500;

export interface TextChunk {
  pageNumber: number;
  text: string;
  charStart: number;
  charEnd: number;
}

/**
 * Split story pages into TTS chunks. A page fits in one chunk in practice
 * (~85 words); oversized pages are split at sentence boundaries. Offsets are
 * relative to the full concatenated story text (pages joined by "\n\n"), which
 * is what the reader's text-sync consumes.
 */
export function chunkStoryPages(pages: Array<{ pageNumber: number; text: string }>): TextChunk[] {
  const chunks: TextChunk[] = [];
  let offset = 0;
  for (const [index, page] of pages.entries()) {
    if (index > 0) offset += 2; // the "\n\n" joiner
    const pieces = splitBySentences(page.text, MAX_CHUNK_CHARS);
    let local = 0;
    for (const piece of pieces) {
      const start = offset + page.text.indexOf(piece, local);
      chunks.push({
        pageNumber: page.pageNumber,
        text: piece,
        charStart: start,
        charEnd: start + piece.length,
      });
      local = start - offset + piece.length;
    }
    offset += page.text.length;
  }
  return chunks;
}

function splitBySentences(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+["'”)]?\s*|[^.!?…]+$/g) ?? [text];
  const pieces: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      pieces.push(current.trimEnd());
      current = '';
    }
    current += sentence;
  }
  if (current.trim().length > 0) pieces.push(current.trimEnd());
  return pieces;
}

function ffmpegPath(configured: string): string {
  if (configured) return configured;
  if (typeof ffmpegStatic === 'string' && ffmpegStatic) return ffmpegStatic;
  return 'ffmpeg';
}

/** Parse "Duration: HH:MM:SS.cc" from ffmpeg -i stderr (CBR-safe for our own encodes). */
async function probeDurationSeconds(binary: string, file: string): Promise<number> {
  const { stderr } = await execFileAsync(binary, ['-i', file, '-f', 'null', '-'], {
    maxBuffer: 8 * 1024 * 1024,
  }).catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? '' }));
  // Prefer the decoded end position (exact), fall back to the header estimate.
  const timeMatches = [...stderr.matchAll(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g)];
  const last = timeMatches[timeMatches.length - 1];
  const header = stderr.match(/Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/);
  const source = last ?? header;
  if (source == null) throw new Error(`ffmpeg reported no duration for ${file}`);
  return Number(source[1]) * 3600 + Number(source[2]) * 60 + Number(source[3]);
}

export interface ConcatResult {
  audio: Buffer;
  contentType: 'audio/mpeg';
  totalDurationSeconds: number;
  chunkDurationsSeconds: number[];
}

/**
 * Concatenate per-chunk TTS clips into one MP3 (§6a): concat demuxer with a
 * single libmp3lame re-encode (stream-copy misreports duration), 44.1kHz/128k.
 * Per-chunk durations are probed first — they become the Narration timings.
 */
export async function concatAudioChunks(
  chunks: Array<{ audio: Buffer; contentType: string }>,
  configuredFfmpegPath = '',
): Promise<ConcatResult> {
  if (chunks.length === 0) throw new Error('no audio chunks to concatenate');
  const binary = ffmpegPath(configuredFfmpegPath);
  const workDir = await mkdtemp(join(tmpdir(), 'masalim-narration-'));
  try {
    const files: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const ext = chunk.contentType.includes('wav') ? 'wav' : 'mp3';
      const file = join(workDir, `chunk-${String(index).padStart(3, '0')}.${ext}`);
      await writeFile(file, chunk.audio);
      files.push(file);
    }

    const chunkDurationsSeconds: number[] = [];
    for (const file of files) {
      chunkDurationsSeconds.push(await probeDurationSeconds(binary, file));
    }

    const listFile = join(workDir, 'list.txt');
    await writeFile(
      listFile,
      files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'),
    );
    const outFile = join(workDir, 'narration.mp3');
    await execFileAsync(binary, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-ac',
      '1',
      outFile,
    ]);

    const audio = await readFile(outFile);
    const totalDurationSeconds = await probeDurationSeconds(binary, outFile);
    return { audio, contentType: 'audio/mpeg', totalDurationSeconds, chunkDurationsSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
