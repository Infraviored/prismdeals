import React, { useEffect, useState } from 'react';
import { Sheet } from './surface';
import { useTranslation } from '../hooks/useTranslation';

export interface TaxonomyCategory {
  id: string;
  name: string;
  parent_name: string | null;
  filter_count: number;
}

export interface TaxonomyFilterOption {
  value: string;
  label: string;
}

export interface TaxonomyFilter {
  key: string;
  label: string;
  type: string;
  location: 'path' | 'tail';
  options?: TaxonomyFilterOption[];
}

export interface CategoryFiltersProps {
  categoryId: string | null;
  attributes: string[];
  /** What the buyer typed under "What", used to suggest a category. */
  term?: string;
  onCategoryChange: (id: string | null) => void;
  onAttributesChange: (attributes: string[]) => void;
}

interface Suggestion {
  id: string;
  name: string;
  filter: string | null;
  filter_label: string | null;
}

/** Choosing a category, and then the filters that category actually offers.
 *
 * Kleinanzeigen knows that a notebook has a brand, a processor and an amount of
 * RAM, and that a wardrobe has a material. Until now all of that had to be
 * squeezed into the search term -- "laserdrucker duplex adf" as one string --
 * which searches the words, not the properties.
 *
 * Only tail filters are offered here. Price is a path facet and already has its
 * own field; showing it twice would let a person set two different prices.
 */
export const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  categoryId,
  attributes,
  term = '',
  onCategoryChange,
  onAttributesChange,
}) => {
  const { t } = useTranslation();
  const [tree, setTree] = useState<TaxonomyCategory[]>([]);
  const [filters, setFilters] = useState<TaxonomyFilter[]>([]);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Nobody browses 161 categories to say "printer". The word a buyer already
  // typed is enough to offer one, and the site keeps the distinction in its
  // filter values -- so the suggestion arrives with the filter already set.
  useEffect(() => {
    const trimmed = term.trim();
    if (categoryId || trimmed.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/taxonomy/suggest?q=${encodeURIComponent(trimmed)}`)
        .then(r => (r.ok ? r.json() : { suggestions: [] }))
        .then(d => {
          if (!cancelled) setSuggestions(d.suggestions || []);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, categoryId]);

  const applySuggestion = (suggestion: Suggestion) => {
    onCategoryChange(suggestion.id);
    onAttributesChange(suggestion.filter ? [suggestion.filter] : []);
    setSuggestions([]);
  };

  useEffect(() => {
    if (!pickerOpen || tree.length > 0) return;
    fetch('/api/taxonomy/categories')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setTree(d.categories || []))
      .catch(() => setUnavailable(true));
  }, [pickerOpen, tree.length]);

  useEffect(() => {
    if (!categoryId) {
      setFilters([]);
      setCategoryName(null);
      return;
    }
    fetch(`/api/taxonomy/categories/${categoryId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        setCategoryName(d.name || null);
        // Only what this screen can actually set. 626 of the site's 957 tail
        // filters carry no options: 556 are booleans, which are a switch
        // rather than a list, and 70 are numeric ranges with no field here
        // yet. Offered as sheets they were dead buttons -- Damenbekleidung
        // grew 106 of them, 100 opening a sheet with nothing in it.
        setFilters(
          (d.filters || []).filter(
            (f: TaxonomyFilter) =>
              f.location === 'tail' &&
              (f.type === 'attribute_boolean' || (f.options || []).length > 0)
          )
        );
      })
      .catch(() => {
        setFilters([]);
        setCategoryName(null);
      });
  }, [categoryId]);

  const valueOf = (key: string): string | null => {
    const hit = attributes.find(a => a.startsWith(`${key}:`));
    return hit ? hit.slice(key.length + 1) : null;
  };

  const setValue = (key: string, value: string | null) => {
    const rest = attributes.filter(a => !a.startsWith(`${key}:`));
    onAttributesChange(value === null ? rest : [...rest, `${key}:${value}`]);
  };

  const pickCategory = (id: string | null) => {
    // The filters belong to the category. Keeping them across a change would
    // send notebooks.brand_s to a wardrobe search, which the site ignores
    // silently -- the worst kind of wrong.
    onCategoryChange(id);
    onAttributesChange([]);
    setPickerOpen(false);
    setSearch('');
  };

  const rowClass = (selected: boolean) =>
    `w-full text-left px-3 py-3 min-h-[44px] border-b border-[#0E4A40] hover:bg-[#00100F] text-sm flex items-center justify-between gap-3 transition-colors ${
      selected ? 'text-[#F2F5F4] font-medium' : 'text-[#8FA6A1]'
    }`;

  const shown = search.trim()
    ? tree.filter(c =>
        `${c.parent_name || ''} ${c.name}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : tree;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[#8FA6A1]">
        {t('surface.category')}
      </label>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full px-3.5 py-2.5 min-h-[40px] rounded bg-[#00100F] border border-[#0E4A40] text-left text-sm text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer"
      >
        {categoryName || (
          <span className="text-[#8FA6A1]">{t('surface.anyCategory')}</span>
        )}
      </button>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestions.map(suggestion => (
            <button
              key={`${suggestion.id}-${suggestion.filter || ''}`}
              type="button"
              onClick={() => applySuggestion(suggestion)}
              className="px-3 py-1.5 rounded bg-[#06322C] border border-[#0E4A40] text-xs text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer"
            >
              {suggestion.filter_label || suggestion.name}
              <span className="text-[#8FA6A1]/60"> ({suggestion.name})</span>
            </button>
          ))}
        </div>
      )}

      {filters.map(filter => {
        const current = valueOf(filter.key);
        const id = `filter-${filter.key}`;

        // A boolean has one useful state: on. The site writes it as
        // `+key:true` and offers no second value to choose from -- so it is a
        // switch, not a list with one entry.
        if (filter.type === 'attribute_boolean') {
          const on = current === 'true';
          return (
            <label
              key={filter.key}
              htmlFor={id}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded bg-[#00100F] border border-[#0E4A40] flex items-center justify-between gap-3 text-sm cursor-pointer hover:border-[#8FA6A1] transition-colors"
            >
              <span className={on ? 'text-[#F2F5F4]' : 'text-[#8FA6A1]'}>{filter.label}</span>
              <button
                id={id}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => setValue(filter.key, on ? null : 'true')}
                className={`relative shrink-0 w-10 h-6 rounded-full border transition-colors cursor-pointer ${
                  on ? 'bg-[#4E8C6A] border-[#4E8C6A]' : 'bg-[#06322C] border-[#0E4A40]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-[#F2F5F4] transition-all ${
                    on ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          );
        }

        return (
          <div
            key={filter.key}
            className="w-full px-3.5 min-h-[44px] rounded bg-[#00100F] border border-[#0E4A40] flex items-center justify-between gap-3 text-sm focus-within:border-[#8FA6A1] hover:border-[#8FA6A1] transition-colors"
          >
            <label htmlFor={id} className="text-[#8FA6A1] shrink-0">
              {filter.label}
            </label>
            <select
              id={id}
              value={current ?? ''}
              onChange={e => setValue(filter.key, e.target.value || null)}
              className={`min-w-0 max-w-[60%] py-2.5 bg-transparent text-right text-sm cursor-pointer focus:outline-none ${
                current ? 'text-[#F2F5F4]' : 'text-[#8FA6A1]/60'
              }`}
            >
              <option value="">{t('surface.anyValue')}</option>
              {filter.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      <Sheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('surface.category')}
      >
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('surface.searchCategory')}
          className="w-full mb-2 px-3.5 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
        />
        {unavailable ? (
          <p className="px-3 py-3 text-sm text-[#8FA6A1]">{t('surface.categoriesUnavailable')}</p>
        ) : (
          <div className="flex flex-col">
            <button onClick={() => pickCategory(null)} className={rowClass(!categoryId)}>
              {t('surface.anyCategory')}
            </button>
            {shown.map(c => (
              <button key={c.id} onClick={() => pickCategory(c.id)} className={rowClass(categoryId === c.id)}>
                <span>{c.name}</span>
                {c.parent_name && (
                  <span className="text-2xs text-[#8FA6A1]/60 shrink-0">{c.parent_name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </Sheet>

    </div>
  );
};

export default CategoryFilters;
