import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_ANTHROPIC_FAST_MODEL,
  effortConfig,
  FAST_CLIENT_OPTIONS,
  textOf,
} from '../shared/anthropic';
import { hitsBlocklist } from './blocklist';
import { CLASSIFIER_SYSTEM, MODERATION_TEXT_WINDOW, parseVerdict } from './classifier';
import type { ContentModerator, ModerationVerdict } from './types';

export interface LlmModeratorConfig {
  apiKey: string;
  model?: string;
}

// The verdict is one short line, but thinking tokens share this budget on
// Claude 5.5 — low effort keeps thinking minimal, the headroom keeps a thought
// from eating the answer. A budget-exhausted reply is reported as an error
// (retryable) rather than silently failing closed and rejecting a good story.
const MAX_VERDICT_TOKENS = 1024;

/** LLM-backed moderation using a fast classification call, layered over the blocklist. */
export class LlmContentModerator implements ContentModerator {
  readonly name = 'llm';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: LlmModeratorConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, ...FAST_CLIENT_OPTIONS });
    this.model = config.model ?? DEFAULT_ANTHROPIC_FAST_MODEL;
  }

  async checkStoryIdea(idea: string, language: 'tr' | 'en'): Promise<ModerationVerdict> {
    if (hitsBlocklist(idea)) return { safe: false, category: 'blocklist' };
    return this.classify(`Story idea from a parent (${language}): "${idea}"`);
  }

  async checkStoryText(text: string, language: 'tr' | 'en'): Promise<ModerationVerdict> {
    if (hitsBlocklist(text)) return { safe: false, category: 'blocklist' };
    return this.classify(
      `Generated children's story (${language}):\n${text.slice(0, MODERATION_TEXT_WINDOW)}`,
    );
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
    const text = textOf(response);
    if (response.stop_reason === 'max_tokens' && text.trim().length === 0) {
      throw new Error(
        `Moderation reply truncated before a verdict (model ${response.model}, ${response.usage.output_tokens} output tokens)`,
      );
    }
    return parseVerdict(text);
  }
}
