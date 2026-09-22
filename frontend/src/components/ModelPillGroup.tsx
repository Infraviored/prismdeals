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
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-[#06322C] text-[#F2F5F4] border border-[#0E4A40] select-none"
        >
          <span className="max-w-[180px]" style={{ direction: 'rtl', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <bdi>{term.label || term.term}</bdi>
          </span>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="flex items-center justify-center min-h-[32px] min-w-[32px] -mr-1.5 text-[#8FA6A1] hover:text-[#F2F5F4] cursor-pointer leading-none text-base"
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
            className="px-2.5 py-1 rounded text-xs bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] focus:outline-none w-40"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#06322C] hover:bg-[#00100F] text-[#8FA6A1] hover:text-[#F2F5F4] border border-[#0E4A40] text-sm cursor-pointer transition-colors"
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
