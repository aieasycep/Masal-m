import OpenAI from 'openai';
import { hitsBlocklist } from './blocklist';
import { CLASSIFIER_SYSTEM, parseVerdict } from './classifier';
import type { ContentModerator, ModerationVerdict } from './types';

export interface OpenAIModeratorConfig {
  apiKey: string;
  model?: string;
}

/** OpenAI-backed moderation using a fast classification call, layered over the blocklist. */
export class OpenAIContentModerator implements ContentModerator {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAIModeratorConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4o-mini';
  }

  async checkStoryIdea(idea: string, language: 'tr' | 'en'): Promise<ModerationVerdict> {
    if (hitsBlocklist(idea)) return { safe: false, category: 'blocklist' };
    return this.classify(`Story idea from a parent (${language}): "${idea}"`);
  }

  async checkStoryText(text: string, language: 'tr' | 'en'): Promise<ModerationVerdict> {
    if (hitsBlocklist(text)) return { safe: false, category: 'blocklist' };
    return this.classify(`Generated children's story (${language}):\n${text.slice(0, 8000)}`);
  }

  private async classify(content: string): Promise<ModerationVerdict> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 64,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM },
        { role: 'user', content },
      ],
    });
    const message = completion.choices[0]?.message;
    if (message == null || message.refusal != null || message.content == null) {
      return { safe: false, category: 'classifier_refusal' };
    }
    return parseVerdict(message.content);
  }
}
