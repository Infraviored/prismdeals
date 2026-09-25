import React from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import type { Target } from '../types/hunt';

export interface FundeModelsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  targets: Target[];
  targetId: number | null;
  onSelect: (nodeId: number | null) => void;
}

/** The target filter, one sheet instead of one pill per target. */
export const FundeModelsSheet: React.FC<FundeModelsSheetProps> = ({ isOpen, onClose, targets, targetId, onSelect }) => {
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
        <button onClick={() => choose(null)} className={rowClass(targetId === null)}>
          {t('surface.allModels')}
        </button>
        {targets
          .filter((tg) => tg.node_id !== undefined)
          .map((tg) => (
            <button key={tg.node_id} onClick={() => choose(tg.node_id!)} className={rowClass(targetId === tg.node_id)}>
              {tg.name || tg.typed}
            </button>
          ))}
      </div>
    </Sheet>
  );
};
