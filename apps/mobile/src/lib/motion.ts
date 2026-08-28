import { useReducedMotion } from 'react-native-reanimated';

/**
 * QA a11y pass: looping decorative animations must respect the platform
 * "reduce motion" preference (the RN equivalent of the design's
 * `@media (prefers-reduced-motion: reduce)` block).
 *
 * Reanimated already defaults every animation to `ReduceMotion.System`
 * (animation/util.ts — absent config === System), so withTiming/withRepeat
 * loops are skipped automatically when the OS setting is on. Use this hook
 * only where the frozen END value of a skipped loop would look wrong
 * (e.g. Starfield stars would freeze dim at 0.6 opacity) to pick a better
 * static state instead.
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion();
}
