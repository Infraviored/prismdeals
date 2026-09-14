import type { SearchFamilyTerm, SearchFamilyPreview } from '../types';
import type { TranslationPath } from '../i18n/translations';

/**
 * Parses raw multiline text into an array of search family terms.
 * Trims each line and discards blank lines.
 */
export function parseLinesToTerms(text: string): SearchFamilyTerm[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      term: line,
      label: line,
      enabled: true,
    }));
}

/**
 * Formats the search family preview calculation into a factual multiplication string.
 * Example: "10 Modelle × 6 Kreise = 60 Suchen · 13 davon laufen schon · ca. 4 Minuten"
 */
export function formatMultiplication(
  preview: SearchFamilyPreview,
  t: (path: TranslationPath, replacements?: Record<string, string | number>) => string
): string {
  const minutes = Math.max(1, Math.round((preview.estimated_seconds || 0) / 60));
  const timeStr =
    preview.estimated_seconds < 60
      ? t('searchFamily.secondsEstimate', { count: preview.estimated_seconds })
      : t('searchFamily.minutesEstimate', { count: minutes });

  const circlesLabel =
    preview.circles > 1
      ? t('searchFamily.circlesCount', { count: preview.circles })
      : t('searchFamily.singleLocation');

  if (preview.circles > 1) {
    return t('searchFamily.multiplicationFact', {
      terms: preview.terms,
      circles: circlesLabel,
      searches: preview.searches,
      reused: preview.reused_searches,
      minutes: timeStr,
    });
  }

  return t('searchFamily.multiplicationFactSingle', {
    terms: preview.terms,
    searches: preview.searches,
    reused: preview.reused_searches,
    minutes: timeStr,
  });
}
