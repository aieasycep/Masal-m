import { describe, expect, it } from 'vitest';
import { effortConfig, supportsEffort, textOf } from '../anthropic';

describe('supportsEffort', () => {
  it.each([
    ['claude-opus-5-5', true],
    ['claude-sonnet-5-5', true],
    ['claude-haiku-5-5', true],
    ['claude-opus-5', true],
    ['claude-sonnet-5', true],
    ['claude-opus-4-8', true],
    ['claude-opus-4-7', true],
    ['claude-opus-4-6', true],
    ['claude-sonnet-4-6', true],
    ['claude-opus-4-5', true],
    ['claude-opus-4-5-20251101', true],
    ['claude-haiku-4-5', false],
    ['claude-haiku-4-5-20251001', false],
    ['claude-sonnet-4-5', false],
    ['claude-sonnet-4-5-20250929', false],
    ['claude-sonnet-4-0', false],
    ['claude-sonnet-4-20250514', false],
    ['claude-sonnet-4', false],
    ['claude-opus-4-0', false],
    ['claude-opus-4-1', false],
    ['claude-opus-4-1-20250805', false],
    ['claude-opus-4-20250514', false],
    ['claude-3-5-haiku-20241022', false],
  ])('%s → %s', (model, expected) => {
    expect(supportsEffort(model)).toBe(expected);
    expect(effortConfig(model, 'low')).toEqual(expected ? { effort: 'low' } : {});
  });
});

describe('textOf', () => {
  it('joins only text blocks, ignoring thinking blocks wherever they sit', () => {
    const message = {
      content: [
        { type: 'thinking', thinking: 'WRONG', signature: 's' },
        { type: 'text', text: 'SA' },
        { type: 'thinking', thinking: 'WRONG', signature: 's' },
        { type: 'text', text: 'FE' },
      ],
    };
    expect(textOf(message as never)).toBe('SAFE');
  });
});
