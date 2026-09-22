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
      className={`h-16 min-h-[64px] max-h-[64px] w-full px-3 sm:px-4 py-2 flex items-center gap-3 border-b border-[#0E4A40] hover:bg-[#06322C]/40 transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8FA6A1] ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* 48px thumbnail on warm lampe background */}
      <div className="w-12 h-12 min-w-[48px] rounded-sm bg-[#E4D6BE] p-[2px] overflow-hidden shrink-0 flex items-center justify-center relative">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            onError={() => setImgError(true)}
            loading="lazy"
            className="w-full h-full object-cover rounded-[1px]"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#8FA6A1]/60">
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
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <h2 className="text-sm sm:text-base font-medium text-[#F2F5F4] truncate font-heading leading-tight">
          {name || '—'}
        </h2>

        <div className="text-2xs text-[#8FA6A1] truncate flex items-center gap-1.5 mt-0.5">
          {locationLabel && <span className="truncate">{locationLabel}</span>}
          {locationLabel && freshnessLabel && (
            <span className="text-[#0E4A40] select-none">·</span>
          )}
          {freshnessLabel && <span>{freshnessLabel}</span>}
          {!locationLabel && !freshnessLabel && (
            <span className="text-[#8FA6A1]/50">—</span>
          )}
        </div>
      </div>

      {/* Right column: Match count in tabular-nums */}
      <div className="shrink-0 text-right flex items-center justify-end pl-2 min-w-[48px]">
        <span
          data-testid="search-count"
          className="text-sm sm:text-base font-bold font-heading tabular-nums text-[#F2F5F4] leading-tight"
        >
          {count}
        </span>
      </div>
    </article>
  );
};
