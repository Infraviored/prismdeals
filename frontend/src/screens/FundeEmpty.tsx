import React from 'react';
import { EmptyLine, Pill } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import { formatFreshness } from '../utils/freshness';
import type { RadiusDiagnosis } from '../types';

export interface FundeEmptyProps {
  tab: string;
  potAll: number;
  potUnclear: number;
  termCount: number;
  lastCrawledAt: string | null | undefined;
  isScraping: boolean;
  radiusDiagnosis: RadiusDiagnosis | null;
  diagnosing: boolean;
  onShowUnclear: () => void;
  onWiden: (km: number) => void;
  onConfigure: () => void;
}

/** What an empty list says, and what the buyer can do about it.
 *
 * Every empty state names a next step. "Die Suche hat noch nichts geliefert,
 * Funde abrufen startet sie" under a search that had just run and found
 * nothing sent the buyer pressing the same button again and again.
 */
export const FundeEmpty: React.FC<FundeEmptyProps> = ({
  tab,
  potAll,
  potUnclear,
  termCount,
  lastCrawledAt,
  isScraping,
  radiusDiagnosis,
  diagnosing,
  onShowUnclear,
  onWiden,
  onConfigure,
}) => {
  const { t } = useTranslation();

  // Listings exist, this tab is just empty.
  if (potAll > 0 && tab !== 'all') {
    if (tab === 'fit') {
      return (
        <EmptyLine
          message={t('surface.emptyFit')}
          actions={
            potUnclear > 0
              ? [<Pill key="unclear" label={t('surface.showUnclear')} count={potUnclear} onClick={onShowUnclear} />]
              : undefined
          }
        />
      );
    }
    return <EmptyLine message={t('surface.emptyTab')} />;
  }

  if (isScraping) return <EmptyLine message={t('surface.searchRunning')} />;

  // Never searched yet.
  if (!lastCrawledAt) return <EmptyLine message={t('surface.emptySearch')} />;

  // Searched, found nothing: say so, then offer the ways out.
  const when = formatFreshness(lastCrawledAt, t)?.label ?? '';
  const current = radiusDiagnosis?.current_radius ?? null;
  const wider = (radiusDiagnosis?.options || []).filter(
    (o) => o.count > 0 && (current === null || o.radius > current)
  );

  const actions: React.ReactNode[] = wider.map((o) => (
    <Pill key={o.radius} label={t('surface.widenTo', { radius: o.radius })} count={o.count} onClick={() => onWiden(o.radius)} />
  ));
  actions.push(<Pill key="terms" label={t('surface.changeTerms')} onClick={onConfigure} />);

  const hint = diagnosing
    ? t('surface.checkingWider')
    : radiusDiagnosis && wider.length === 0
    ? t('surface.nothingWider', { radius: Math.max(...(radiusDiagnosis.options || []).map((o) => o.radius), current ?? 0) })
    : null;

  return (
    <EmptyLine
      message={
        <>
          {t('surface.searchedEmpty', { when, count: termCount })}
          {hint && <span className="block text-[#8FA6A1] mt-1">{hint}</span>}
        </>
      }
      actions={actions}
    />
  );
};

export default FundeEmpty;
