import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface BarProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  count?: number | null;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** The measure the screen's own content runs to, so the two line up. */
  measure?: string;
  className?: string;
}

export const Bar: React.FC<BarProps> = ({
  title,
  subtitle,
  count,
  onBack,
  backLabel,
  actions,
  children,
  measure = 'max-w-3xl',
  className = '',
}) => {
  const { t } = useTranslation();

  return (
    <header
      data-testid="surface-bar"
      className={`sticky top-0 z-30 h-12 min-h-[48px] max-h-[48px] w-full bg-[#012828] border-b border-white/[0.08] px-3 sm:px-4 backdrop-blur-md ${className}`}
    >
      {/* The bar runs to the same measure as the screen under it. Spanning the
          full 1440 while the list sat in a centre column put the title and the
          actions 1,400px apart with nothing between them. */}
      <div
        className={`${measure} mx-auto w-full h-full flex items-center justify-between gap-2`}
      >
      <div className="flex items-center gap-2 shrink-0 max-w-[45%] sm:max-w-none min-w-0">
        {onBack && (
          <button
            type="button"
            data-testid="surface-bar-back"
            onClick={onBack}
            className="flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] text-[#9FB3B0] hover:text-[#F2F5F4] px-1 -ml-1 rounded transition-colors text-sm font-medium shrink-0 cursor-pointer"
            aria-label={backLabel || t('surface.back')}
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            {backLabel && <span className="hidden sm:inline text-xs">{backLabel}</span>}
          </button>
        )}

        {title && (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-[#F2F5F4] font-heading truncate">
              {title}
            </h1>
            {typeof count === 'number' && (
              <span
                data-testid="surface-bar-count"
                className="text-xs font-medium text-[#9FB3B0] tabular-nums shrink-0"
              >
                {count}
              </span>
            )}
            {subtitle && (
              <span className="text-2xs text-[#9FB3B0] truncate hidden md:inline">
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>

      {/* `justify-end` on a scrolling row pins the content to the right and
          clips it on the *left*, which is how "Passend" arrived as "ssend" and
          "Auswerten" left the screen entirely at 390 px. An auto margin sits
          the row right when it fits and collapses to nothing when it does not,
          so nothing is ever cut mid-word and everything is reachable by
          scrolling. */}
      {(actions || children) && (
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar pl-1">
          <div className="flex items-center gap-1.5 w-max ml-auto">
            {actions}
            {children}
          </div>
        </div>
      )}
      </div>
    </header>
  );
};
