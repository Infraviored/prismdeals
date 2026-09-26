import React, { useState } from 'react';
import type { RowListing } from '../components/surface/Row';
import { useTranslation } from '../hooks/useTranslation';
import { formatFreshness } from '../utils/freshness';
import { formatLocation } from '../utils/formatLocation';
import { Chips } from '../components/surface/Chips';

export interface FundeBestHeroProps {
  listing: RowListing;
  medianPrice: number | null;
  tab: string;
  isKept: boolean;
  onToggleKeep: (id: string) => void;
  onOpenListing?: (listing: RowListing) => void;
}

export const FundeBestHero: React.FC<FundeBestHeroProps> = ({
  listing,
  medianPrice,
  tab,
  isKept,
  onToggleKeep,
  onOpenListing,
}) => {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  if (tab !== 'fit' && tab !== 'all') return null;

  const imageUrl =
    !imgError &&
    (listing.image_url || (listing.images && listing.images.length > 0 ? listing.images[0] : null));

  const freshness = formatFreshness(listing.first_seen_at || listing.last_seen_at, t);
  const locationText = listing.location ? formatLocation(listing.location) : t('surface.noLocation');
  const delta = listing.price_delta_eur;
  const isDeal = listing.is_deal;

  // Price history drop check
  const history = listing.price_history || [];
  let drop: { before: number; when: string } | null = null;
  if (history.length >= 2) {
    const before = history[history.length - 2].price_eur;
    const now = history[history.length - 1].price_eur;
    if (typeof before === 'number' && typeof now === 'number' && before > now) {
      const dropFreshness = formatFreshness(history[history.length - 1].seen_at, t);
      drop = { before, when: dropFreshness ? dropFreshness.label : '' };
    }
  }

  return (
    <section className="best" id="best" aria-label={isDeal ? t('surface.bestFind') : t('surface.cheapestFit')}>
      <p className="best-label">
        {isDeal ? t('surface.bestFind') : t('surface.cheapestFit')}
      </p>

      <div className="best-body">
        {/* Photo on warm lampe matte */}
        <div
          className="mat cursor-pointer"
          onClick={() => onOpenListing?.(listing)}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              onError={() => setImgError(true)}
              className="w-full h-full object-cover block"
            />
          ) : (
            <span className="text-[#011F1F]/70 text-xs">{t('surface.noImage')}</span>
          )}
        </div>

        {/* Info */}
        <div className="best-info">
          <h2
            className="cursor-pointer hover:text-[#E4D6BE] transition-colors"
            onClick={() => onOpenListing?.(listing)}
          >
            {listing.title}
          </h2>

          <p className="where">
            {locationText}
            {freshness && <span className="ml-3">{freshness.label}</span>}
            {typeof listing.detour_min === 'number' && (
              <span className={listing.detour_min <= 0 ? 'ml-3 text-[#4E8C6A]' : 'ml-3'}>
                {listing.detour_min <= 0 ? t('surface.onRoute') : t('surface.minDetour', { min: Math.round(listing.detour_min) })}
              </span>
            )}
            {typeof listing.offroute_km === 'number' && listing.offroute_km > 0 && !listing.detour_min && (
              <span className="ml-3">{t('surface.kmDistance', { km: Math.round(listing.offroute_km) })}</span>
            )}
          </p>

          <Chips chips={listing.chips} />

          <div className="price-block">
            <div className={`price num ${isDeal ? 'deal text-[#E87967]' : 'text-[#F2F5F4]'}`}>
              {listing.price_eur !== null && listing.price_eur !== undefined ? `${listing.price_eur} €` : (listing.price || 'VB')}
            </div>

            <p className="price-why">
              {isDeal && delta && medianPrice ? (
                <>
                  <span className="delta">{t('surface.belowMarket', { amount: delta })}</span>
                  {`, ${t('surface.usually', { amount: medianPrice })}`}
                </>
              ) : medianPrice ? (
                t('surface.marketPrice', { amount: medianPrice })
              ) : null}

              {drop && (
                <>
                  <br />
                  <span className="was">
                    {t('surface.priceDropped', { when: drop.when, before: drop.before })}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="actions">
            {listing.url && (
              <a
                className="btn primary"
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('surface.openInKleinanzeigen')}
              </a>
            )}

            <button
              className="btn"
              type="button"
              onClick={() => onToggleKeep(listing.id)}
            >
              {isKept ? t('surface.unkeep') : t('surface.keep')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
