import React, { useState } from 'react';
import type { SearchFamilyTerm } from '../types';

export interface ModelPillGroupProps {
  terms: SearchFamilyTerm[];
  onAdd: (term: string) => void;
  onRemove: (index: number) => void;
  addPlaceholder?: string;
  addTitle?: string;
}

export const ModelPillGroup: React.FC<ModelPillGroupProps> = ({
  terms,
  onAdd,
  onRemove,
  addPlaceholder = 'Modell hinzufügen...',
  addTitle = 'Modell hinzufügen',
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onAdd(trimmed);
    }
    setText('');
    setIsAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {terms.map((term, idx) => (
        <span
          key={`${term.term}-${idx}`}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.05] text-[#F2F5F4] border border-white/10 select-none"
        >
          <span className="truncate max-w-[180px]">{term.label || term.term}</span>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="text-[#9FB3B0] hover:text-[#F2F5F4] -mr-1 p-0.5 rounded cursor-pointer leading-none text-sm"
            aria-label={`Remove ${term.label || term.term}`}
          >
            ×
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
                setText('');
              }
            }}
            onBlur={submit}
            placeholder={addPlaceholder}
            className="px-3 py-1 rounded-full text-xs bg-white/[0.08] border border-white/20 text-[#F2F5F4] focus:outline-none w-40"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[#9FB3B0] hover:text-[#F2F5F4] border border-white/10 text-base cursor-pointer transition-colors"
          title={addTitle}
          aria-label={addTitle}
        >
          +
        </button>
      )}
    </div>
  );
};

export default ModelPillGroup;
