import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z as z4 } from 'zod/v4';
import { generatedStorySchema } from '@masalim/validation';
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

/** Story generation via the Anthropic API with schema-enforced structured output. */
export class AnthropicStoryProvider implements StoryGenerationProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicStoryProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-opus-5';
  }

  async generateStory(input: StoryGenerationInput): Promise<StoryGenerationResult> {
    const first = await this.parseOnce(input, buildUserPrompt(input));

    // Length repair: if the model undershot the word budget, one follow-up
    // request expands the same story. A still-short second attempt is
    // delivered rather than failed.
    const words = countStoryWords(first.story.pages);
    const minWords = minTotalWords(input.durationTarget);
    if (words >= minWords) return first;

    const expandPrompt = [
      buildUserPrompt(input),
      '',
      `İlk deneme çok kısa kaldı: toplam ${words} kelime, alt sınır ${minWords} kelime. Kısa versiyon şuydu:`,
      JSON.stringify(first.story),
      'Aynı hikâyeyi (aynı başlık, olay örgüsü ve sayfa sayısıyla) her sayfayı zenginleştirip genişleterek yeniden üret; kelime bütçesine bu kez tam uy.',
    ].join('\n');
    let second: StoryGenerationResult;
    try {
      second = await this.parseOnce(input, expandPrompt);
    } catch {
      return first;
    }
    const usage = {
      inputTokens: (first.usage?.inputTokens ?? 0) + (second.usage?.inputTokens ?? 0),
      outputTokens: (first.usage?.outputTokens ?? 0) + (second.usage?.outputTokens ?? 0),
      model: second.usage?.model ?? this.model,
    };
    return countStoryWords(second.story.pages) > words
      ? { story: second.story, usage }
      : { ...first, usage };
  }

  private async parseOnce(
    input: StoryGenerationInput,
    userPrompt: string,
  ): Promise<StoryGenerationResult> {
    let response;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 16000,
        system: buildSystemPrompt(input),
        messages: [{ role: 'user', content: userPrompt }],
        output_config: { format: zodOutputFormat(transportStorySchema) },
      });
    } catch (err) {
      throw new StoryGenerationError('Anthropic request failed', 'PROVIDER_ERROR', err);
    }

    if (response.stop_reason === 'refusal') {
      throw new StoryGenerationError('Model refused the request', 'REFUSED');
    }
    if (response.parsed_output == null) {
      throw new StoryGenerationError('Model returned no parseable story', 'INVALID_OUTPUT');
    }

    const validated = generatedStorySchema.safeParse(response.parsed_output);
    if (!validated.success) {
      throw new StoryGenerationError(
        'Model output failed schema validation',
        'INVALID_OUTPUT',
        validated.error,
      );
    }
    if (validated.data.title.includes(UNSAFE_SENTINEL)) {
      throw new StoryGenerationError('Model flagged the request as unsafe', 'REFUSED');
    }

    return {
      story: validated.data,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model: response.model,
      },
    };
  }
}
