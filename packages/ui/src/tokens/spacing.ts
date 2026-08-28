/** 8pt spacing system (§51) with the design's recurring values. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  /** Standard horizontal page gutter from the design. */
  pageX: 24,
  /** Onboarding/player wider gutter. */
  pageXWide: 32,
  /** Content top offset below the status bar. */
  pageTop: 52,
  /** Scroll padding to clear the bottom tab bar. */
  tabBarClearance: 100,
} as const;
