import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { TranslationPath } from '../../i18n/translations';

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
}

export interface RowProps {
  listing: RowListing;
  onClick?: (listing: RowListing) => void;
  isDeal?: boolean;
  className?: string;
}

type TranslateFn = (path: TranslationPath, params?: Record<string, string | number>) => string;

function formatFreshness(
  timestamp: string | null | undefined,
  t: TranslateFn
): { label: string; isStale: boolean } | null {
  if (!timestamp) return null;

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;

    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return { label: t('surface.today'), isStale: false };

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return { label: t('surface.today'), isStale: false };
    }
    if (diffHours < 24) {
      return { label: t('surface.hoursAgo', { hours: diffHours }), isStale: false };
    }
    if (diffDays === 1) {
      return { label: t('surface.yesterday'), isStale: false };
    }
    return {
      label: t('surface.daysAgo', { days: diffDays }),
      isStale: diffDays >= 7,
    };
  } catch {
    return null;
  }
}

function formatPrice(
  priceEur: number | null | undefined,
  rawPrice: string | null | undefined,
  t: TranslateFn
): { text: string; isMissing: boolean } {
  if (typeof priceEur === 'number' && priceEur > 0) {
    return { text: `${priceEur} €`, isMissing: false };
  }
  if (rawPrice && rawPrice.trim()) {
    return { text: rawPrice.trim(), isMissing: false };
  }
  return { text: t('surface.noPrice'), isMissing: true };
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
      className={`h-[88px] min-h-[88px] max-h-[88px] w-full px-3 sm:px-4 py-2 flex items-center gap-3 border-b border-white/[0.08] hover:bg-white/[0.03] transition-colors select-none ${
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

        <div className="text-2xs text-[#9FB3B0] truncate flex items-center gap-1.5 mt-0.5">
          {listing.location && (
            <span className="truncate">{listing.location}</span>
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
      </div>

      {/* Right column: Price hero + quiet Detour underneath */}
      <div className="shrink-0 text-right flex flex-col justify-center items-end pl-2 min-w-[72px]">
        <div
          data-testid="listing-price"
          className={`text-base sm:text-lg font-bold font-heading tabular-nums leading-tight ${priceClass}`}
        >
          {priceInfo.text}
        </div>

        <div className="text-2xs tabular-nums mt-0.5 min-h-[16px] flex items-center justify-end">
          {renderDetour(listing, t)}
        </div>
      </div>
    </article>
  );
};
