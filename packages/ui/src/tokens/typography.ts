/**
 * Typography tokens. Display: Fraunces (storybook serif); body: Nunito.
 * Font families map to the exact names registered via expo-font.
 */
export const fontFamilies = {
  display: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  displayBold: 'Fraunces_700Bold',
  displayItalic: 'Fraunces_400Regular_Italic',
  body: 'Nunito_500Medium',
  bodyRegular: 'Nunito_400Regular',
  bodySemiBold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyExtraBold: 'Nunito_800ExtraBold',
} as const;

/**
 * Size scale actually used by the design (see design-reference).
 * UI/UX QA pass bans user-facing text at 10px and below — xxs is now 11.
 */
export const fontSizes = {
  // Floor 12 (caption) / body 15 — tired parents, one hand, dim light (design constitution).
  xxs: 12,
  xs: 12,
  sm: 12,
  md: 13,
  base: 15,
  lg: 15,
  xl: 16,
  xxl: 17,
  h4: 18,
  h3: 22,
  h2: 24,
  h1: 26,
  display: 28,
  displayLg: 30,
  displayXl: 34,
  wordmark: 48,
} as const;

export const letterSpacing = {
  tight: -0.5,
  eyebrow: 0.8,
  wide: 1.1,
} as const;
