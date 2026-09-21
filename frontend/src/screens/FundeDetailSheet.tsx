import React, { useState, useEffect } from 'react';
import { Sheet } from '../components/surface/Sheet';
import { formatLocation } from '../utils/formatLocation';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';
import { ExternalLink, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

export interface FundeDetailSheetProps {
  listing: RowListing | null;
  onClose: () => void;
}

export const FundeDetailSheet: React.FC<FundeDetailSheetProps> = ({ listing, onClose }) => {
  const { t } = useTranslation();
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Reset active image index whenever the opened listing changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [listing?.id]);

  if (!listing) return null;

  const images = listing.images && listing.images.length > 0
    ? listing.images
    : listing.image_url
    ? [listing.image_url]
    : [];

  const totalImages = images.length;

  const priceText = typeof listing.price_eur === 'number' && listing.price_eur > 0
    ? `${listing.price_eur} €`
    : (listing.price?.trim() || t('surface.noPrice'));

  const formattedLoc = formatLocation(listing.location);

  const prevImage = () => {
    setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : totalImages - 1));
  };

  const nextImage = () => {
    setActiveImageIndex((prev) => (prev < totalImages - 1 ? prev + 1 : 0));
  };

  const hasDetour = typeof listing.detour_min === 'number';
  const isDirectlyOnRoute = hasDetour && Number(listing.detour_min) <= 0;
  const hasOffroute = !hasDetour && typeof listing.offroute_km === 'number' && listing.offroute_km > 0;

  // 1-line AI evaluation (if present for the 10/1266 listings)
  const aiText = listing.summary || listing.reference_comparison?.reasoning || null;

  return (
    <Sheet
      isOpen={listing !== null}
      onClose={onClose}
      title={t('surface.detailTitle')}
    >
      <div className="flex flex-col min-h-full">
        {/* Scrollable upper content */}
        {/* The pinned action is sticky, so the description scrolls behind it.
            Without room to clear it the last lines of a listing sit under the
            button and cannot be read at all. */}
        <div className={`flex-1 space-y-4 ${listing.url ? 'pb-24' : 'pb-4'}`}>
          {/* 1. Large Image Carousel / Viewer */}
          <div className="relative w-full h-52 sm:h-64 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.08] flex items-center justify-center select-none">
            {totalImages > 0 ? (
              <>
                <img
                  src={images[activeImageIndex]}
                  alt={listing.title || ''}
                  className="w-full h-full object-cover transition-opacity duration-200"
                />

                {/* Photo counter overlay: e.g. "Foto 1 / 6" */}
                {totalImages > 1 && (
                  <div className="absolute bottom-2.5 right-2.5 bg-[#011F1F]/80 backdrop-blur-sm border border-white/[0.1] text-2xs font-mono text-[#F2F5F4] px-2 py-0.5 rounded shadow-sm">
                    {t('surface.photoCount', { current: activeImageIndex + 1, total: totalImages })}
                  </div>
                )}

                {/* Navigation Arrows for multi-photo listings */}
                {totalImages > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevImage}
                      aria-label="Previous photo"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#011F1F]/70 hover:bg-[#011F1F] border border-white/[0.12] text-[#F2F5F4] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={nextImage}
                      aria-label="Next photo"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#011F1F]/70 hover:bg-[#011F1F] border border-white/[0.12] text-[#F2F5F4] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-[#9FB3B0]/40 gap-1.5">
                <ImageIcon className="w-8 h-8" />
                <span className="text-2xs">{t('surface.noImage')}</span>
              </div>
            )}
          </div>

          {/* 2. Price Block (Price is HERO, reference distance is ONLY coral element) */}
          <div className="border-b border-white/[0.08] pb-3 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                data-testid="detail-price"
                className="text-3xl sm:text-4xl font-heading font-bold tabular-nums text-[#F2F5F4] leading-none"
              >
                {priceText}
              </span>

              {/* Reference price distance signal - ONLY Coral element */}
              {typeof listing.price_delta_eur === 'number' && listing.price_delta_eur > 0 ? (
                <span data-price-signal className="text-sm font-semibold text-[#E87967] tabular-nums whitespace-nowrap">
                  {t('surface.belowReference', { amount: listing.price_delta_eur })}
                </span>
              ) : typeof listing.price_delta_eur === 'number' && listing.price_delta_eur < 0 ? (
                <span className="text-sm font-semibold text-[#9FB3B0] tabular-nums whitespace-nowrap">
                  {t('surface.aboveReference', { amount: Math.abs(listing.price_delta_eur) })}
                </span>
              ) : listing.is_deal ? (
                <span data-price-signal className="text-sm font-semibold text-[#E87967] whitespace-nowrap">
                  {t('surface.dealBadge')}
                </span>
              ) : null}
            </div>

            {/* Location and detour */}
            <div className="text-xs text-[#9FB3B0] flex items-center gap-1.5 truncate">
              <span>{formattedLoc || t('surface.noLocation')}</span>

              {hasDetour && (
                <>
                  <span className="text-white/20 select-none">·</span>
                  {isDirectlyOnRoute ? (
                    <span className="text-[#10B981] font-medium">
                      {t('surface.onRouteFull')}
                    </span>
                  ) : (
                    <span>
                      {t('surface.minDetourFull', { min: Math.round(Number(listing.detour_min)) })}
                    </span>
                  )}
                </>
              )}

              {hasOffroute && (
                <>
                  <span className="text-white/20 select-none">·</span>
                  <span>
                    {t('surface.kmDistance', { km: Math.round(listing.offroute_km!) })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 3. Title */}
          <h1 className="text-base sm:text-lg font-semibold text-[#F2F5F4] leading-snug">
            {listing.title || '—'}
          </h1>

          {/* 4. AI Rating (Single line if present, otherwise null) */}
          {aiText && (
            <div className="text-xs text-[#9FB3B0] bg-white/[0.03] px-3 py-2 rounded-lg border border-white/[0.08] flex items-center gap-2">
              {typeof listing.niceness_score === 'number' && (
                <span className="font-mono font-bold text-[#F2F5F4] shrink-0">
                  {listing.niceness_score}/100
                </span>
              )}
              <span className="truncate">{aiText}</span>
            </div>
          )}

          {/* 5. Description */}
          {listing.description ? (
            <div className="text-sm text-[#9FB3B0] leading-relaxed whitespace-pre-wrap">
              {listing.description}
            </div>
          ) : null}
        </div>

        {/* 6. Pinned Bottom Action Button: Open on Kleinanzeigen */}
        {listing.url && (
          <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-4 sm:p-5 bg-[#012828] border-t border-white/[0.08] shrink-0 z-20">
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-white/[0.08] hover:bg-white/[0.14] text-[#F2F5F4] rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{t('surface.openInKleinanzeigen')}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </Sheet>
  );
};
