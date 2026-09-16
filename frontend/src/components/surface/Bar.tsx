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
  className = '',
}) => {
  const { t } = useTranslation();

  return (
    <header
      data-testid="surface-bar"
      className={`sticky top-0 z-30 h-12 min-h-[48px] max-h-[48px] w-full bg-[#012828] border-b border-white/[0.08] px-3 sm:px-4 flex items-center justify-between gap-2.5 backdrop-blur-md ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            data-testid="surface-bar-back"
            onClick={onBack}
            className="flex items-center gap-1 text-[#9FB3B0] hover:text-[#F2F5F4] p-1 -ml-1 rounded transition-colors text-sm font-medium shrink-0 cursor-pointer"
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
          <div className="flex items-baseline gap-2 min-w-0 truncate">
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

      {(actions || children) && (
        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
          {actions}
          {children}
        </div>
      )}
    </header>
  );
};
