import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
  },
}));

const { LlmContentModerator } = await import('../llm-moderator');

const reply = (text: string, stop_reason = 'end_turn') => ({
  model: 'claude-haiku-5-5',
  stop_reason,
  content: [
    // Non-empty thinking text: a reader that joins every block (or takes
    // content[0]) would see this decoy and produce the wrong verdict.
    { type: 'thinking', thinking: 'UNSAFE:decoy_from_thinking', signature: 'x' },
    { type: 'text', text },
  ],
  usage: { input_tokens: 10, output_tokens: 2 },
});

beforeEach(() => {
  create.mockReset();
});

describe('LlmContentModerator', () => {
  it('classifies with the fast Claude at low effort and reads only text blocks', async () => {
    create.mockResolvedValueOnce(reply('SAFE'));
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await expect(moderator.checkStoryIdea('uzayda kamp yapan bir çocuk', 'tr')).resolves.toEqual({
      safe: true,
    });
    const params = create.mock.calls[0]![0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.max_tokens).toBe(1024);
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.messages[0].content).toContain('Story idea from a parent (tr)');
  });

  it('returns the category of an UNSAFE verdict for generated text', async () => {
    create.mockResolvedValueOnce(reply('UNSAFE:graphic_violence'));
    const moderator = new LlmContentModerator({ apiKey: 'k', model: 'claude-opus-5-5' });

    await expect(moderator.checkStoryText('Bir varmış bir yokmuş...', 'tr')).resolves.toEqual({
      safe: false,
      category: 'graphic_violence',
    });
    expect(create.mock.calls[0]![0].model).toBe('claude-opus-5-5');
  });

  it('fails closed on a classifier refusal', async () => {
    create.mockResolvedValueOnce(reply('', 'refusal'));
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await expect(moderator.checkStoryText('metin', 'tr')).resolves.toEqual({
      safe: false,
      category: 'classifier_refusal',
    });
  });

  it('throws (retryable) when the budget was spent on thinking and no verdict came back', async () => {
    create.mockResolvedValueOnce({
      ...reply('', 'max_tokens'),
      content: [{ type: 'thinking', thinking: 'still thinking…', signature: 'x' }],
    });
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await expect(moderator.checkStoryText('metin', 'tr')).rejects.toThrow(/truncated/);
  });

  it('still fails closed on a malformed (non-truncated) reply', async () => {
    create.mockResolvedValueOnce(reply('I would rather not say.'));
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await expect(moderator.checkStoryText('metin', 'tr')).resolves.toEqual({
      safe: false,
      category: 'unknown',
    });
  });

  it('short-circuits on the blocklist without calling the API', async () => {
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await expect(moderator.checkStoryIdea('cinayet dolu bir hikaye', 'tr')).resolves.toEqual({
      safe: false,
      category: 'blocklist',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('sends a whole LONG story (≈10.5k chars) and caps at the 20k window', async () => {
    create.mockResolvedValueOnce(reply('SAFE')).mockResolvedValueOnce(reply('SAFE'));
    const moderator = new LlmContentModerator({ apiKey: 'k' });

    await moderator.checkStoryText('a'.repeat(10_500), 'en');
    await moderator.checkStoryText('b'.repeat(25_000), 'en');

    const whole = create.mock.calls[0]![0].messages[0].content as string;
    const capped = create.mock.calls[1]![0].messages[0].content as string;
    expect(whole.length).toBeGreaterThan(10_500);
    expect(capped.length).toBeLessThan(20_100);
  });
});
