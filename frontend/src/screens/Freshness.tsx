import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { formatFreshness } from '../utils/freshness';

export interface FreshnessProps {
  isScraping: boolean;
  /** When the search last ran; falls back to the newest find. */
  lastCrawledAt: string | null | undefined;
  /** The schedule, in minutes, as the planner reads it. 0: off. */
  scheduleMinutes: number;
}

/** "Zuletzt gesucht vor 2 Std" -- and while a crawl runs, that instead. */
export const Freshness: React.FC<FreshnessProps> = ({ isScraping, lastCrawledAt, scheduleMinutes }) => {
  const { t } = useTranslation();
  // While a crawl runs, that is the news -- not when the last one was.
  if (isScraping) {
    return <p className="freshness" id="freshness" data-testid="freshness">{t('surface.searchRunning')}</p>;
  }
  if (!lastCrawledAt) return null;
  const f = formatFreshness(lastCrawledAt, t);
  if (!f) return null;
  // schedule_interval is in minutes. 90 used to read "every 90 hours".
  const minutes = scheduleMinutes;
  const text =
    minutes <= 0
      ? t('surface.freshnessOnce', { when: f.label })
      : minutes === 60
      ? t('surface.freshnessHourly', { when: f.label })
      : minutes % 60 === 0
      ? t('surface.freshnessInterval', { when: f.label, interval: minutes / 60 })
      : t('surface.freshnessIntervalMin', { when: f.label, interval: minutes });
  return <p className="freshness" id="freshness" data-testid="freshness">{text}</p>;
};

export default Freshness;
