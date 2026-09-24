import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  /** Small controls in the header, before the close button. */
  actions?: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
  side?: 'right' | 'bottom';
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  footer,
  actions,
  title,
  children,
  side = 'right',
  className = '',
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  // Parents pass a fresh arrow function on every render, and the app renders
  // every two seconds (the processing poll). With onClose as a dependency the
  // effect below re-ran each time: focus went back to the page behind and then
  // to the panel, which on Android threw away a text selection and its copy
  // bar, over and over. Read it through a ref; open and close are the only
  // moments focus should move.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    const returnTo = document.activeElement as HTMLElement | null;
    // The panel, not its first control: with the actions in the header that
    // control is "keep", and a ring around it on open read as already pressed.
    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !panelRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      returnTo?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const panelLayout =
    side === 'right'
      ? 'fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 w-full sm:max-w-lg border-l border-[#0E4A40] shadow-2xl animate-slide-left'
      : 'fixed inset-0 sm:inset-x-0 sm:bottom-0 sm:max-h-[85vh] sm:rounded-t-[3px] border-t border-[#0E4A40] shadow-2xl animate-fade-in';

  return (
    <div
      data-testid="surface-sheet-backdrop"
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#00100F] sm:bg-[#00100F]/70 sm:backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Content Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="surface-sheet-panel"
        className={`${panelLayout} z-10 flex flex-col bg-[#011F1F] text-[#F2F5F4] focus:outline-none ${className}`}
      >
        {/* Header */}
        <div className="h-11 min-h-[44px] max-h-[44px] px-4 border-b border-[#0E4A40] flex items-center justify-between gap-3 shrink-0">
          <div className="text-sm font-semibold truncate text-[#F2F5F4] flex-1 min-w-0">
            {title}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
          <button
            type="button"
            data-testid="surface-sheet-close"
            onClick={onClose}
            aria-label={t('surface.close')}
            className="flex items-center justify-center min-w-[36px] min-h-[36px] text-[#8FA6A1] hover:text-[#F2F5F4] rounded-[3px] transition-colors cursor-pointer"
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

        {/* Pinned action footer */}
        {footer && (
          <div className="shrink-0 p-4 sm:p-5 bg-[#06322C] border-t border-[#0E4A40]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
