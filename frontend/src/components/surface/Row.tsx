import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatFreshness, type TranslateFn } from '../../utils/freshness';
import { PriceTrail } from './PriceTrail';

import { formatLocation } from '../../utils/formatLocation';
import { formatPrice } from '../../utils/formatPrice';

export interface RowListing {
  id: string;
  title: string;
  price?: string | null;
  price_eur?: number | null;
  location?: string | null;
  images?: string[];
  image_url?: string | null;
  detour_min?: number | null;
  offroute_km?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_deal?: boolean;
  status?: string | null;
  url?: string;
  matched_terms?: Array<{ id: number; label: string }>;
  lat?: number | null;
  lon?: number | null;
  description?: string | null;
  summary?: string | null;
  price_delta_eur?: number | null;
  price_history?: Array<{ price_eur: number | null; seen_at: string }> | null;
  reference_price_eur?: number | null;
  niceness_score?: number | null;
  reference_comparison?: { closer_to: 'good' | 'bad' | 'mixed'; reasoning: string } | null;
  fit?: {
    verdict: 'fit' | 'unclear' | 'no';
    reason?: string | null;
    stage?: string | null;
    facts?: Record<string, unknown>;
  } | null;
}

/** The line a verdict earns: what was checked, or why it was turned down.
 *
 * A rejection says the one fact that decided it -- "4 Riegel statt 2" beats a
 * list of everything that was fine. A match says what it is, because that is
 * what a buyer compares.
 */
function summariseFit(fit: NonNullable<RowListing['fit']>): string {
  if (fit.verdict === 'no') return fit.reason || 'passt nicht';

  const facts = fit.facts || {};
  const parts: string[] = [];
  if (facts.stickCount && facts.gbPerStick) {
    parts.push(`${facts.stickCount}×${facts.gbPerStick} GB`);
  }
  if (facts.generation && facts.speedMhz) {
    parts.push(`${String(facts.generation).toUpperCase()}-${facts.speedMhz}`);
  } else if (facts.generation) {
    parts.push(String(facts.generation).toUpperCase());
  }
  if (facts.casLatency) parts.push(`CL${facts.casLatency}`);

  if (parts.length === 0) return fit.reason || '';
  return parts.join(' · ');
}

export interface RowProps {
  listing: RowListing;
  onClick?: (listing: RowListing) => void;
  isDeal?: boolean;
  isKept?: boolean;
  onToggleKeep?: (listingId: string) => void;
  className?: string;
}


function renderDetour(listing: RowListing, t: TranslateFn): React.ReactNode {
  if (typeof listing.detour_min === 'number') {
    if (listing.detour_min <= 0) {
      return (
        <span className="text-[#10B981] font-medium">
          {t('surface.onRoute')}
        </span>
      );
    }
    return (
      <span className="text-[#9FB3B0]">
        {t('surface.minDetour', { min: Math.round(listing.detour_min) })}
      </span>
    );
  }
  if (typeof listing.offroute_km === 'number' && listing.offroute_km > 0) {
    return (
      <span className="text-[#9FB3B0]">
        {t('surface.kmDistance', { km: Math.round(listing.offroute_km) })}
      </span>
    );
  }
  return <span className="text-transparent select-none">—</span>;
}

export const Row: React.FC<RowProps> = ({
  listing,
  onClick,
  isDeal: propIsDeal,
  isKept = false,
  onToggleKeep,
  className = '',
}) => {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const imageUrl =
    !imgError && (listing.image_url || (listing.images && listing.images.length > 0 ? listing.images[0] : null));

  const freshness = formatFreshness(listing.first_seen_at || listing.last_seen_at, t);
  const priceInfo = formatPrice(listing.price_eur, listing.price, t);
  const isDeal = propIsDeal ?? !!listing.is_deal;

  const priceClass = isDeal
    ? 'text-[#E87967]'
    : priceInfo.isMissing
    ? 'text-[#9FB3B0]'
    : 'text-[#F2F5F4]';

  return (
    <article
      data-testid="listing-row"
      data-listing-id={listing.id}
      onClick={() => onClick?.(listing)}
      // A row that only a mouse can open is a row a keyboard buyer cannot buy
      // from: the find sheet, and with it the link to Kleinanzeigen, was
      // unreachable without a pointer. SearchRow had this from the start.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(listing);
              }
            }
          : undefined
      }
      className={`h-[88px] min-h-[88px] max-h-[88px] w-full px-3 sm:px-4 py-2 flex items-center gap-3 border-b border-white/[0.08] hover:bg-white/[0.03] transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9FB3B0] ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* 72px square thumbnail on left */}
      <div className="w-[72px] h-[72px] min-w-[72px] rounded bg-white/[0.04] overflow-hidden shrink-0 flex items-center justify-center relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={listing.title || ''}
            onError={() => setImgError(true)}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#9FB3B0]/40">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Center column: Title (max 2 lines) + Location / Age */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <h2 className="text-sm font-medium text-[#F2F5F4] line-clamp-2 surface-row-text">
          {listing.title || '—'}
        </h2>

        {/* What was checked, where it matters more than where the thing is.
            For a memory kit the town decides nothing and "2×16 · DDR4-3200 ·
            CL16" decides everything, so the verdict's own facts take the line
            when there is one. */}
        {listing.fit ? (
          <div className="text-2xs truncate flex items-center gap-1.5 mt-0.5">
            <span
              className={
                listing.fit.verdict === 'fit'
                  ? 'text-[#10B981] shrink-0'
                  : listing.fit.verdict === 'no'
                  ? 'text-[#8A9694] shrink-0'
                  : 'text-[#D9A441] shrink-0'
              }
            >
              {listing.fit.verdict === 'fit' ? '✓' : listing.fit.verdict === 'no' ? '✗' : '?'}
            </span>
            <span className="truncate text-[#9FB3B0]">
              {summariseFit(listing.fit)}
            </span>
            {/* The number only where it adds something. For a match the answer
                is yes and the price decides; for a rejection it is no. A score
                beside either is a second scale that can only disagree with the
                first. */}
            {listing.fit.verdict === 'unclear' && typeof listing.niceness_score === 'number' && (
              <span className="shrink-0 tabular-nums text-[#9FB3B0]/70">
                {listing.niceness_score}/100
              </span>
            )}
          </div>
        ) : (
        <div className="text-2xs text-[#9FB3B0] truncate flex items-center gap-1.5 mt-0.5">
          {listing.location && (
            <span className="truncate">{formatLocation(listing.location)}</span>
          )}
          {listing.location && freshness && (
            <span className="text-white/20 select-none">·</span>
          )}
          {freshness && (
            <span className={freshness.isStale ? 'text-[#D9A441]' : ''}>
              {freshness.label}
            </span>
          )}
          {!listing.location && !freshness && (
            <span className="text-[#9FB3B0]/50">—</span>
          )}
        </div>
        )}
      </div>

      {/* Keeping a find. Quiet until it is on -- a row full of marks would
          compete with the price, which is the thing that decides. */}
      {onToggleKeep && (
        <button
          type="button"
          data-testid="keep-toggle"
          aria-pressed={isKept}
          aria-label={t(isKept ? 'surface.unkeep' : 'surface.keep')}
          onClick={event => {
            event.stopPropagation();
            onToggleKeep(listing.id);
          }}
          className={`shrink-0 flex items-center justify-center min-w-[36px] min-h-[36px] rounded-full transition-colors ${
            isKept ? 'text-[#F2F5F4]' : 'text-[#9FB3B0]/40 hover:text-[#9FB3B0]'
          }`}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill={isKept ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z" />
          </svg>
        </button>
      )}

      {/* Right column: Price hero + quiet Detour underneath */}
      <div className="shrink-0 text-right flex flex-col justify-center items-end pl-2 min-w-[72px]">
        <div
          data-testid="listing-price"
          className={`text-base sm:text-lg font-bold font-heading tabular-nums leading-tight ${priceClass}`}
        >
          {priceInfo.text}
        </div>

        {/* Where the price has been, and the market it is measured against.
            Only for listings whose price actually moved: a flat line would
            claim a history the listing does not have. */}
        {listing.price_history && listing.price_history.length > 1 ? (
          <div className="mt-0.5 min-h-[16px] flex items-center justify-end gap-1">
            {typeof listing.price_delta_eur === 'number' && listing.price_delta_eur > 0 && (
              <span className="text-2xs tabular-nums text-[#10B981]">
                −{listing.price_delta_eur} €
              </span>
            )}
            <PriceTrail
              history={listing.price_history}
              reference={
                typeof listing.price_eur === 'number' && typeof listing.price_delta_eur === 'number'
                  ? listing.price_eur + listing.price_delta_eur
                  : null
              }
            />
          </div>
        ) : (
          <div className="text-2xs tabular-nums mt-0.5 min-h-[16px] flex items-center justify-end">
            {renderDetour(listing, t)}
          </div>
        )}
      </div>
    </article>
  );
};
