export type VoiceCloneStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface VoiceCloneProvider {
  readonly name: string;

  /** Create a voice clone from a recording; resolves with the provider's voice id. */
  createVoice(input: {
    displayName: string;
    audio: Buffer;
    contentType: string;
    language: 'tr' | 'en';
  }): Promise<{ providerVoiceId: string }>;

  /** Delete the provider-side voice model (privacy §21/§46 — must really delete). */
  deleteVoice(providerVoiceId: string): Promise<void>;

  /** Clone readiness; instant-clone providers may return READY immediately. */
  getStatus(providerVoiceId: string): Promise<VoiceCloneStatus>;
}

export class VoiceCloneError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VoiceCloneError';
  }
}
