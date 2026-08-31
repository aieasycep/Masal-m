import type { NarrationTiming } from '@masalim/validation';

/** Latest timing window at `position` → its pageNumber (containment first). */
export function activePageNumber(
  timings: readonly NarrationTiming[],
  position: number,
): number | null {
  const containing = timings.find(
    (timing) =>
      position >= timing.startSeconds && position < timing.startSeconds + timing.durationSeconds,
  );
  if (containing != null) return containing.pageNumber;
  let latest: NarrationTiming | null = null;
  for (const timing of timings) {
    if (
      timing.startSeconds <= position &&
      (latest == null || timing.startSeconds > latest.startSeconds)
    ) {
      latest = timing;
    }
  }
  return latest?.pageNumber ?? null;
}
