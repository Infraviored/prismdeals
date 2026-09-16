import React, { useState } from 'react';
import { Sheet } from '../components/surface/Sheet';
import { useTranslation } from '../hooks/useTranslation';
import type { RowListing } from '../components/surface/Row';
import { ExternalLink } from 'lucide-react';

export interface FundeDetailSheetProps {
  listing: RowListing | null;
  onClose: () => void;
}

export const FundeDetailSheet: React.FC<FundeDetailSheetProps> = ({ listing, onClose }) => {
  const { t } = useTranslation();
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  if (!listing) return null;

  const priceText = listing.price_eur ? `${listing.price_eur} €` : (listing.price || t('surface.noPrice'));

  return (
    <Sheet
      isOpen={listing !== null}
      onClose={onClose}
      title={listing.title || t('common.description')}
    >
      <div className="space-y-4">
        {/* Price & Location Header */}
        <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-3">
          <span className={`text-2xl font-bold font-heading tabular-nums ${listing.is_deal ? 'text-[#E87967]' : 'text-[#F2F5F4]'}`}>
            {priceText}
          </span>
          <span className="text-xs text-[#9FB3B0]">
            {listing.location || t('surface.noLocation')}
          </span>
        </div>

        {/* Images Gallery */}
        {listing.images && listing.images.length > 0 && (
          <div className="space-y-2">
            <img
              src={listing.images[activeImageIndex] || listing.images[0]}
              alt={listing.title}
              className="w-full h-56 sm:h-64 object-cover rounded-lg bg-black/40"
            />
            {listing.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {listing.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-14 h-14 rounded overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                      activeImageIndex === idx ? 'border-[#E87967]' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Open External Link */}
        {listing.url && (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-white/[0.08] hover:bg-white/[0.14] text-[#F2F5F4] rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>{t('surface.openInKleinanzeigen')}</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </Sheet>
  );
};
