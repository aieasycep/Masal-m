import type { ModerationVerdict } from './types';

export const CLASSIFIER_SYSTEM = [
  'You are a strict child-safety classifier for a bedtime-story app for children aged 0-12.',
  'Given content, decide if it is appropriate as (or as the basis of) a children\'s story.',
  'Block: sexual content, graphic violence, self-harm encouragement, drug use promotion, abuse,',
  'dangerous activities children could imitate, hate content, adult themes, and horror unsuitable for children.',
  'Mild, warm adventure/tension appropriate for bedtime stories is fine.',
  'Respond with EXACTLY one line: SAFE or UNSAFE:<category> where category is one snake_case word.',
].join(' ');

/** Parse the classifier's SAFE / UNSAFE:<category> reply into a verdict. */
export const parseVerdict = (text: string): ModerationVerdict => {
  const trimmed = text.trim();
  if (trimmed.startsWith('SAFE')) return { safe: true };
  const category = trimmed.startsWith('UNSAFE:')
    ? trimmed.slice('UNSAFE:'.length).trim()
    : 'unknown';
  return { safe: false, category };
};
