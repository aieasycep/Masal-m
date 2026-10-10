import type { GeneratedStory } from '@masalim/validation';
import { StoryGenerationError } from './types';

/** Hard page-text ceiling of `generatedStorySchema` (the reader/TTS chunk budget). */
export const MAX_PAGE_TEXT_CHARS = 2200;

/** `generatedStorySchema` lower bound on pages — fewer cannot be persisted. */
const MIN_PAGES = 3;

/**
 * Slack above the requested page count before trailing pages are folded
 * together: a model that writes one or two extra pages still reads naturally,
 * anything beyond that is merged so the story keeps its planned length.
 */
const PAGE_OVERFLOW_SLACK = 2;

/**
 * Shape a model's page list into what the database can store: blank pages
 * are dropped, pages are ordered and renumbered 1..n (duplicate or gapped
 * `pageNumber`s from the model would violate the `(storyId, pageNumber)`
 * unique key and send a paid generation into a retry), and a story that
 * overshoots `targetPages` by more than the slack has its trailing pages
 * merged into the last allowed page. The surviving page keeps its own
 * `illustrationPrompt`. A story that cannot be made to fit is reported as
 * `INVALID_OUTPUT` — deterministic for a given output, so not worth a retry.
 */
export function normalizeGeneratedStory(
  story: GeneratedStory,
  targetPages: number,
): GeneratedStory {
  const ordered = story.pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => page.text.trim().length > 0)
    // Explicit index tiebreak: equal page numbers keep their original order.
    .sort((a, b) => a.page.pageNumber - b.page.pageNumber || a.index - b.index)
    .map(({ page }, position) => ({ ...page, pageNumber: position + 1 }));

  if (ordered.length < MIN_PAGES) {
    throw new StoryGenerationError(
      `Story has ${ordered.length} non-empty page(s); at least ${MIN_PAGES} are required`,
      'INVALID_OUTPUT',
    );
  }

  const ceiling = targetPages + PAGE_OVERFLOW_SLACK;
  if (ordered.length <= ceiling) return { ...story, pages: ordered };

  const head = ordered.slice(0, ceiling - 1);
  const tail = ordered.slice(ceiling - 1);
  const mergedText = tail.map((page) => page.text.trim()).join('\n\n');
  if (mergedText.length > MAX_PAGE_TEXT_CHARS) {
    throw new StoryGenerationError(
      `Story has ${ordered.length} pages for a target of ${targetPages}; the overflow (${mergedText.length} chars) does not fit one page`,
      'INVALID_OUTPUT',
    );
  }
  const anchor = tail[0] as (typeof tail)[number];
  return {
    ...story,
    pages: [...head, { ...anchor, pageNumber: ceiling, text: mergedText }],
  };
}
