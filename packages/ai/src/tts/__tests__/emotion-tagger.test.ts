import { beforeEach, describe, expect, it, vi } from 'vitest';

const anthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));
const openaiCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

const { NarrationDirector, applyDirectorOutput, stripAudioTags, tagsPreserveText } =
  await import('../emotion-tagger');

const ORIGINAL = 'Ege gökyüzüne baktı. "Yıldızlar ne kadar parlak!" dedi ve gülümsedi.';
const TAGGED =
  '[curious] Ege gökyüzüne baktı. [excited] "Yıldızlar ne kadar parlak!" dedi ve [warmly] gülümsedi.';

describe('stripAudioTags', () => {
  it('removes bracketed tags and keeps the words', () => {
    expect(stripAudioTags('[whispers] İyi geceler [softly] küçük yıldız.')).toBe(
      ' İyi geceler  küçük yıldız.',
    );
  });

  it('leaves text without tags untouched', () => {
    expect(stripAudioTags(ORIGINAL)).toBe(ORIGINAL);
  });
});

describe('tagsPreserveText', () => {
  it('accepts pure tag insertion', () => {
    expect(tagsPreserveText(ORIGINAL, TAGGED)).toBe(true);
  });

  it('rejects rewritten or truncated story text', () => {
    expect(tagsPreserveText(ORIGINAL, '[excited] Ege denize baktı.')).toBe(false);
    expect(tagsPreserveText(ORIGINAL, '[curious] Ege gökyüzüne baktı.')).toBe(false);
  });
});

describe('applyDirectorOutput', () => {
  it('keeps a valid tagged reply', () => {
    expect(applyDirectorOutput(ORIGINAL, `\n${TAGGED}\n`)).toBe(TAGGED);
  });

  it('falls back to the original on rewrite, empty, or over-length replies', () => {
    expect(applyDirectorOutput(ORIGINAL, 'Bambaşka bir hikâye anlatayım.')).toBe(ORIGINAL);
    expect(applyDirectorOutput(ORIGINAL, '   ')).toBe(ORIGINAL);
    expect(applyDirectorOutput(ORIGINAL, `${'[softly] '.repeat(400)}${ORIGINAL}`)).toBe(ORIGINAL);
  });
});

describe('NarrationDirector', () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    openaiCreate.mockReset();
  });

  it('annotates through Claude Haiku at low effort, reading text blocks only', async () => {
    anthropicCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '[angry] Bambaşka bir metin.', signature: 'x' },
        { type: 'text', text: TAGGED },
      ],
    });
    const onFallback = vi.fn();
    const director = new NarrationDirector({ provider: 'anthropic', apiKey: 'k', onFallback });

    await expect(director.annotate(ORIGINAL, 'tr')).resolves.toBe(TAGGED);
    expect(director.name).toBe('anthropic');
    expect(onFallback).not.toHaveBeenCalled();
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.max_tokens).toBe(4096);
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.messages[0].content).toContain(ORIGINAL);
  });

  it('falls back to the plain text and reports it when the API fails or rewrites the story', async () => {
    const onFallback = vi.fn();
    anthropicCreate.mockRejectedValueOnce(new Error('overloaded'));
    const director = new NarrationDirector({ provider: 'anthropic', apiKey: 'k', onFallback });
    await expect(director.annotate(ORIGINAL, 'tr')).resolves.toBe(ORIGINAL);
    expect(onFallback).toHaveBeenCalledWith('request failed', expect.any(Error));

    anthropicCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '[excited] Ege denize baktı.' }],
    });
    await expect(director.annotate(ORIGINAL, 'tr')).resolves.toBe(ORIGINAL);
    expect(onFallback).toHaveBeenLastCalledWith('reply rejected (rewritten, empty or over-length)');
  });

  it('honours a model override (wired from MODERATION_MODEL)', async () => {
    anthropicCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: TAGGED }],
    });
    const director = new NarrationDirector({
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
    });

    await director.annotate(ORIGINAL, 'tr');

    expect(director.model).toBe('claude-sonnet-5-5');
    expect(anthropicCreate.mock.calls[0]![0].model).toBe('claude-sonnet-5-5');
  });

  it('keeps the OpenAI path on gpt-4o-mini', async () => {
    openaiCreate.mockResolvedValueOnce({ choices: [{ message: { content: TAGGED } }] });
    const director = new NarrationDirector({ provider: 'openai', apiKey: 'k' });

    await expect(director.annotate(ORIGINAL, 'tr')).resolves.toBe(TAGGED);
    expect(openaiCreate.mock.calls[0]![0].model).toBe('gpt-4o-mini');
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
