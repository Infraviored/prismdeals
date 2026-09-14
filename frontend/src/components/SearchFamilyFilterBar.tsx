import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyTerm } from '../types';
import { Layers } from 'lucide-react';

interface SearchFamilyFilterBarProps {
  terms: SearchFamilyTerm[];
  selectedTermIds: Set<number>;
  termCounts: Record<number, number>;
  totalCount: number;
  onToggleTerm: (termId: number) => void;
  onToggleAll: () => void;
  className?: string;
}

export default function SearchFamilyFilterBar({
  terms,
  selectedTermIds,
  termCounts,
  totalCount,
  onToggleTerm,
  onToggleAll,
  className = '',
}: SearchFamilyFilterBarProps) {
  const { t } = useTranslation();

  if (terms.length === 0) {
    return null;
  }

  const isAllActive = terms.length > 0 && selectedTermIds.size === terms.length;

  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin ${className}`}>
      <span className="text-2xs text-text-muted font-bold uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
        <Layers className="w-3.5 h-3.5 text-brand-accent" />
        {t('routeResults.filterByModel')}
      </span>

      {/* "All" switch ("alle an bedeutet alles") */}
      <button
        type="button"
        onClick={onToggleAll}
        className={`min-h-[32px] px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center justify-center shrink-0 cursor-pointer ${
          isAllActive
            ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/40 font-bold'
            : 'bg-bg-input text-text-muted hover:text-text-secondary border border-border-subtle'
        }`}
      >
        {t('routeResults.allModels', { count: totalCount })}
      </button>

      {/* Individual model switches with hit counts */}
      {terms.map((term) => {
        const termId = term.id ?? 0;
        const count = termCounts[termId] ?? term.listings ?? 0;
        const isActive = selectedTermIds.has(termId);

        return (
          <button
            key={termId || term.term}
            type="button"
            onClick={() => onToggleTerm(termId)}
            className={`min-h-[32px] px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
              isActive
                ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/40 font-bold'
                : 'bg-bg-input text-text-muted hover:text-text-secondary border border-border-subtle opacity-60'
            }`}
          >
            <span>{term.label || term.term}</span>
            <span className="font-mono text-2xs opacity-80">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
