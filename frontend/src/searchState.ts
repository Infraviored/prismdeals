/**
 * Search state resolver.
 *
 * This is the ONE place in the codebase that decides what state a search is
 * in. Every rendering decision that depends on "did we search? did we find
 * anything?" must go through resolveSearchState(). Nothing else may reproduce
 * this logic.
 *
 * States:
 *   never_searched  — no scrape has ever been triggered for this search
 *   searching       — a scrape is actively running right now
 *   empty           — the scrape ran and returned zero listings
 *   has_results     — the scrape ran and returned at least one listing
 */

export type SearchPhase =
  | 'never_searched'
  | 'searching'
  | 'empty'
  | 'has_results';

export interface SearchStateInput {
  /** Has a scrape ever been triggered? True once the family/search has crawled. */
  hasCrawled: boolean;
  /** Is a scrape actively running right now? */
  isScraping: boolean;
  /** Number of listings in the current result set (after any filtering). */
  listingCount: number;
}

/**
 * Derives the canonical search phase from raw inputs.
 *
 * Priority order matters: a running scrape overrides even an existing result
 * set because the user needs to know something is happening. Never-searched
 * comes last because any positive signal (crawled or results present) means
 * we have searched.
 */
export function resolveSearchState(input: SearchStateInput): SearchPhase {
  if (input.isScraping) {
    return 'searching';
  }
  if (input.listingCount > 0) {
    return 'has_results';
  }
  if (input.hasCrawled) {
    return 'empty';
  }
  return 'never_searched';
}
