import Anthropic from '@anthropic-ai/sdk';
import { hitsBlocklist } from './blocklist';
import type { ContentModerator, ModerationVerdict } from './types';

export interface LlmModeratorConfig {
  apiKey: string;
  model?: string;
}

const CLASSIFIER_SYSTEM = [
  'You are a strict child-safety classifier for a bedtime-story app for children aged 0-12.',
  'Given content, decide if it is appropriate as (or as the basis of) a children\'s story.',
  'Block: sexual content, graphic violence, self-harm encouragement, drug use promotion, abuse,',
  'dangerous activities children could imitate, hate content, adult themes, and horror unsuitable for children.',
  'Mild, warm adventure/tension appropriate for bedtime stories is fine.',
  'Respond with EXACTLY one line: SAFE or UNSAFE:<category> where category is one snake_case word.',
].join(' ');

/** LLM-backed moderation using a fast classification call, layered over the blocklist. */
export class LlmContentModerator implements ContentModerator {
  readonly name = 'llm';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: LlmModeratorConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-opus-5';
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
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 64,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      return { safe: false, category: 'classifier_refusal' };
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (text.startsWith('SAFE')) return { safe: true };
    const category = text.startsWith('UNSAFE:') ? text.slice('UNSAFE:'.length).trim() : 'unknown';
    return { safe: false, category };
  }
}
