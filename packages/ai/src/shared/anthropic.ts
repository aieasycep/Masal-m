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

/**
 * Short-call client options: a classifier or tagging pass must never hold an
 * API request (or a BullMQ worker) for the SDK's default 10-minute timeout.
 */
export const FAST_CLIENT_OPTIONS = { timeout: 30_000, maxRetries: 1 } as const;

// Models that reject the `effort` parameter: everything before the 4.5
// generation plus Haiku 4.5 / Sonnet 4.5 (Opus 4.5 and the 4.6+ line accept
// it). Listed explicitly — a loose prefix once swallowed Sonnet 4.6, which
// silently dropped the configured effort.
const EFFORT_UNSUPPORTED: readonly RegExp[] = [
  /^claude-3-/,
  /^claude-haiku-4-5(-\d{8})?$/,
  /^claude-sonnet-4-5(-\d{8})?$/,
  /^claude-sonnet-4(-0|-\d{8})?$/,
  /^claude-opus-4(-0|-1|-1-\d{8}|-\d{8})?$/,
];

/** True when the model accepts `output_config.effort`. */
export const supportsEffort = (model: string): boolean =>
  !EFFORT_UNSUPPORTED.some((pattern) => pattern.test(model));

/** `output_config` fragment for the requested effort, empty when the model can't take it. */
export const effortConfig = (
  model: string,
  effort: AnthropicEffort,
): { effort?: AnthropicEffort } => (supportsEffort(model) ? { effort } : {});

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
