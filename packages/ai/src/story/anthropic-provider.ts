import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z as z4 } from 'zod/v4';
import { generatedStorySchema, type GeneratedStory } from '@masalim/validation';
import {
  type AnthropicEffort,
  DEFAULT_ANTHROPIC_STORY_MODEL,
  effortConfig,
  textOf,
} from '../shared/anthropic';
import {
  buildSystemPrompt,
  buildUserPrompt,
  countStoryWords,
  minTotalWords,
  UNSAFE_SENTINEL,
} from './prompt-engine';
import {
  StoryGenerationError,
  type StoryGenerationInput,
  type StoryGenerationProvider,
  type StoryGenerationResult,
} from './types';

export interface AnthropicStoryProviderConfig {
  apiKey: string;
  model?: string;
  /** Thinking depth; `medium` is the Claude Opus 5.5 default and plenty for prose. */
  effort?: AnthropicEffort;
}

/**
 * zod/v4 mirror of generatedStorySchema — the SDK's zodOutputFormat helper is
 * typed against Zod 4. The shared v3 schema in @masalim/validation stays the
 * canonical wire contract; the parsed output is re-validated against it below.
 */
const transportStorySchema = z4.object({
  title: z4.string(),
  summary: z4.string(),
  coverIllustrationPrompt: z4.string(),
  pages: z4.array(
    z4.object({
      pageNumber: z4.number().int(),
      text: z4.string(),
      illustrationPrompt: z4.string(),
    }),
  ),
});

// Only the JSON schema of this object is sent; parsing is done by hand below so
// that stop_reason (refusal / max_tokens) is examined BEFORE any parse error.
const STORY_OUTPUT_FORMAT = zodOutputFormat(transportStorySchema);

// Thinking tokens count toward max_tokens on Claude 5.5; a LONG story is ~7k
// output tokens on the current tokenizer, so this leaves room for medium effort.
// Stays under the SDK's non-streaming ceiling (~21k).
const MAX_OUTPUT_TOKENS = 16000;

interface Attempt {
  raw: string;
  story: GeneratedStory | null;
  issues: string;
}

/** Story generation via the Anthropic API with schema-enforced structured output. */
export class AnthropicStoryProvider implements StoryGenerationProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: AnthropicEffort;

  constructor(config: AnthropicStoryProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? DEFAULT_ANTHROPIC_STORY_MODEL;
    this.effort = config.effort ?? 'medium';
  }

  async generateStory(input: StoryGenerationInput): Promise<StoryGenerationResult> {
    const system = buildSystemPrompt(input);
    const userPrompt = buildUserPrompt(input);
    const usage = { inputTokens: 0, outputTokens: 0, model: this.model };

    let attempt = await this.requestStory(system, userPrompt, usage);

    // Schema repair (parity with the OpenAI provider): structured output pins
    // the shape, but the canonical schema also carries length limits (title
    // ≤120, page text ≤2200, 3–20 pages). One corrective round for those.
    if (attempt.story == null) {
      attempt = await this.requestStory(
        system,
        [
          userPrompt,
          '',
          `Önceki deneme şemaya uymadı. Hatalar: ${attempt.issues}`,
          'Önceki JSON:',
          attempt.raw,
          'Aynı hikâyeyi (aynı başlık, olay örgüsü ve sayfa sayısıyla) şemaya tam uyan biçimde yeniden üret.',
        ].join('\n'),
        usage,
      );
      if (attempt.story == null) {
        throw new StoryGenerationError(
          `Model output failed schema validation after repair: ${attempt.issues}`,
          'INVALID_OUTPUT',
        );
      }
    }
    const first = attempt.story;
    if (first.title.includes(UNSAFE_SENTINEL)) {
      throw new StoryGenerationError('Model flagged the request as unsafe', 'REFUSED');
    }

    // Length repair: if the model undershot the word budget, one follow-up
    // request expands the same story. A still-short second attempt is
    // delivered rather than failed.
    const words = countStoryWords(first.pages);
    const minWords = minTotalWords(input.durationTarget);
    if (words >= minWords) return { story: first, usage };

    let second: Attempt;
    try {
      second = await this.requestStory(
        system,
        [
          userPrompt,
          '',
          `İlk deneme çok kısa kaldı: toplam ${words} kelime, alt sınır ${minWords} kelime. Kısa versiyon şuydu:`,
          JSON.stringify(first),
          'Aynı hikâyeyi (aynı başlık, olay örgüsü ve sayfa sayısıyla) her sayfayı zenginleştirip genişleterek yeniden üret; kelime bütçesine bu kez tam uy.',
        ].join('\n'),
        usage,
      );
    } catch {
      return { story: first, usage };
    }
    const expanded = second.story;
    if (expanded?.title.includes(UNSAFE_SENTINEL)) {
      throw new StoryGenerationError('Model flagged the request as unsafe', 'REFUSED');
    }
    return expanded != null && countStoryWords(expanded.pages) > words
      ? { story: expanded, usage }
      : { story: first, usage };
  }

  /**
   * One API round: stop_reason is checked before parsing so refusals and
   * truncation map to their own error codes instead of surfacing as a generic
   * provider failure (which the job queue would retry blindly).
   */
  private async requestStory(
    system: string,
    userPrompt: string,
    usage: { inputTokens: number; outputTokens: number; model: string },
  ): Promise<Attempt> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: [{ role: 'user', content: userPrompt }],
        output_config: { ...effortConfig(this.model, this.effort), format: STORY_OUTPUT_FORMAT },
      });
    } catch (err) {
      throw new StoryGenerationError('Anthropic request failed', 'PROVIDER_ERROR', err);
    }

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.model = response.model;

    if (response.stop_reason === 'refusal') {
      throw new StoryGenerationError('Model refused the request', 'REFUSED');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new StoryGenerationError(
        `Model output truncated at ${MAX_OUTPUT_TOKENS} tokens`,
        'TRUNCATED',
      );
    }

    const raw = textOf(response);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return { raw, story: null, issues: 'response is not valid JSON' };
    }
    const validated = generatedStorySchema.safeParse(parsedJson);
    return validated.success
      ? { raw, story: validated.data, issues: '' }
      : { raw, story: null, issues: JSON.stringify(validated.error.issues.slice(0, 5)) };
  }
}
