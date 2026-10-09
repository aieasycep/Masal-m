import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGenerationInput } from '../types';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { AnthropicStoryProvider } = await import('../anthropic-provider');
const { StoryGenerationError } = await import('../types');

const INPUT: StoryGenerationInput = {
  child: null,
  heroName: 'Ege',
  heroType: 'CHILD',
  themes: ['SLEEP'],
  ageRange: 'AGE_3_5',
  durationTarget: 'SHORT',
  advanced: {},
  language: 'tr',
};

/** A SHORT story (6 pages) whose page text has `wordsPerPage` words. */
const storyWith = (wordsPerPage: number, title = 'Ege ve Ay') => ({
  title,
  summary: 'Ege ayla arkadaş olur.',
  coverIllustrationPrompt: 'A child waving at the moon',
  pages: Array.from({ length: 6 }, (_, i) => ({
    pageNumber: i + 1,
    text: Array.from({ length: wordsPerPage }, (_, w) => `kelime${w}`).join(' '),
    illustrationPrompt: `Scene ${i + 1}`,
  })),
});

const reply = (
  payload: unknown,
  overrides: { stop_reason?: string; thinkingFirst?: boolean; inputTokens?: number; outputTokens?: number } = {},
) => ({
  model: 'claude-opus-5-5',
  stop_reason: overrides.stop_reason ?? 'end_turn',
  content: [
    ...(overrides.thinkingFirst === false ? [] : [{ type: 'thinking', thinking: '', signature: 'x' }]),
    { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) },
  ],
  usage: { input_tokens: overrides.inputTokens ?? 100, output_tokens: overrides.outputTokens ?? 50 },
});

beforeEach(() => {
  create.mockReset();
});

describe('AnthropicStoryProvider', () => {
  it('reads the story from the text block (thinking block first) and sends effort + schema', async () => {
    create.mockResolvedValueOnce(reply(storyWith(80)));
    const provider = new AnthropicStoryProvider({ apiKey: 'k', effort: 'high' });

    const result = await provider.generateStory(INPUT);

    expect(result.story.title).toBe('Ege ve Ay');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, model: 'claude-opus-5-5' });
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]![0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.max_tokens).toBe(16000);
    expect(params.output_config.effort).toBe('high');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.thinking).toBeUndefined();
    expect(params.temperature).toBeUndefined();
  });

  it('defaults to medium effort on the current Opus and honours a model override', async () => {
    create.mockResolvedValueOnce(reply(storyWith(80)));
    const provider = new AnthropicStoryProvider({ apiKey: 'k', model: 'claude-sonnet-5-5' });

    await provider.generateStory(INPUT);

    const params = create.mock.calls[0]![0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.effort).toBe('medium');
  });

  it('maps a refusal stop reason to REFUSED without parsing', async () => {
    create.mockResolvedValueOnce({ ...reply('not json', { stop_reason: 'refusal' }) });
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    await expect(provider.generateStory(INPUT)).rejects.toMatchObject({ code: 'REFUSED' });
  });

  it('maps the unsafe sentinel in the title to REFUSED', async () => {
    create.mockResolvedValueOnce(reply(storyWith(80, '___UNSAFE___')));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    await expect(provider.generateStory(INPUT)).rejects.toMatchObject({ code: 'REFUSED' });
  });

  it('maps max_tokens truncation to INVALID_OUTPUT instead of a provider error', async () => {
    create.mockResolvedValueOnce(reply('{"title": "cut', { stop_reason: 'max_tokens' }));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    await expect(provider.generateStory(INPUT)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });

  it('wraps SDK failures as PROVIDER_ERROR', async () => {
    create.mockRejectedValueOnce(new Error('401 invalid x-api-key'));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    const error = await provider.generateStory(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoryGenerationError);
    expect((error as InstanceType<typeof StoryGenerationError>).code).toBe('PROVIDER_ERROR');
  });

  it('repairs once when the canonical schema rejects the output', async () => {
    const tooLongTitle = { ...storyWith(80), title: 'x'.repeat(200) };
    create.mockResolvedValueOnce(reply(tooLongTitle)).mockResolvedValueOnce(reply(storyWith(80)));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    const result = await provider.generateStory(INPUT);

    expect(result.story.title).toBe('Ege ve Ay');
    expect(create).toHaveBeenCalledTimes(2);
    const repairPrompt = create.mock.calls[1]![0].messages[0].content as string;
    expect(repairPrompt).toContain('şemaya uymadı');
    expect(repairPrompt).toContain('"code":"too_big"');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100, model: 'claude-opus-5-5' });
  });

  it('gives up with INVALID_OUTPUT when the repair round is still invalid', async () => {
    create.mockResolvedValueOnce(reply('not json at all')).mockResolvedValueOnce(reply({ title: 'only' }));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    await expect(provider.generateStory(INPUT)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('expands a story that undershoots the word floor and keeps the longer version', async () => {
    create.mockResolvedValueOnce(reply(storyWith(20))).mockResolvedValueOnce(reply(storyWith(70)));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    const result = await provider.generateStory(INPUT);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].messages[0].content).toContain('çok kısa kaldı');
    expect(result.story.pages[0]!.text.split(' ')).toHaveLength(70);
    expect(result.usage.inputTokens).toBe(200);
  });

  it('delivers the first story when the expand round fails or is not longer', async () => {
    create.mockResolvedValueOnce(reply(storyWith(20))).mockRejectedValueOnce(new Error('overloaded'));
    const provider = new AnthropicStoryProvider({ apiKey: 'k' });

    const result = await provider.generateStory(INPUT);

    expect(result.story.pages[0]!.text.split(' ')).toHaveLength(20);

    create.mockReset();
    create.mockResolvedValueOnce(reply(storyWith(20))).mockResolvedValueOnce(reply(storyWith(10)));
    const again = await provider.generateStory(INPUT);
    expect(again.story.pages[0]!.text.split(' ')).toHaveLength(20);
  });

  it('omits effort for models that predate the parameter', async () => {
    create.mockResolvedValueOnce(reply(storyWith(80)));
    const provider = new AnthropicStoryProvider({ apiKey: 'k', model: 'claude-haiku-4-5' });

    await provider.generateStory(INPUT);

    expect(create.mock.calls[0]![0].output_config.effort).toBeUndefined();
  });
});
