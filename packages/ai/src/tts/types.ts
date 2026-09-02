export interface SpeechResult {
  audio: Buffer;
  contentType: string;
}

/** One timed unit of a forced alignment (seconds into the aligned audio). */
export interface AlignedSpan {
  text: string;
  start: number;
  end: number;
}

export interface WordAlignment {
  /** Every character of the aligned text, in order (may be empty for word-only providers). */
  characters: AlignedSpan[];
  words: AlignedSpan[];
  /** Provider confidence/loss for the whole transcript, lower is better. */
  loss?: number;
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

  /**
   * Optional: align a FINISHED audio file to its clean transcript and return
   * per-character / per-word timestamps (karaoke text sync). Providers without
   * alignment omit it; the narration pipeline then estimates a timeline.
   */
  alignWords?(input: { audio: Buffer; contentType: string; text: string }): Promise<WordAlignment>;
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
