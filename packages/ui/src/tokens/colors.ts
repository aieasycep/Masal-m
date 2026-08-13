/**
 * Design tokens — colors. Source of truth: docs/design-reference/src/index.css
 * (Figma Make export). Do not write raw hex values in screens (§51).
 */
export const colors = {
  background: '#FAF8F4',
  foreground: '#2C2825',
  card: '#FFFFFF',
  cardForeground: '#2C2825',
  primary: '#7C5CBF',
  primaryForeground: '#FFFFFF',
  secondary: '#EDE8F8',
  secondaryForeground: '#5A4190',
  muted: '#F2EDE6',
  mutedForeground: '#8A7D72',
  accent: '#F08B6E',
  accentForeground: '#FFFFFF',
  border: '#E8E0D4',
  ring: '#B09CE0',

  lavender: '#B09CE0',
  lavenderLight: '#D4C8F0',
  dustyBlue: '#7BA7C9',
  peach: '#F5C4A8',
  sage: '#8DB89A',
  coral: '#F08B6E',
  cream: '#FAF8F4',
  warmWhite: '#FFF9F2',
  gold: '#FFD97D',
  destructive: '#E05454',

  purpleDeep: '#2D1B69',
  purpleDarkest: '#1A0F3C',
  purpleSoft: '#9B7FD4',
} as const;

/** Night mode palette (player, generating, recording screens). */
export const night = {
  bg: '#0D1B2E',
  card: '#162035',
  surface: '#1E2D45',
  text: '#E8E0D4',
  muted: '#6B7A94',
  purple: '#9B7FD4',
  blue: '#4A7FB5',
} as const;

/** Cover tint swatches used by story cards in the design. */
export const coverTints = ['#D4C8F0', '#B8D8E8', '#C5DFC8', '#F5C4A8', '#A8D4E8'] as const;
