import { Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useTranslation } from '../hooks/useTranslation';
import type { SearchFamilyTerm } from '../types';
import { parseLinesToTerms } from '../utils/searchFamily';
import SearchFamilyTermItem from './SearchFamilyTermItem';

export interface SearchFamilyTermListProps {
  terms: SearchFamilyTerm[];
  activeTerms: SearchFamilyTerm[];
  pasteText: string;
  onPasteTextChange: (text: string) => void;
  onApplyPaste: () => void;
  additionalText: string;
  onAdditionalTextChange: (text: string) => void;
  onAddAdditional: () => void;
  onToggleTerm: (index: number) => void;
  onDeleteTerm: (index: number) => void;
  onToggleAll: () => void;
  onClearAll: () => void;
  onSetTerms: (terms: SearchFamilyTerm[] | ((prev: SearchFamilyTerm[]) => SearchFamilyTerm[])) => void;
}

export default function SearchFamilyTermList({
  terms,
  activeTerms,
  pasteText,
  onPasteTextChange,
  onApplyPaste,
  additionalText,
  onAdditionalTextChange,
  onAddAdditional,
  onToggleTerm,
  onDeleteTerm,
  onToggleAll,
  onClearAll,
  onSetTerms,
}: SearchFamilyTermListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="family-models-textarea" className="text-xs sm:text-sm font-semibold text-text-secondary">
          {t('searchFamily.modelsLabel')}
        </label>
        {terms.length > 0 && (
          <div className="flex items-center gap-3 text-2xs text-text-muted">
            <span>
              {t('searchFamily.activeCount', {
                active: activeTerms.length,
                total: terms.length,
              })}
            </span>
            <button
              type="button"
              onClick={onToggleAll}
              className="hover:text-text-primary underline cursor-pointer"
            >
              {t('searchFamily.toggleTermActive')}
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="hover:text-status-danger underline cursor-pointer"
            >
              {t('searchFamily.clearAll')}
            </button>
          </div>
        )}
      </div>

      {terms.length === 0 ? (
        <div className="space-y-2">
          <textarea
            id="family-models-textarea"
            rows={5}
            value={pasteText}
            onChange={(e) => onPasteTextChange(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (pasted.includes('\n')) {
                e.preventDefault();
                const parsed = parseLinesToTerms(pasted);
                if (parsed.length > 0) {
                  onSetTerms(parsed);
                  onPasteTextChange('');
                }
              }
            }}
            placeholder={t('searchFamily.modelsPlaceholder')}
            className="w-full p-3 rounded-xl border border-border-subtle bg-bg-input text-text-primary text-sm font-mono focus:outline-none focus:border-brand-accent/50 transition-colors"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs text-text-muted">{t('searchFamily.modelsHelp')}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onApplyPaste}
              disabled={!pasteText.trim()}
              className="font-semibold text-xs py-1.5"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('searchFamily.parseButton')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {terms.map((term, index) => (
              <SearchFamilyTermItem
                key={`${term.term}-${index}`}
                term={term}
                index={index}
                onToggle={onToggleTerm}
                onDelete={onDeleteTerm}
                toggleLabel={t('searchFamily.toggleTermActive')}
                deleteLabel={t('searchFamily.deleteTerm')}
              />
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <Input
              type="text"
              value={additionalText}
              onChange={(e) => onAdditionalTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddAdditional();
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.includes('\n')) {
                  e.preventDefault();
                  const parsed = parseLinesToTerms(pasted);
                  if (parsed.length > 0) {
                    onSetTerms((prev) => [...prev, ...parsed]);
                    onAdditionalTextChange('');
                  }
                }
              }}
              placeholder={t('searchFamily.addModelPlaceholder')}
              className="flex-1 text-xs bg-bg-input border-border-subtle font-mono"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onAddAdditional}
              disabled={!additionalText.trim()}
              className="shrink-0 text-xs px-3"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('searchFamily.addModelButton')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
