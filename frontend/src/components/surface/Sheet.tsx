import React, { useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pinned below the scrolling content, never over it. */
  footer?: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
  side?: 'right' | 'bottom';
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  footer,
  title,
  children,
  side = 'right',
  className = '',
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const panelLayout =
    side === 'right'
      ? 'fixed inset-y-0 right-0 w-full max-w-lg border-l border-white/[0.08] shadow-2xl animate-slide-left'
      : 'fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-white/[0.08] shadow-2xl animate-fade-in';

  return (
    <div
      data-testid="surface-sheet-backdrop"
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Panel */}
      <div
        data-testid="surface-sheet-panel"
        className={`${panelLayout} z-10 flex flex-col bg-[#012828] text-[#F2F5F4] ${className}`}
      >
        {/* Header (48px matching Bar) */}
        <div className="h-12 min-h-[48px] max-h-[48px] px-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="text-sm font-semibold font-heading truncate text-[#F2F5F4]">
            {title}
          </div>
          <button
            type="button"
            data-testid="surface-sheet-close"
            onClick={onClose}
            aria-label={t('surface.close')}
            className="flex items-center justify-center min-w-[36px] min-h-[36px] -mr-1.5 text-[#9FB3B0] hover:text-[#F2F5F4] rounded transition-colors cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {children}
        </div>

        {/* A pinned action belongs outside the scrolling area. Sticky inside it
            hovers over the text instead of making room, so the last lines of a
            description sat behind the button and no amount of bottom padding
            could help -- padding is in the flow the button has left. */}
        {footer && (
          <div className="shrink-0 p-4 sm:p-5 bg-[#012828] border-t border-white/[0.08]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
