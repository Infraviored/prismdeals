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
  onCategoryChange: (id: string | null) => void;
  onAttributesChange: (attributes: string[]) => void;
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
        setFilters((d.filters || []).filter((f: TaxonomyFilter) => f.location === 'tail'));
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
    `w-full text-left px-3 py-3 min-h-[44px] border-b border-white/[0.08] text-sm flex items-center justify-between gap-3 ${
      selected ? 'text-[#F2F5F4]' : 'text-[#9FB3B0]'
    }`;

  const shown = search.trim()
    ? tree.filter(c =>
        `${c.parent_name || ''} ${c.name}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : tree;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[#9FB3B0]">
        {t('surface.category')}
      </label>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/[0.04] border border-white/[0.08] text-left text-sm text-[#F2F5F4] hover:border-white/30 transition-colors"
      >
        {categoryName || (
          <span className="text-[#9FB3B0]">{t('surface.anyCategory')}</span>
        )}
      </button>

      {filters.map(filter => {
        const current = valueOf(filter.key);
        const label = filter.options?.find(o => o.value === current)?.label || current;
        return (
          <button
            key={filter.key}
            type="button"
            onClick={() => setOpenFilter(filter)}
            className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-3 text-sm hover:border-white/30 transition-colors"
          >
            <span className="text-[#9FB3B0]">{filter.label}</span>
            <span className={label ? 'text-[#F2F5F4]' : 'text-[#9FB3B0]/50'}>
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
          className="w-full mb-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] placeholder-[#9FB3B0]/40 focus:outline-none focus:border-white/30 text-sm"
        />
        {unavailable ? (
          <p className="px-3 py-3 text-sm text-[#9FB3B0]">{t('surface.categoriesUnavailable')}</p>
        ) : (
          <div className="flex flex-col">
            <button onClick={() => pickCategory(null)} className={rowClass(!categoryId)}>
              {t('surface.anyCategory')}
            </button>
            {shown.map(c => (
              <button key={c.id} onClick={() => pickCategory(c.id)} className={rowClass(categoryId === c.id)}>
                <span>{c.name}</span>
                {c.parent_name && (
                  <span className="text-2xs text-[#9FB3B0]/60 shrink-0">{c.parent_name}</span>
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
