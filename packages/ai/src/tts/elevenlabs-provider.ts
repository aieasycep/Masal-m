import { TtsError, type SpeechResult, type TextToSpeechProvider } from './types';

export interface ElevenLabsTtsConfig {
  apiKey: string;
  /** Model with strong Turkish support; verify against current ElevenLabs docs on activation. */
  modelId?: string;
  baseUrl?: string;
}

/**
 * ElevenLabs text-to-speech adapter. Used both for system voices and for
 * cloned parent voices (the clone's providerVoiceId is a regular voice id).
 */
export class ElevenLabsTtsProvider implements TextToSpeechProvider {
  readonly name = 'elevenlabs';
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly baseUrl: string;

  constructor(config: ElevenLabsTtsConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'eleven_multilingual_v2';
    this.baseUrl = (config.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
  }

  async generateSpeech(input: {
    text: string;
    providerVoiceId: string;
    language: 'tr' | 'en';
  }): Promise<SpeechResult> {
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.providerVoiceId)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: this.modelId,
        voice_settings: { stability: 0.55, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new TtsError(`ElevenLabs TTS failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, contentType: 'audio/mpeg' };
  }
}
