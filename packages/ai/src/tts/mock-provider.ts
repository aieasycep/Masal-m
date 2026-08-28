import type { SpeechResult, TextToSpeechProvider } from './types';

/**
 * Mock TTS: generates a genuinely playable WAV (soft sine melody whose length
 * tracks the text length), so the whole narration pipeline — chunking, ffmpeg
 * concat, duration measurement, playback — works end-to-end without credits.
 */
export class MockTtsProvider implements TextToSpeechProvider {
  readonly name = 'mock';

  async generateSpeech(input: { text: string; providerVoiceId: string }): Promise<SpeechResult> {
    // ~ average Turkish speech rate ≈ 12 chars/second
    const seconds = Math.max(1, Math.min(60, Math.round(input.text.length / 12)));
    const audio = renderMelodyWav(seconds, hashCode(input.providerVoiceId));
    return { audio, contentType: 'audio/wav' };
  }
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 16-bit PCM mono WAV with a gentle pentatonic melody; voice id seeds the base pitch. */
function renderMelodyWav(seconds: number, seed: number): Buffer {
  const sampleRate = 22050;
  const totalSamples = sampleRate * seconds;
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const pentatonic = [0, 2, 4, 7, 9];
  const basePitch = 196 + (seed % 5) * 22; // G3.. varies per voice
  const noteLength = Math.floor(sampleRate * 0.45);

  for (let i = 0; i < totalSamples; i++) {
    const noteIndex = Math.floor(i / noteLength);
    const step = pentatonic[(noteIndex * 7 + seed) % pentatonic.length]!;
    const freq = basePitch * Math.pow(2, step / 12);
    const t = i / sampleRate;
    const noteT = (i % noteLength) / noteLength;
    const envelope = Math.sin(Math.PI * noteT) * 0.25;
    const sample = Math.sin(2 * Math.PI * freq * t) * envelope;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}
