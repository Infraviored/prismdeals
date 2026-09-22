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
  const [openFilter, setOpenFilter] = useState<TaxonomyFilter | null>(null);
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

        // A boolean has one useful state: on. The site writes it as
        // `+key:true` and offers no second value to choose from.
        if (filter.type === 'attribute_boolean') {
          const on = current === 'true';
          return (
            <button
              key={filter.key}
              type="button"
              aria-pressed={on}
              onClick={() => setValue(filter.key, on ? null : 'true')}
              className="w-full px-3.5 py-2.5 min-h-[40px] rounded bg-[#00100F] border border-[#0E4A40] flex items-center justify-between gap-3 text-sm hover:border-[#8FA6A1] transition-colors cursor-pointer"
            >
              <span className="text-[#8FA6A1]">{filter.label}</span>
              <span className={on ? 'text-[#4E8C6A] font-semibold' : 'text-[#8FA6A1]/50'}>
                {on ? '✓' : t('surface.anyValue')}
              </span>
            </button>
          );
        }

        const label = filter.options?.find(o => o.value === current)?.label || current;
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => setOpenFilter(filter)}
            className="w-full px-3.5 py-2.5 min-h-[40px] rounded bg-[#00100F] border border-[#0E4A40] flex items-center justify-between gap-3 text-sm hover:border-[#8FA6A1] transition-colors cursor-pointer"
          >
            <span className="text-[#8FA6A1]">{filter.label}</span>
            <span className={label ? 'text-[#F2F5F4]' : 'text-[#8FA6A1]/50'}>
              {label || t('surface.anyValue')}
            </span>
          </button>
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

      <Sheet
        isOpen={openFilter !== null}
        onClose={() => setOpenFilter(null)}
        title={openFilter?.label || ''}
      >
        <div className="flex flex-col">
          <button
            onClick={() => {
              if (openFilter) setValue(openFilter.key, null);
              setOpenFilter(null);
            }}
            className={rowClass(openFilter ? valueOf(openFilter.key) === null : false)}
          >
            {t('surface.anyValue')}
          </button>
          {openFilter?.options?.map(option => (
            <button
              key={option.value}
              onClick={() => {
                setValue(openFilter.key, option.value);
                setOpenFilter(null);
              }}
              className={rowClass(valueOf(openFilter.key) === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
};

export default CategoryFilters;
