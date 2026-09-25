import React, { useState } from 'react';

export interface SearchRowProps {
  id: number | string;
  name: string;
  count: number;
  locationLabel?: string | null;
  freshnessLabel?: string | null;
  imageUrl?: string | null;
  onClick?: () => void;
  className?: string;
}

export const SearchRow: React.FC<SearchRowProps> = ({
  id,
  name,
  count,
  locationLabel,
  freshnessLabel,
  imageUrl,
  onClick,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const showImage = !imgError && imageUrl;

  return (
    <article
      data-testid={`campaign-card-${id}`}
      data-search-id={id}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`min-h-[72px] w-full px-4 sm:px-8 py-3 flex items-center gap-4 border-b border-[#0E4A40] hover:bg-[#06322C]/55 transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8FA6A1] ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Thumbnail on warm lampe background */}
      <div className="w-14 h-11 min-w-[56px] rounded-[2px] bg-[#E4D6BE] p-0.5 overflow-hidden shrink-0 flex items-center justify-center relative">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            onError={() => setImgError(true)}
            loading="lazy"
            className="w-full h-full object-cover block"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#011F1F]/60">
            <svg
              className="w-5 h-5"
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

      {/* Center column: Name + Subtitle (Location & Freshness) */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h2 className="text-base font-medium text-[#F2F5F4] truncate leading-snug">
          {name || '—'}
        </h2>

        <div className="text-xs text-[#8FA6A1] truncate flex items-baseline gap-3 mt-0.5">
          {locationLabel && <span className="truncate text-[#F2F5F4]/90">{locationLabel}</span>}
          {freshnessLabel && <span>{freshnessLabel}</span>}
          {!locationLabel && !freshnessLabel && <span>—</span>}
        </div>
      </div>

      {/* Right column: Match count in Archivo tabular-nums */}
      <div className="shrink-0 text-right flex items-center justify-end pl-2">
        <span
          data-testid="search-count"
          className="text-xl sm:text-2xl font-bold num text-[#F2F5F4] leading-tight"
        >
          {count}
        </span>
      </div>
    </article>
  );
};
