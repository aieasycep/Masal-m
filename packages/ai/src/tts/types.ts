export interface SpeechResult {
  audio: Buffer;
  contentType: string;
}

export interface TextToSpeechProvider {
  readonly name: string;
  /**
   * Synthesize one chunk of text with the given provider voice.
   * Long stories are chunked by the narration pipeline; keep chunks ≤ ~2,500 chars.
   */
  generateSpeech(input: {
    text: string;
    providerVoiceId: string;
    language: 'tr' | 'en';
  }): Promise<SpeechResult>;
}

export class TtsError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
