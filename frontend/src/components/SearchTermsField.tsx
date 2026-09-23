import React, { useState } from 'react';
import type { SearchFamilyTerm } from '../types';
import { useTranslation } from '../hooks/useTranslation';

export interface SearchTermsFieldProps {
  terms: SearchFamilyTerm[];
  /** A broad term derived from the hunt's name, offered while there is none. */
  suggestion: string;
  onAdd: (term: string) => void;
  onRemove: (index: number) => void;
}

/** What is actually typed into Kleinanzeigen's search box.
 *
 * This used to be an unlabelled row of truncated chips under the name, and the
 * name itself silently became the term -- "…-2x16-ddr4-3200-cl16", which finds
 * almost nothing because sellers rarely write clock or latency. The terms are
 * their own section now, with what each one found, so a term that loses
 * listings can be seen and replaced.
 */
export const SearchTermsField: React.FC<SearchTermsFieldProps> = ({ terms, suggestion, onAdd, onRemove }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed) onAdd(trimmed);
    setDraft('');
  };

  const offer = terms.length === 0 && suggestion;

  return (
    <div className="space-y-2">
      <label htmlFor="setup-term" className="block text-xs font-medium text-[#8FA6A1]">
        {t('surface.searchTerms')}
      </label>
      <p className="text-xs text-[#8FA6A1]">{t('surface.searchTermsHint')}</p>

      {terms.length > 0 && (
        <ul className="space-y-1.5">
          {terms.map((term, idx) => {
            const measured = typeof term.listings === 'number';
            return (
              <li
                key={`${term.term}-${idx}`}
                className="flex items-center justify-between gap-3 px-3.5 py-2 rounded bg-[#00100F] border border-[#0E4A40] text-sm"
              >
                <span className="min-w-0 break-words text-[#F2F5F4]">{term.label || term.term}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {measured && (
                    <span className="text-xs text-[#8FA6A1] tabular-nums">
                      {t('surface.termYield', { found: term.listings ?? 0, fit: term.fit_listings ?? 0 })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="min-h-[32px] min-w-[32px] text-[#8FA6A1] hover:text-[#F2F5F4] cursor-pointer text-base leading-none"
                    aria-label={t('surface.removeTerm', { term: term.label || term.term })}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {offer && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded border border-dashed border-[#0E4A40] text-sm">
          <span className="min-w-0 break-words">
            <span className="text-[#8FA6A1]">{t('surface.termSuggestion')} </span>
            <span className="text-[#F2F5F4]">{suggestion}</span>
          </span>
          <button
            type="button"
            onClick={() => onAdd(suggestion)}
            className="shrink-0 px-3 py-1.5 rounded border border-[#0E4A40] text-[#F2F5F4] hover:border-[#8FA6A1] cursor-pointer text-xs"
          >
            {t('surface.termAccept')}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          id="setup-term"
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('surface.addTermPlaceholder')}
          className="flex-1 min-w-0 px-3.5 py-2 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 px-3 py-2 rounded border border-[#0E4A40] text-sm text-[#F2F5F4] hover:border-[#8FA6A1] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('surface.addTerm')}
        </button>
      </div>
    </div>
  );
};

export default SearchTermsField;
