import React from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';

export interface FundeFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dealsOnly: boolean;
  setDealsOnly: (d: boolean) => void;
  isCorridor: boolean;
  maxDetour: number | null;
  setMaxDetour: (d: number | null) => void;
}

/** Both filters behind one pill.
 *
 * Seven controls do not fit across 390 px: the corridor pill rendered as
 * "rridor", clipped mid-word. Rather than shorten labels until they lie, the
 * two toggles that are rarely both wanted at once share a sheet, the way the
 * models do.
 */
export const FundeFilterSheet: React.FC<FundeFilterSheetProps> = ({
  isOpen,
  onClose,
  dealsOnly,
  setDealsOnly,
  isCorridor,
  maxDetour,
  setMaxDetour,
}) => {
  const { t } = useTranslation();

  const rowClass = (selected: boolean) =>
    `text-left px-3 py-3 border-b border-white/[0.08] text-sm flex items-center justify-between ${
      selected ? 'text-[#F2F5F4]' : 'text-[#9FB3B0]'
    }`;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.filter')}>
      <div className="flex flex-col">
        <button
          onClick={() => setDealsOnly(!dealsOnly)}
          className={rowClass(dealsOnly)}
        >
          <span>{t('surface.dealsOnly')}</span>
          <span aria-hidden="true">{dealsOnly ? '✓' : ''}</span>
        </button>
        {isCorridor &&
          [10, 20, 30].map(minutes => (
            <button
              key={minutes}
              onClick={() => setMaxDetour(maxDetour === minutes ? null : minutes)}
              className={rowClass(maxDetour === minutes)}
            >
              <span>{t('surface.maxDetourMinutes', { min: minutes })}</span>
              <span aria-hidden="true">{maxDetour === minutes ? '✓' : ''}</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
};
