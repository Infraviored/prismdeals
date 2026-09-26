import React from 'react';
import type { RowListing } from '../components/surface/Row';
import type { HuntDocument, HuntOverview } from '../types/hunt';
import { useTranslation } from '../hooks/useTranslation';

export interface FundeAsideProps {
  overview: HuntOverview | null;
  bestListing: RowListing | null;
  /** For naming the target a condition belongs to. */
  doc?: HuntDocument | null;
}

/** Market, conditions and rejections of the whole hunt, beside the list. */
export const FundeAside: React.FC<FundeAsideProps> = ({ overview, bestListing, doc }) => {
  const { t } = useTranslation();
  if (!overview) return null;

  const dist = overview.price_distribution;
  const bins = dist.bins || [];
  const peak = Math.max(1, ...bins.map((b) => b.count));
  const markets = overview.markets.filter((m) => m.count > 0 && typeof m.median === 'number');
  const targetName = new Map((doc?.targets || []).map((tg) => [tg.node_id, tg.name || tg.typed]));

  let dealBin = -1;
  if (bestListing?.is_deal && typeof bestListing.price_eur === 'number') {
    const p = bestListing.price_eur;
    dealBin = bins.findIndex((b) => p >= b.min && p <= b.max);
  }

  return (
    <aside className="aside" aria-label={t('surface.marketAndRequirements')}>
      {dist.count > 0 && (
        <section className="panel" id="market">
          <h2>{t('surface.market')}</h2>
          <p className="lead">{t('huntEdit.marketLead', { count: dist.count })}</p>
          {bins.length > 0 && (
            <div className="hist" role="img" aria-label={t('huntEdit.priceRangeAria', { min: dist.min ?? 0, max: dist.max ?? 0 })}>
              <div className="bars">
                {bins.map((b, i) => (
                  <div
                    key={i}
                    className={`bar ${i === dealBin ? 'deal' : ''}`}
                    style={{ height: `${Math.max(4, (b.count / peak) * 100)}%` }}
                    title={`${b.label}: ${b.count}`}
                  />
                ))}
              </div>
              <div className="axis">
                <span className="num">{dist.min} €</span>
                <span className="num">{dist.max} €</span>
              </div>
            </div>
          )}
          {markets.length > 0 && (
            <div data-testid="markets" style={{ marginTop: '8px' }}>
              {markets.map((m) => (
                <div key={m.node_id} className="req-top">
                  <span>{t('huntEdit.marketLine', { name: m.name, count: m.count })}</span>
                  <span className="num whitespace-nowrap">{m.median} €</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {overview.conditions.length > 0 && (
        <section className="panel" id="requirements">
          <h2>{t('surface.whatYouWant')}</h2>
          <div style={{ marginTop: '8px' }}>
            {overview.conditions.map((c) => {
              const pct = c.total ? Math.max(0, Math.min(100, (c.met / c.total) * 100)) : 0;
              const owner = c.node_id !== null ? targetName.get(c.node_id) : null;
              return (
                <div key={c.id} className="req">
                  <div className="req-top">
                    <span>
                      {c.text || c.label}
                      {owner && <span className="quiet"> · {owner}</span>}
                      {c.importance === 'wish' && <span className="quiet"> · {t('huntEdit.wish')}</span>}
                    </span>
                    <span className="num whitespace-nowrap">
                      <b>{c.met}</b> / {c.total}
                    </span>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {overview.rejections.length > 0 && (
        <section className="panel" id="rejections">
          <h2>{t('surface.whyRejected')}</h2>
          <ul className="why">
            {overview.rejections.map((r) => (
              <li key={r.reason} title={r.examples.join('\n')}>
                <span className="num">{r.count}×</span>
                <span>{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
};
