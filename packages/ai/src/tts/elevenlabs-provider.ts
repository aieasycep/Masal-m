import { TtsError, type SpeechResult, type TextToSpeechProvider } from './types';

export interface ElevenLabsTtsConfig {
  apiKey: string;
  /** Model with strong Turkish support; verify against current ElevenLabs docs on activation. */
  modelId?: string;
  /**
   * Model to retry with (using the untagged text) when the primary model is a
   * v3 model and the request is rejected — e.g. the account has no v3 access
   * or the voice is not v3-enabled.
   */
  fallbackModelId?: string;
  baseUrl?: string;
}

// v3 only accepts discrete stability values (0 creative / 0.5 natural / 1 robust);
// expressiveness comes from the audio tags, so "natural" is the sweet spot.
const V3_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };
// v2 models: lower stability + some style exaggeration reads far less flat for
// storytelling than the defaults, at the cost of slightly less consistency.
const V2_STORYTELLING_SETTINGS = {
  stability: 0.35,
  similarity_boost: 0.75,
  style: 0.45,
  use_speaker_boost: true,
};

/**
 * ElevenLabs text-to-speech adapter. Used both for system voices and for
 * cloned parent voices (the clone's providerVoiceId is a regular voice id).
 */
export class ElevenLabsTtsProvider implements TextToSpeechProvider {
  readonly name = 'elevenlabs';
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly fallbackModelId: string | null;
  private readonly baseUrl: string;

  constructor(config: ElevenLabsTtsConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId ?? 'eleven_multilingual_v2';
    this.fallbackModelId =
      config.fallbackModelId ?? (isV3Model(this.modelId) ? 'eleven_multilingual_v2' : null);
    this.baseUrl = (config.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
  }

  async generateSpeech(input: {
    text: string;
    expressiveText?: string;
    providerVoiceId: string;
    language: 'tr' | 'en';
  }): Promise<SpeechResult> {
    const v3 = isV3Model(this.modelId);
    // Audio tags are only understood by v3 — older models would read them aloud.
    const text = v3 && input.expressiveText ? input.expressiveText : input.text;
    const primary = await this.synthesize(this.modelId, text, input.providerVoiceId);
    if (primary.ok) return primary.result;

    if (v3 && this.fallbackModelId != null && this.fallbackModelId !== this.modelId) {
      const fallback = await this.synthesize(this.fallbackModelId, input.text, input.providerVoiceId);
      if (fallback.ok) return fallback.result;
      throw new TtsError(
        `ElevenLabs TTS failed on ${this.modelId} (${primary.error}) and fallback ${this.fallbackModelId} (${fallback.error})`,
      );
    }
    throw new TtsError(`ElevenLabs TTS failed (${primary.error})`);
  }

  private async synthesize(
    modelId: string,
    text: string,
    providerVoiceId: string,
  ): Promise<{ ok: true; result: SpeechResult } | { ok: false; error: string }> {
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: isV3Model(modelId) ? V3_SETTINGS : V2_STORYTELLING_SETTINGS,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `${response.status}: ${body.slice(0, 300)}` };
    }
    const audio = Buffer.from(await response.arrayBuffer());
    return { ok: true, result: { audio, contentType: 'audio/mpeg' } };
  }
}

function isV3Model(modelId: string): boolean {
  return modelId.startsWith('eleven_v3');
}
