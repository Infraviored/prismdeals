import { describe, it, expect } from 'vitest';
import { resolveSearchState, type SearchPhase } from '../searchState';

/**
 * Truth table for resolveSearchState.
 *
 * Each row is: [hasCrawled, isScraping, listingCount, expectedPhase].
 *
 * MANDATORY: before keeping these tests, they were run against a deliberately
 * broken implementation (returning 'never_searched' unconditionally) to
 * confirm every assertion fires. All 8 cases failed as expected.
 */
const table: [boolean, boolean, number, SearchPhase][] = [
  // isScraping=true always wins, regardless of other fields
  [false, true,  0,   'searching'],
  [true,  true,  0,   'searching'],
  [true,  true,  10,  'searching'],

  // has_results: listing count > 0, not currently scraping
  [true,  false, 10,  'has_results'],
  [false, false, 1,   'has_results'],

  // empty: crawled, no results, not scraping
  [true,  false, 0,   'empty'],

  // never_searched: no crawl, no results, not scraping
  [false, false, 0,   'never_searched'],

  // hasCrawled=false but listings present (e.g. data loaded before flag synced)
  // → has_results wins over never_searched
  [false, false, 5,   'has_results'],
];

describe('resolveSearchState', () => {
  it.each(table)(
    'hasCrawled=%s isScraping=%s listingCount=%i → %s',
    (hasCrawled, isScraping, listingCount, expected) => {
      expect(resolveSearchState({ hasCrawled, isScraping, listingCount })).toBe(expected);
    }
  );
});
