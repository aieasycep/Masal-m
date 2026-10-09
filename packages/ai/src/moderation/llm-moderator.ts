import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_ANTHROPIC_FAST_MODEL, effortConfig, textOf } from '../shared/anthropic';
import { hitsBlocklist } from './blocklist';
import { CLASSIFIER_SYSTEM, parseVerdict } from './classifier';
import type { ContentModerator, ModerationVerdict } from './types';

export interface LlmModeratorConfig {
  apiKey: string;
  model?: string;
}

// The verdict is one short line, but thinking tokens share this budget on
// Claude 5.5 — low effort keeps thinking minimal, the headroom keeps a thought
// from eating the answer (an empty reply would fail closed as "unknown").
const MAX_VERDICT_TOKENS = 512;

/** LLM-backed moderation using a fast classification call, layered over the blocklist. */
export class LlmContentModerator implements ContentModerator {
  readonly name = 'llm';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: LlmModeratorConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_ANTHROPIC_FAST_MODEL;
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
      max_tokens: MAX_VERDICT_TOKENS,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: effortConfig(this.model, 'low'),
    });
    if (response.stop_reason === 'refusal') {
      return { safe: false, category: 'classifier_refusal' };
    }
    return parseVerdict(textOf(response));
  }
}
