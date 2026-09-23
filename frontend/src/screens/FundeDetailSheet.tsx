import React, { useState, useEffect } from 'react';
import { Sheet } from '../components/surface/Sheet';
import { formatLocation } from '../utils/formatLocation';
import { formatPrice } from '../utils/formatPrice';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';
import { formatFreshness } from '../utils/freshness';
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

  const priceText = formatPrice(listing.price_eur, listing.price, t).text;

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
      footer={
        listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: '#E4D6BE', color: '#011F1F' }}
            className="w-full py-3 px-4 rounded-[3px] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md hover:brightness-105"
          >
            <span style={{ color: '#011F1F' }}>{t('surface.openInKleinanzeigen')}</span>
            <ExternalLink className="w-4 h-4" style={{ color: '#011F1F' }} />
          </a>
        ) : null
      }
    >
      <div className="flex flex-col min-h-full">
        {/* Scrollable upper content */}
        <div className="flex-1 space-y-4 pb-4">
          {/* 1. Large Image Carousel / Viewer */}
          <div className="relative w-full h-52 sm:h-64 rounded bg-[#00100F] overflow-hidden shrink-0 border border-[#0E4A40] flex items-center justify-center select-none">
            {totalImages > 0 ? (
              <>
                <img
                  src={images[activeImageIndex]}
                  alt={listing.title || ''}
                  className="w-full h-full object-cover transition-opacity duration-200"
                />

                {/* Photo counter overlay: e.g. "Foto 1 / 6" */}
                {totalImages > 1 && (
                  <div className="absolute bottom-2.5 right-2.5 bg-[#00100F]/90 border border-[#0E4A40] text-2xs text-[#8FA6A1] px-2 py-0.5 rounded">
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
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded bg-[#00100F]/80 hover:bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={nextImage}
                      aria-label="Next photo"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded bg-[#00100F]/80 hover:bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-[#8FA6A1]/40 gap-1.5">
                <ImageIcon className="w-8 h-8" />
                <span className="text-2xs">{t('surface.noImage')}</span>
              </div>
            )}
          </div>

          {/* 2. Price Block (Price is HERO, reference distance is ONLY coral element) */}
          <div className="border-b border-[#0E4A40] pb-3 space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                data-testid="detail-price"
                className="text-3xl sm:text-4xl font-bold tabular-nums text-[#F2F5F4] leading-none"
              >
                {priceText}
              </span>

              {/* Reference price distance signal - ONLY Coral element when is_deal */}
              {listing.is_deal ? (
                <span data-price-signal className="text-sm font-semibold text-[#E87967] tabular-nums whitespace-nowrap">
                  {typeof listing.price_delta_eur === 'number' && listing.price_delta_eur > 0
                    ? t('surface.belowReference', { amount: listing.price_delta_eur })
                    : t('surface.dealBadge')}
                </span>
              ) : typeof listing.price_delta_eur === 'number' && listing.price_delta_eur > 0 ? (
                <span className="text-sm font-semibold text-[#8FA6A1] tabular-nums whitespace-nowrap">
                  {t('surface.belowReference', { amount: listing.price_delta_eur })}
                </span>
              ) : typeof listing.price_delta_eur === 'number' && listing.price_delta_eur < 0 ? (
                <span className="text-sm font-semibold text-[#8FA6A1] tabular-nums whitespace-nowrap">
                  {t('surface.aboveReference', { amount: Math.abs(listing.price_delta_eur) })}
                </span>
              ) : null}
            </div>

            {/* Location and detour */}
            <div className="text-xs text-[#8FA6A1] flex items-center gap-2 truncate">
              <span>{formattedLoc || t('surface.noLocation')}</span>

              {hasDetour && (
                <>
                  {isDirectlyOnRoute ? (
                    <span className="text-[#4E8C6A] font-medium">
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
                <span>
                  {t('surface.kmDistance', { km: Math.round(listing.offroute_km!) })}
                </span>
              )}
            </div>
          </div>

          {/* 3. Title */}
          <h1 className="text-base sm:text-lg font-semibold text-[#F2F5F4] leading-snug">
            {listing.title || '—'}
          </h1>

          {/* Specs / Merkmale Badges */}
          {(() => {
            const facts = (listing.fit?.facts || {}) as Record<string, unknown>;
            const chips: string[] = [];
            if (facts.stickCount && facts.gbPerStick) chips.push(`${facts.stickCount}×${facts.gbPerStick} GB`);
            if (facts.generation) chips.push(String(facts.generation).toUpperCase() + (facts.speedMhz ? `-${facts.speedMhz}` : ''));
            if (facts.casLatency) chips.push(`CL${facts.casLatency}`);
            if (facts.formFactor) chips.push(String(facts.formFactor).toUpperCase());
            if (chips.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 pt-1 pb-1">
                {chips.map((c, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-xs bg-[#0E4A40]/60 text-[#F2F5F4] border border-[#0E4A40]">
                    {c}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* 4. AI rating */}
          {aiText && (
            <div className="text-xs text-[#8FA6A1] bg-[#00100F] px-3 py-2.5 rounded border border-[#0E4A40] flex items-start gap-2">
              {typeof listing.niceness_score === 'number' && (
                <span className="font-bold text-[#F2F5F4] shrink-0 tabular-nums">
                  {listing.niceness_score}/100
                </span>
              )}
              <span className="flex-1">{aiText}</span>
            </div>
          )}

          {/* Price history */}
          {listing.price_history && listing.price_history.length > 1 && (
            <div className="pt-2 border-t border-[#0E4A40] space-y-2">
              <div className="text-xs font-semibold text-[#8FA6A1]">{t('surface.priceDevelopment')}</div>
              <div className="space-y-1 text-xs">
                {listing.price_history.map((h, i) => (
                  <div key={i} className="flex justify-between text-[#8FA6A1]">
                    <span>{h.seen_at ? (formatFreshness(h.seen_at, t)?.label || h.seen_at) : 'Vorher'}</span>
                    <span className="font-semibold text-[#F2F5F4] tabular-nums">{h.price_eur} €</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Description */}
          {listing.description ? (
            <div className="pt-2 border-t border-[#0E4A40] space-y-1">
              <div className="text-xs font-semibold text-[#8FA6A1]">{t('surface.description')}</div>
              <div className="text-sm text-[#F2F5F4]/80 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </div>
            </div>
          ) : null}
        </div>

      </div>
    </Sheet>
  );
};
