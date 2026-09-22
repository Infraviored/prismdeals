import React from 'react';
import type { RowListing } from '../components/surface/Row';
import { useTranslation } from '../hooks/useTranslation';
import { formatLocation } from '../utils/formatLocation';

export interface CampaignOverviewData {
  campaign_id: number;
  campaign_name: string;
  scope_kind?: string;
  search_id?: number | null;
  last_crawled_at?: string | null;
  schedule_interval?: number | null;
  pots: {
    all: number;
    fit: number;
    unclear: number;
    no: number;
    unjudged?: number;
  };
  rejections: Array<{
    reason: string;
    count: number;
    examples?: string[];
  }>;
  market: {
    median: number | null;
    deal_threshold: number | null;
    cheapest: number | null;
    min: number | null;
    max: number | null;
    count: number;
    bins: Array<{
      min: number;
      max: number;
      count: number;
      label: string;
    }>;
    cluster_share?: number;
    cluster_min?: number;
    cluster_max?: number;
  };
  requirements: Array<{
    id: string;
    label: string;
    unit: string | null;
    text: string;
    buyer_wants: Record<string, unknown>;
    survivors: number;
    passed: number;
    contradicted: number;
    missing: number;
    total: number;
  }>;
}

export interface FundeAsideProps {
  overview: CampaignOverviewData | null;
  bestListing: RowListing | null;
}

export const FundeAside: React.FC<FundeAsideProps> = ({ overview, bestListing }) => {
  const { t } = useTranslation();

  if (!overview || !overview.market) return null;

  const { market, requirements, rejections } = overview;
  const bins = market?.bins || [];
  const peak = Math.max(1, ...bins.map((b) => b.count));
  const minPrice = market?.min ?? 0;
  const maxPrice = market?.max ?? 0;
  const medianPrice = market?.median ?? 0;

  // Determine which bin contains the best deal
  let dealBinIdx = -1;
  if (bestListing?.is_deal && typeof bestListing.price_eur === 'number') {
    const bp = bestListing.price_eur;
    dealBinIdx = bins.findIndex((b) => bp >= b.min && bp <= b.max);
  }

  // Median line position
  const span = Math.max(1, maxPrice - minPrice);
  const medPos = Math.max(0, Math.min(100, ((medianPrice - minPrice) / span) * 100));

  // Market lead sentence: where mass lies
  const share = market?.cluster_share;
  const cMin = market?.cluster_min;
  const cMax = market?.cluster_max;

  let lead: string;
  if (typeof share === 'number' && typeof cMin === 'number' && typeof cMax === 'number') {
    const shareSentence = t('surface.sharePriceRange', { share, min: cMin, max: cMax });
    if (bestListing?.is_deal && typeof bestListing.price_eur === 'number') {
      const city = bestListing.location ? formatLocation(bestListing.location) : '';
      lead = `${shareSentence} ${t('surface.singleBestKit', { price: String(bestListing.price_eur), city })}`;
    } else {
      lead = shareSentence;
    }
  } else {
    const bestCity = bestListing?.location ? formatLocation(bestListing.location) : '';
    lead = bestListing?.is_deal && typeof bestListing.price_eur === 'number'
      ? `${market.count} Angebote im Markt. Für ${bestListing.price_eur} €${bestCity ? ` in ${bestCity}` : ''} ist dieses Angebot das günstigste passende deutlich unter dem Median.`
      : `${market.count} Angebote im Markt mit einem Median von ${medianPrice} €.`;
  }

  return (
    <aside className="aside" aria-label="Markt und Anforderungen">
      {/* 1. Markt Panel */}
      <section className="panel" id="market">
        <h2>{t('surface.market')}</h2>
        <p className="lead">{lead}</p>

        {bins.length > 0 && (
          <div
            className="hist"
            role="img"
            aria-label={`Preisverteilung von ${minPrice} € bis ${maxPrice} €, Median ${medianPrice} €`}
          >
            <div className="bars">
              {bins.map((b, idx) => (
                <div
                  key={idx}
                  className={`bar ${idx === dealBinIdx ? 'deal' : ''}`}
                  style={{ height: `${Math.max(4, (b.count / peak) * 100)}%` }}
                  title={`${b.label}: ${b.count}`}
                />
              ))}
            </div>

            {medianPrice > 0 && (
              <div className="median-line" style={{ left: `${medPos}%` }} />
            )}

            <div className="axis">
              <span className="num">{minPrice} €</span>
              <span className="num">{maxPrice} €</span>
            </div>
          </div>
        )}

        <p className="legend">
          {medianPrice > 0 && (
            <span>
              <i className="l-median" />
              {t('surface.median', { amount: medianPrice })}
            </span>
          )}
          {dealBinIdx >= 0 && typeof bestListing?.price_eur === 'number' && (
            <span>
              <i className="l-deal" />
              {t('surface.bestFindLegend', { amount: bestListing.price_eur })}
            </span>
          )}
        </p>
      </section>

      {/* 2. Was du willst Panel */}
      {requirements.length > 0 && (
        <section className="panel" id="requirements">
          <h2>{t('surface.whatYouWant')}</h2>
          <p className="lead">
            <span className="quiet">
              {t('surface.howManyFulfill', { total: requirements[0].total || overview.pots.all })}
            </span>
          </p>

          <div style={{ marginTop: '8px' }}>
            {requirements.map((req) => {
              const total = req.total || overview.pots.all || 1;
              const survivors = req.survivors;
              const pct = Math.max(0, Math.min(100, (survivors / total) * 100));

              return (
                <div key={req.id} className="req">
                  <div className="req-top">
                    <span>{req.text || req.label}</span>
                    <span className="num">
                      <b>{survivors}</b> {t('surface.outOf', { count: survivors, total }).replace(`${survivors} `, '')}
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

      {/* 3. Warum abgelehnt Panel */}
      {rejections.length > 0 && (
        <section className="panel" id="rejections">
          <h2>{t('surface.whyRejected')}</h2>
          <ul className="why">
            {rejections.map((r, idx) => (
              <li key={idx}>
                <span className="num">{r.count}×</span>
                <span>{/sodimm.*statt.*dimm/i.test(r.reason) ? 'SODIMM statt DIMM' : r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
};
