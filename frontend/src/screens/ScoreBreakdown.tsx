import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';

/** Why a listing scores what it scores (docs/produktkern.md, section 12).
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
  const condition = listing.details?.Zustand;

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
      </ul>

      <ul className="breakdown-list quiet">
        {delta !== null && (
          <li>
            {delta > 0
              ? t('surface.axisValueBelow', { pct: delta })
              : delta < 0
              ? t('surface.axisValueAbove', { pct: -delta })
              : t('surface.axisValueAt')}
          </li>
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
