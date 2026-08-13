import OpenAI from 'openai';
import { generatedStorySchema } from '@masalim/validation';
import { buildSystemPrompt, buildUserPrompt, UNSAFE_SENTINEL } from './prompt-engine';
import {
  StoryGenerationError,
  type StoryGenerationInput,
  type StoryGenerationProvider,
  type StoryGenerationResult,
} from './types';

export interface OpenAIStoryProviderConfig {
  apiKey: string;
  model?: string;
}

const MAX_REPAIR_ATTEMPTS = 2;

/** Story generation via OpenAI chat completions with JSON mode + Zod validation and repair retry. */
export class OpenAIStoryProvider implements StoryGenerationProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAIStoryProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4o';
  }

  async generateStory(input: StoryGenerationInput): Promise<StoryGenerationResult> {
    const system = buildSystemPrompt(input);
    const user = buildUserPrompt(input);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: `${user}\n\nYanıtı yalnızca geçerli JSON olarak ver.` },
    ];

    let totalIn = 0;
    let totalOut = 0;

    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      let completion;
      try {
        completion = await this.client.chat.completions.create({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
        });
      } catch (err) {
        throw new StoryGenerationError('OpenAI request failed', 'PROVIDER_ERROR', err);
      }

      totalIn += completion.usage?.prompt_tokens ?? 0;
      totalOut += completion.usage?.completion_tokens ?? 0;
      const raw = completion.choices[0]?.message?.content ?? '';

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        parsedJson = null;
      }
      const result = generatedStorySchema.safeParse(parsedJson);
      if (result.success) {
        if (result.data.title.includes(UNSAFE_SENTINEL)) {
          throw new StoryGenerationError('Model flagged the request as unsafe', 'REFUSED');
        }
        return {
          story: result.data,
          usage: { inputTokens: totalIn, outputTokens: totalOut, model: completion.model },
        };
      }

      // Repair loop (§16): feed the validation errors back and ask for a corrected JSON.
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `Ürettiğin JSON şemaya uymadı. Hatalar: ${JSON.stringify(result.error.issues.slice(0, 5))}. Aynı hikâyeyi şemaya tam uyan geçerli JSON olarak yeniden üret.`,
      });
    }

    throw new StoryGenerationError(
      `Model output failed schema validation after ${MAX_REPAIR_ATTEMPTS + 1} attempts`,
      'INVALID_OUTPUT',
    );
  }
}
