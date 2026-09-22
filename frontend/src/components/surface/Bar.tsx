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
  measure = 'max-w-7xl',
  className = '',
}) => {
  const { t } = useTranslation();

  return (
    <header
      data-testid="surface-bar"
      className={`sticky top-0 z-30 h-11 min-h-[44px] max-h-[44px] w-full bg-[#00100F] border-b border-[#0E4A40] px-4 sm:px-8 text-sm ${className}`}
    >
      <div className={`${measure} mx-auto w-full h-full flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          {onBack && (
            <button
              type="button"
              data-testid="surface-bar-back"
              onClick={onBack}
              className="back text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors text-sm font-normal shrink-0 cursor-pointer inline-flex items-center"
              aria-label={backLabel || t('surface.back')}
            >
              {backLabel || t('surface.back')}
            </button>
          )}

          {title && (
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-sm font-semibold text-[#F2F5F4] truncate">
                {title}
              </h1>
              {typeof count === 'number' && (
                <span
                  data-testid="surface-bar-count"
                  className="text-xs text-[#8FA6A1] tabular-nums shrink-0"
                >
                  {count}
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-[#8FA6A1] truncate hidden md:inline">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>

        {(actions || children) && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar ml-auto">
            {actions}
            {children}
          </div>
        )}
      </div>
    </header>
  );
};
