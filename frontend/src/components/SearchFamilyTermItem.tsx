import type { SearchFamilyTerm } from '../types';
import { Trash2, CheckSquare, Square } from 'lucide-react';

interface TermItemProps {
  term: SearchFamilyTerm;
  index: number;
  onToggle: (index: number) => void;
  onDelete: (index: number) => void;
  toggleLabel: string;
  deleteLabel: string;
}

export default function SearchFamilyTermItem({
  term,
  index,
  onToggle,
  onDelete,
  toggleLabel,
  deleteLabel,
}: TermItemProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
        term.enabled
          ? 'bg-bg-input/60 border-border-subtle text-text-primary'
          : 'bg-bg-input/20 border-border-subtle/40 text-text-muted opacity-60'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(index)}
        aria-label={toggleLabel}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer group"
      >
        {term.enabled ? (
          <CheckSquare className="w-4 h-4 text-brand-accent shrink-0" />
        ) : (
          <Square className="w-4 h-4 text-text-muted shrink-0" />
        )}
        <span className="text-xs sm:text-sm font-medium truncate group-hover:text-brand-accent transition-colors">
          {term.label || term.term}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onDelete(index)}
        aria-label={deleteLabel}
        className="p-1 text-text-muted hover:text-status-danger rounded-lg transition-colors cursor-pointer shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
