import React from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyTerm } from '../types';

export interface FundeModelsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  terms: SearchFamilyTerm[];
  termId: number | null;
  onSelect: (termId: number | null) => void;
}

/** The model filter, one sheet instead of one pill per model.
 *
 * A printer family carries eleven models. Three of them as pills in the bar was
 * the "Checked Models" list under a new name, and it alone put the results
 * screen two buttons over budget. The names belong to the setup screen; here
 * they are a filter you open when you want it.
 */
export const FundeModelsSheet: React.FC<FundeModelsSheetProps> = ({
  isOpen,
  onClose,
  terms,
  termId,
  onSelect,
}) => {
  const { t } = useTranslation();

  const choose = (id: number | null) => {
    onSelect(id);
    onClose();
  };

  const rowClass = (selected: boolean) =>
    `text-left px-3 py-3 border-b border-[#0E4A40] hover:bg-[#00100F] text-sm transition-colors ${
      selected ? 'text-[#F2F5F4] font-medium' : 'text-[#8FA6A1]'
    }`;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.models')}>
      <div className="flex flex-col">
        <button onClick={() => choose(null)} className={rowClass(termId === null)}>
          {t('surface.allModels')}
        </button>
        {terms.map(term => (
          <button
            key={term.id}
            onClick={() => choose(term.id ?? null)}
            className={rowClass(termId === term.id)}
          >
            {term.label || term.term}
          </button>
        ))}
      </div>
    </Sheet>
  );
};
