/**
 * Fast deterministic pre-filter for obviously unsafe story ideas (§17).
 * This is a first line of defense only — the LLM classifier is the real check.
 * Terms are matched as whole words, case/locale-insensitively.
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

const BLOCKED = [...BLOCKED_TERMS_TR, ...BLOCKED_TERMS_EN];

export function hitsBlocklist(text: string): boolean {
  const normalized = ` ${text.toLocaleLowerCase('tr')} `;
  return BLOCKED.some((term) => normalized.includes(` ${term}`) || normalized.includes(`${term} `));
}
