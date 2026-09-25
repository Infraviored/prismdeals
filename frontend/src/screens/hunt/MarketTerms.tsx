import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { ProbeRung } from '../../types';

/**
 * The search terms that were tried, one line each: the term as it goes to
 * Kleinanzeigen, how many offers the site reports, and how many of them the
 * title already shows to fit. A term that added nothing is struck through,
 * not flagged in red -- it did no harm, it is simply not kept.
 */
export const MarketTerms: React.FC<{ rungs: ProbeRung[]; isProbing: boolean }> = ({
  rungs,
  isProbing,
}) => {
  const { t } = useTranslation();
  if (!rungs.length && !isProbing) {
    return <p className="text-sm text-[#8FA6A1]">{t('hunt.marketNoResults')}</p>;
  }
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs text-[#8FA6A1]">{t('hunt.marketRungsTitle')}</h3>
      <ul className="divide-y divide-[#0E4A40]/50 border-y border-[#0E4A40]/50">
        {rungs.map((rung, idx) => (
          <li
            key={`${rung.term}-${idx}`}
            data-testid={`market-rung-row-${idx}`}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span
              className={`min-w-0 truncate ${rung.kept ? 'text-[#F2F5F4]' : 'text-[#8FA6A1] line-through'}`}
              title={rung.kept ? undefined : t('hunt.marketRungDropped')}
            >
              {rung.term || t('hunt.marketRungCategoryOnly')}
            </span>
            <span className="shrink-0 text-[#8FA6A1] [font-variant-numeric:tabular-nums]">
              {t('hunt.marketRungLine', {
                total: rung.total.toLocaleString('de-DE'),
                open: rung.likely + rung.unclear,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MarketTerms;
