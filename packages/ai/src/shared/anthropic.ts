import type Anthropic from '@anthropic-ai/sdk';

/**
 * Adaptive-thinking depth for the Claude 5.5 generation. Thinking cannot be
 * turned off on these models; `effort` is the only lever and its tokens are
 * billed as output, so every caller sizes `max_tokens` with headroom.
 */
export type AnthropicEffort = 'low' | 'medium' | 'high';

/** Story writer: the current Opus (strongest at long-form Turkish prose). */
export const DEFAULT_ANTHROPIC_STORY_MODEL = 'claude-opus-5-5';
/** Classification / tagging passes: the current Haiku (cheap, fast). */
export const DEFAULT_ANTHROPIC_FAST_MODEL = 'claude-haiku-5-5';

// Models that predate the effort parameter (or reject it) — sending it would
// turn a config override into a 400 on every request.
const EFFORT_UNSUPPORTED = /^claude-(haiku-4-5|sonnet-4-5|sonnet-4-0|sonnet-4-|opus-4-0|opus-4-1|3-)/;

/** `output_config` fragment for the requested effort, empty when the model can't take it. */
export const effortConfig = (
  model: string,
  effort: AnthropicEffort,
): { effort?: AnthropicEffort } => (EFFORT_UNSUPPORTED.test(model) ? {} : { effort });

/**
 * Concatenate the `text` blocks of a response. Claude 5.5 responses start with
 * `thinking` blocks (empty by default), so content must be selected by type —
 * never by position.
 */
export const textOf = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
