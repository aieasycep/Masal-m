import type { NarrationTiming, NarrationWordTiming, NarrationWordTimings } from '@masalim/validation';

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

/**
 * Word under the playhead: the latest word that has started (`s <= position`)
 * — so the highlight rests on the last spoken word during pauses instead of
 * flickering off. Binary search over the sorted, monotonic timeline.
 */
export function activeWord(
  wordTimings: NarrationWordTimings | null | undefined,
  position: number,
): NarrationWordTiming | null {
  const words = wordTimings?.words;
  if (words == null || words.length === 0) return null;
  const first = words[0];
  if (first == null || position < first.s) return null;
  let lo = 0;
  let hi = words.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const word = words[mid];
    if (word != null && word.s <= position) lo = mid;
    else hi = mid - 1;
  }
  return words[lo] ?? null;
}

/** Page-local index of the active word if it lies on `pageNumber`, else null. */
export function activeWordIndexOnPage(
  wordTimings: NarrationWordTimings | null | undefined,
  position: number,
  pageNumber: number,
): number | null {
  const word = activeWord(wordTimings, position);
  return word != null && word.p === pageNumber ? word.i : null;
}

/** Start time of a given word (page + index) — for tap-to-seek. */
export function wordStartSeconds(
  wordTimings: NarrationWordTimings | null | undefined,
  pageNumber: number,
  index: number,
): number | null {
  const word = wordTimings?.words.find((item) => item.p === pageNumber && item.i === index);
  return word?.s ?? null;
}
