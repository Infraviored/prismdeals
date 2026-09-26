import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';
import type { Condition } from '../types/hunt';

const ORDER = { violated: 0, open: 1, met: 2 } as const;

/** Why a listing scores what it scores (docs/product-core.md, section 10).
 *
 * The hunt's conditions first -- met, broken, or not stated, as the verdict
 * computed them -- because they decide whether the rest matters; then one line
 * per graded axis.
 */
export const ScoreBreakdown: React.FC<{ listing: RowListing; conditions?: Map<string, Condition> }> = ({
  listing,
  conditions = new Map(),
}) => {
  const { t } = useTranslation();
  const parts = listing.score_parts;
  if (!parts || typeof listing.score !== 'number') return null;

  const tone = listing.score >= 90 ? 'high' : listing.score >= 70 ? 'mid' : 'low';
  const delta =
    typeof listing.price_eur === 'number' && listing.market_median
      ? Math.round(((listing.market_median - listing.price_eur) / listing.market_median) * 100)
      : null;
  const condition = (listing.details?.Zustand || listing.details?.zustand) as string | undefined;
  const market = listing.market_basis || parts.market_basis || null;
  const node = market?.label || listing.target?.name;
  const states = Object.entries(listing.fit?.states || {})
    .filter(([id]) => conditions.has(id) && !conditions.get(id)!.says_nothing)
    .sort((a, b) => ORDER[a[1]] - ORDER[b[1]]);
  const renderValueAxis = () => {
    if (delta === null) return null;
    if (node && market?.count) {
      if (delta > 0) return t('surface.axisValueBelowNode', { pct: delta, node, count: market.count });
      if (delta < 0) return t('surface.axisValueAboveNode', { pct: -delta, node, count: market.count });
      return t('surface.axisValueAtNode', { node, count: market.count });
    }
    if (market?.count) {
      if (delta > 0) return t('surface.axisValueBelowCount', { pct: delta, count: market.count });
      if (delta < 0) return t('surface.axisValueAboveCount', { pct: -delta, count: market.count });
      return t('surface.axisValueAtCount', { count: market.count });
    }
    if (delta > 0) return t('surface.axisValueBelow', { pct: delta });
    if (delta < 0) return t('surface.axisValueAbove', { pct: -delta });
    return t('surface.axisValueAt');
  };

  return (
    <section className="breakdown" data-testid="score-breakdown">
      <div className="breakdown-head">
        <span className={`score num ${tone}`}>{t('surface.score', { score: listing.score })}</span>
        <span className="text-xs text-[#8FA6A1]">{t('surface.scoreWhat')}</span>
      </div>

      {listing.fit?.reason && listing.fit.verdict !== 'fit' && (
        <p className="text-sm text-[#8FA6A1]" data-testid="fit-reason">{listing.fit.reason}</p>
      )}

      <ul className="breakdown-list">
        {states.map(([id, state]) => {
          const c = conditions.get(id)!;
          const text = c.text || c.label;
          // A minus wish ("stört", weight < 0) is good when the offer does not have it.
          const minus = c.importance === 'wish' && (c.weight ?? 0) < 0;
          const good = minus ? state === 'violated' : state === 'met';
          const mark = state === 'open' ? '?' : good ? '✓' : '✗';
          const line =
            c.importance === 'must'
              ? state === 'open' ? t('surface.reqOpen', { req: text }) : text
              : minus
                ? state === 'met' ? t('surface.wishBothers', { wish: text })
                : state === 'violated' ? t('surface.wishBothersNot', { wish: text })
                : t('surface.wishBothersOpen', { wish: text })
              : state === 'met' ? t('surface.wishMet', { wish: text })
              : state === 'violated' ? t('surface.wishMissed', { wish: text })
              : t('surface.wishOpen', { wish: text });
          return (
            <li key={id} className={state === 'open' ? 'open' : good ? 'met' : 'violated'}>
              {mark} {line}
            </li>
          );
        })}
      </ul>

      <ul className="breakdown-list quiet">
        {delta !== null && (
          <li>{renderValueAxis()}</li>
        )}
        {typeof condition === 'string' && condition && <li>{t('surface.axisCondition', { condition })}</li>}
        {typeof listing.detour_min === 'number' && (
          <li>{t('surface.axisDetour', { min: Math.round(listing.detour_min) })}</li>
        )}
      </ul>
    </section>
  );
};

export default ScoreBreakdown;
