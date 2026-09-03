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
  mutedForeground: '#7A6D62',
  accent: '#B94F35',
  accentForeground: '#FFFFFF',
  border: '#E8E0D4',
  ring: '#B09CE0',

  lavender: '#B09CE0',
  lavenderLight: '#D4C8F0',
  dustyBlue: '#7BA7C9',
  /** Readable text-on-tint counterpart of dustyBlue (status pills). */
  dustyBlueText: '#3F6684',
  peach: '#F5C4A8',
  sage: '#8DB89A',
  /** Readable text-on-tint counterpart of sage (status pills). */
  sageText: '#22683B',
  coral: '#B94F35',
  /** Original light coral, kept ONLY for dark/night backgrounds. */
  coralOnDark: '#F08B6E',
  cream: '#FAF8F4',
  warmWhite: '#FFF9F2',
  gold: '#FFD97D',
  // Status colors (Claude Design Foundations, WCAG AA on cream/white).
  success: '#22683B',
  warning: '#805408',
  error: '#A32F2F',
  destructive: '#A32F2F',
  /** Darker destructive for text/buttons on light surfaces (contrast). */
  destructiveDeep: '#A32F2F',

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
  muted: '#91A1B8',
  purple: '#9B7FD4',
  blue: '#4A7FB5',
  border: '#2C3D5C',
  /** Karaoke active-word highlight (amber) — readable on every night surface. */
  highlight: '#FFD27D',
} as const;

/** Cover tint swatches used by story cards in the design. */
export const coverTints = ['#D4C8F0', '#B8D8E8', '#C5DFC8', '#F5C4A8', '#A8D4E8'] as const;

/** Premium/gold family (paywall hero, premium sheet, gold badges). */
export const premiumGold = {
  light: '#F5D080',
  bright: '#F0D080',
  mid: '#F0A56E',
  text: '#C07840',
} as const;

/**
 * Cover editor palettes (final design `Book/02-CoverEditor`). Keys are persisted
 * in Book.coverPalette; labels come from i18n (`book.palettes.*`).
 */
export const coverPalettes = {
  purple: ['#2D1B69', '#7C5CBF'],
  ocean: ['#0F2040', '#1E6B8A'],
  forest: ['#0F2A1A', '#2D6A4F'],
  sunset: ['#3D1A0A', '#C4622D'],
  night: ['#0D1B2E', '#1C3F6E'],
} as const;

export type CoverPaletteKey = keyof typeof coverPalettes;
