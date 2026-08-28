import { VoiceCloneError, type VoiceCloneProvider, type VoiceCloneStatus } from './types';

export interface ElevenLabsVoiceCloneConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * ElevenLabs Instant Voice Cloning adapter. A created clone is a regular
 * voice id usable by the ElevenLabs TTS adapter for narration.
 */
export class ElevenLabsVoiceCloneProvider implements VoiceCloneProvider {
  readonly name = 'elevenlabs';
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ElevenLabsVoiceCloneConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
  }

  async createVoice(input: {
    displayName: string;
    audio: Buffer;
    contentType: string;
    language: 'tr' | 'en';
  }): Promise<{ providerVoiceId: string }> {
    const form = new FormData();
    form.append('name', input.displayName);
    form.append(
      'files',
      new Blob([new Uint8Array(input.audio)], { type: input.contentType }),
      'recording.m4a',
    );
    form.append('remove_background_noise', 'true');

    const response = await fetch(`${this.baseUrl}/v1/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new VoiceCloneError(
        `ElevenLabs voice creation failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }
    const json = (await response.json()) as { voice_id?: string };
    if (!json.voice_id) {
      throw new VoiceCloneError('ElevenLabs voice creation returned no voice_id');
    }
    return { providerVoiceId: json.voice_id };
  }

  async deleteVoice(providerVoiceId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/voices/${encodeURIComponent(providerVoiceId)}`,
      { method: 'DELETE', headers: { 'xi-api-key': this.apiKey } },
    );
    // 404 means it is already gone — treat as success for idempotent deletion flows.
    if (!response.ok && response.status !== 404) {
      const body = await response.text().catch(() => '');
      throw new VoiceCloneError(
        `ElevenLabs voice deletion failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }
  }

  async getStatus(providerVoiceId: string): Promise<VoiceCloneStatus> {
    const response = await fetch(
      `${this.baseUrl}/v1/voices/${encodeURIComponent(providerVoiceId)}`,
      { headers: { 'xi-api-key': this.apiKey } },
    );
    if (response.status === 404) return 'FAILED';
    if (!response.ok) return 'PROCESSING';
    return 'READY';
  }
}
