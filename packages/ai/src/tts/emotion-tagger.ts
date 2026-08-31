import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface NarrationDirectorConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
}

// ElevenLabs v3 reads ~3,000 chars per request; chunks arrive at ≤ ~2,500, so a
// tagged result near the ceiling means the model over-tagged — drop it.
const MAX_TAGGED_LENGTH = 2900;

const DIRECTOR_SYSTEM = [
  'You are a narration director preparing a children\'s bedtime story for expressive',
  'text-to-speech that supports ElevenLabs v3 audio tags. Insert audio tags in square',
  'brackets to guide emotional delivery, e.g. [warmly], [softly], [whispers],',
  '[excited], [curious], [gently], [sleepy], [giggles], [gasps], [relieved].',
  'RULES: Never change, add, remove, translate or reorder any word of the story —',
  'output the exact original text with tags inserted between sentences or before',
  'clauses. Use tags sparingly: at most one per one-to-two sentences. Follow the',
  'story arc: livelier in adventurous moments, calm and sleepy toward the end.',
  'Tags are always in English, even when the story is in another language.',
  'Output ONLY the tagged text — no commentary, no quotes, no code fences.',
].join(' ');

/** Remove [audio tags] so the spoken words can be compared / reused. */
export const stripAudioTags = (text: string): string => text.replace(/\[[^\][\n]{1,40}\]/g, '');

const normalizeWords = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** True when `tagged` is exactly `original` plus inserted [tags] and whitespace. */
export const tagsPreserveText = (original: string, tagged: string): boolean =>
  normalizeWords(stripAudioTags(tagged)) === normalizeWords(original);

/**
 * Validate a director reply: keep it only when it is non-empty, within the TTS
 * length budget, and provably the same story text with tags added — otherwise
 * fall back to the untouched original (narration must never rewrite the story).
 */
export const applyDirectorOutput = (original: string, modelOutput: string): string => {
  const tagged = modelOutput.trim();
  if (tagged.length === 0 || tagged.length > MAX_TAGGED_LENGTH) return original;
  return tagsPreserveText(original, tagged) ? tagged : original;
};

/**
 * LLM pass that annotates a narration chunk with v3 audio tags. Every failure
 * path (API error, rewritten text, over-length) degrades to the plain text.
 */
export class NarrationDirector {
  readonly name: string;
  private readonly config: NarrationDirectorConfig;
  private readonly model: string;

  constructor(config: NarrationDirectorConfig) {
    this.config = config;
    this.name = config.provider;
    this.model =
      config.model ?? (config.provider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5-20251001');
  }

  async annotate(text: string, language: 'tr' | 'en'): Promise<string> {
    try {
      const output = await this.complete(
        `Story chunk (${language}):\n${text}\n\nReturn the same text with audio tags inserted.`,
      );
      return applyDirectorOutput(text, output);
    } catch {
      return text;
    }
  }

  private async complete(prompt: string): Promise<string> {
    if (this.config.provider === 'openai') {
      const client = new OpenAI({ apiKey: this.config.apiKey });
      const completion = await client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 2048,
        messages: [
          { role: 'system', content: DIRECTOR_SYSTEM },
          { role: 'user', content: prompt },
        ],
      });
      return completion.choices[0]?.message?.content ?? '';
    }
    const client = new Anthropic({ apiKey: this.config.apiKey });
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: DIRECTOR_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}
