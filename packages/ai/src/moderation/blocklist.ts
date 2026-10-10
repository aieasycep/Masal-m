/**
 * Fast deterministic pre-filter for obviously unsafe story ideas (§17).
 * This is a first line of defense only — the LLM classifier is the real check.
 * Terms are matched as whole words, case/locale-insensitively: a Turkish term
 * may carry a short inflectional suffix (cinayet-i, kumar-a), an English term
 * only a plural. Plain substring matching once blocked innocent words such as
 * "grape" (…rape) and "esrarengiz" (esrar…).
 */
const BLOCKED_TERMS_TR = [
  'seks',
  'cinsel',
  'porno',
  'çıplak',
  'uyuşturucu',
  'eroin',
  'kokain',
  'esrar',
  'intihar',
  'kendini öldür',
  'kendine zarar',
  'işkence',
  'tecavüz',
  'katliam',
  'cinayet',
  'kumar',
  'silahla vur',
];

const BLOCKED_TERMS_EN = [
  'sex',
  'sexual',
  'porn',
  'naked',
  'drugs',
  'heroin',
  'cocaine',
  'suicide',
  'self-harm',
  'torture',
  'rape',
  'massacre',
  'murder',
  'gambling',
];

const escape = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOT_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_AFTER = '(?![\\p{L}\\p{N}])';

const BLOCKED: readonly RegExp[] = [
  // Turkish is agglutinative: allow up to four trailing letters of suffix.
  ...BLOCKED_TERMS_TR.map(
    (term) => new RegExp(`${NOT_BEFORE}${escape(term)}\\p{L}{0,4}${NOT_AFTER}`, 'u'),
  ),
  ...BLOCKED_TERMS_EN.map(
    (term) => new RegExp(`${NOT_BEFORE}${escape(term)}(?:e?s)?${NOT_AFTER}`, 'u'),
  ),
];

export function hitsBlocklist(text: string): boolean {
  const normalized = text.toLocaleLowerCase('tr');
  return BLOCKED.some((pattern) => pattern.test(normalized));
}
