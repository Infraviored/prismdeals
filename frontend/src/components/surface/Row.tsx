import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatFreshness } from '../../utils/freshness';
import { formatLocation } from '../../utils/formatLocation';
import { formatPrice } from '../../utils/formatPrice';
import { getSpecChips } from '../../utils/specChips';

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

export interface RowProps {
  listing: RowListing;
  onClick?: (listing: RowListing) => void;
  isDeal?: boolean;
  isKept?: boolean;
  onToggleKeep?: (listingId: string) => void;
  className?: string;
}

function renderSpecs(facts: Record<string, unknown> = {}): React.ReactNode[] {
  return getSpecChips(facts).map((c, i) => (
    <span key={i} className={c.includes('×') ? 'tabular-nums' : undefined}>
      {c}
    </span>
  ));
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
    !imgError &&
    (listing.image_url || (listing.images && listing.images.length > 0 ? listing.images[0] : null));

  const freshness = formatFreshness(listing.first_seen_at || listing.last_seen_at, t);
  const priceInfo = formatPrice(listing.price_eur, listing.price, t);
  const isDeal = propIsDeal ?? !!listing.is_deal;
  const isGone = listing.fit?.verdict === 'no';

  // Details under location
  const facts = listing.fit?.facts || {};
  const chips = renderSpecs(facts);

  return (
    <article
      data-testid="listing-row"
      data-listing-id={listing.id}
      onClick={() => onClick?.(listing)}
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
      className={`row ${isGone ? 'gone' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Photo on lampe passepartout */}
      <div className="mat shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover block"
          />
        ) : (
          <span className="text-[#8FA6A1]/60 text-2xs">{t('surface.noImage')}</span>
        )}
      </div>

      {/* Middle column: Title, Where, Specs/Reason/Note */}
      <div className="min-w-0 flex flex-col justify-center">
        <h3>{listing.title || '—'}</h3>

        <p className="where">
          {listing.location ? formatLocation(listing.location) : t('surface.noLocation')}
          {freshness && (
            <span className={`ml-3 ${freshness.isStale ? 'text-[#C9A227]' : ''}`}>
              {freshness.label}
            </span>
          )}
          {typeof listing.detour_min === 'number' && (
            <span className={listing.detour_min <= 0 ? 'ml-3 text-[#4E8C6A]' : 'ml-3'}>
              {listing.detour_min <= 0 ? t('surface.onRoute') : t('surface.minDetour', { min: Math.round(listing.detour_min) })}
            </span>
          )}
          {typeof listing.offroute_km === 'number' && listing.offroute_km > 0 && !listing.detour_min && (
            <span className="ml-3">{t('surface.kmDistance', { km: Math.round(listing.offroute_km) })}</span>
          )}
        </p>

        {isGone ? (
          <p className="reason">{listing.fit?.reason || t('surface.tabNo')}</p>
        ) : listing.fit?.verdict === 'unclear' ? (
          <p className="note">{listing.fit?.reason || t('surface.unclearGap')}</p>
        ) : chips.length > 0 ? (
          <p className="specs">{chips}</p>
        ) : null}
      </div>

      {/* Price on right in large Archivo numbers & keep button */}
      <div className="flex items-center gap-3 shrink-0">
        {onToggleKeep && (
          <button
            type="button"
            data-testid="keep-toggle"
            aria-pressed={isKept}
            aria-label={t(isKept ? 'surface.unkeep' : 'surface.keep')}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleKeep(listing.id);
            }}
            className={`cursor-pointer transition-colors p-1 ${
              isKept ? 'text-[#F2F5F4]' : 'text-[#8FA6A1]/40 hover:text-[#8FA6A1]'
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill={isKept ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z" />
            </svg>
          </button>
        )}

        <div
          data-testid="listing-price"
          className={`price num ${isDeal ? 'text-[#E87967]' : priceInfo.isMissing ? 'text-[#8FA6A1]' : 'text-[#F2F5F4]'}`}
        >
          {priceInfo.text}
        </div>
      </div>
    </article>
  );
};
