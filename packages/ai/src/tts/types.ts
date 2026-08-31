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
    /**
     * Same text annotated with expressive audio tags (e.g. ElevenLabs v3
     * "[whispers]"). Providers that support tags prefer it; others ignore it.
     */
    expressiveText?: string;
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
