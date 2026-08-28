/**
 * Canonical interests (design brief). Keys double as backend interest IDs:
 * the API normalizes interests to tr-lowercase, so these raw keys round-trip
 * unchanged and must be used for canonical-vs-custom matching (never the
 * translated labels).
 */
export const CANONICAL_INTERESTS: ReadonlyArray<{ key: string; emoji: string }> = [
  { key: 'dinozorlar', emoji: '🦕' },
  { key: 'uzay', emoji: '🚀' },
  { key: 'hayvanlar', emoji: '🐾' },
  { key: 'arabalar', emoji: '🚗' },
  { key: 'prensesler', emoji: '👑' },
  { key: 'deniz', emoji: '🌊' },
  { key: 'doğa', emoji: '🌿' },
  { key: 'robotlar', emoji: '🤖' },
  { key: 'futbol', emoji: '⚽' },
  { key: 'periler', emoji: '🧚' },
  { key: 'macera', emoji: '🗺️' },
  { key: 'müzik', emoji: '🎵' },
];

const CANONICAL_KEY_SET: ReadonlySet<string> = new Set(
  CANONICAL_INTERESTS.map((interest) => interest.key),
);

/** True when a stored interest value is one of the canonical keys. */
export function isCanonicalInterest(value: string): boolean {
  return CANONICAL_KEY_SET.has(value);
}
