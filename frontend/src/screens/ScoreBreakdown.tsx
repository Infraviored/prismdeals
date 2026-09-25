import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';

/** Why a listing scores what it scores (docs/product-core.md, section 10).
 *
 * The must-haves first -- met, broken, or not stated -- because they decide
 * whether the rest matters; then one line per graded axis. This replaces a
 * model's free-text impression ("vague, claim-heavy", in English), which said
 * nothing a buyer could check.
 */
export const ScoreBreakdown: React.FC<{ listing: RowListing }> = ({ listing }) => {
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
  const renderValueAxis = () => {
    if (delta === null) return null;
    if (market?.label && market.count) {
      if (delta > 0) return t('surface.axisValueBelowNode', { pct: delta, node: market.label, count: market.count });
      if (delta < 0) return t('surface.axisValueAboveNode', { pct: -delta, node: market.label, count: market.count });
      return t('surface.axisValueAtNode', { node: market.label, count: market.count });
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

      <ul className="breakdown-list">
        {parts.gate.violated.map((r) => (
          <li key={`v-${r}`} className="violated">✗ {r}</li>
        ))}
        {parts.gate.open.map((r) => (
          <li key={`o-${r}`} className="open">? {t('surface.reqOpen', { req: r })}</li>
        ))}
        {parts.gate.met.map((r) => (
          <li key={`m-${r}`} className="met">✓ {r}</li>
        ))}
        {(parts.wishes?.met || []).map((w) => (
          <li key={`wm-${w}`} className="met">✓ {t('surface.wishMet', { wish: w })}</li>
        ))}
        {(parts.wishes?.missed || []).map((w) => (
          <li key={`wx-${w}`} className="open">✗ {t('surface.wishMissed', { wish: w })}</li>
        ))}
        {(parts.wishes?.open || []).map((w) => (
          <li key={`wo-${w}`} className="open">? {t('surface.wishOpen', { wish: w })}</li>
        ))}
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
