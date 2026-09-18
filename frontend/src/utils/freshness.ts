import type { TranslationPath } from '../i18n/translations';

export type TranslateFn = (path: TranslationPath, params?: Record<string, string | number>) => string;

export interface FreshnessResult {
  label: string;
  isStale: boolean;
}

export function formatFreshness(
  timestamp: string | null | undefined,
  t: TranslateFn
): FreshnessResult | null {
  if (!timestamp) return null;

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return { label: t('surface.today'), isStale: false };

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return { label: t('surface.today'), isStale: false };
    }
    if (diffHours < 24) {
      return { label: t('surface.hoursAgo', { hours: diffHours }), isStale: false };
    }
    if (diffDays === 1) {
      return { label: t('surface.yesterday'), isStale: false };
    }
    return {
      label: t('surface.daysAgo', { days: diffDays }),
      isStale: diffDays >= 7,
    };
  } catch {
    return null;
  }
}
