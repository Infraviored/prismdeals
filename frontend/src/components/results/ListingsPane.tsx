/**
 * ListingsPane — the populated results column.
 *
 * Responsibility: model filter bar + search/sort controls + scrollable list of
 * ListingRow entries. Mounts on desktop always; on mobile only when the "list"
 * tab is active. No map, no empty-state handling — those are in sibling
 * components.
 *
 * Rule: no `counts.total > 0` or `hasListings` guard here. The parent
 * (ResultsScreen) only mounts this component when the search phase is
 * `has_results`. Visibility decisions are made exactly once, in searchState.ts.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import SearchFamilyFilterBar from '../SearchFamilyFilterBar';
import ListingRow from './ListingRow';
import { Filter } from 'lucide-react';
import { Button } from '../ui/Button';
import type { RouteListingGeo } from '../RouteCorridorMap';
import type { SearchFamilyTerm } from '../../types';

interface ListingsPaneProps {
  listings: RouteListingGeo[];
  familyTerms: SearchFamilyTerm[];
  selectedTermIds: Set<number>;
  termCounts: Record<number, number>;
  onToggleTerm: (id: number) => void;
  onToggleAll: () => void;
  selectedListingId: string | null;
  onSelectListing: (id: string) => void;
}

function parsePrice(priceStr: string): number {
  if (!priceStr) return 999999;
  const match = priceStr.replace(/\./g, '').replace(/,/g, '.').match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 999999;
}

export default function ListingsPane({
  listings,
  familyTerms,
  selectedTermIds,
  termCounts,
  onToggleTerm,
  onToggleAll,
  selectedListingId,
  onSelectListing,
}: ListingsPaneProps) {
  const { t } = useTranslation();

  const [selectedDetourMax, setSelectedDetourMax] = useState<'all' | '15' | '30' | '60'>('all');
  const [sortBy, setSortBy] = useState<'detour' | 'price'>('detour');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredListings = useMemo(() => {
    let list = [...listings];

    if (familyTerms.length > 0 && selectedTermIds.size < familyTerms.length) {
      list = list.filter((l) =>
        l.matched_terms?.some((mt) => selectedTermIds.has(mt.id))
      );
    }

    if (selectedDetourMax !== 'all') {
      const maxMin = parseInt(selectedDetourMax, 10);
      list = list.filter((l) => l.detour_min !== null && l.detour_min <= maxMin);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (l) => l.title.toLowerCase().includes(q) || l.location.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'detour') {
        if (a.detour_min === null && b.detour_min === null) return 0;
        if (a.detour_min === null) return 1;
        if (b.detour_min === null) return -1;
        return a.detour_min - b.detour_min;
      }
      if (sortBy === 'price') {
        return parsePrice(a.price) - parsePrice(b.price);
      }
      return 0;
    });

    return list;
  }, [listings, familyTerms, selectedTermIds, selectedDetourMax, searchQuery, sortBy]);

  const handleResetFilters = useCallback(() => {
    setSelectedDetourMax('all');
    setSearchQuery('');
  }, []);

  return (
    <div className="space-y-2">
      {/* Model filter bar — only shown when there are terms */}
      {familyTerms.length > 0 && (
        <SearchFamilyFilterBar
          terms={familyTerms}
          selectedTermIds={selectedTermIds}
          termCounts={termCounts}
          totalCount={listings.length}
          onToggleTerm={onToggleTerm}
          onToggleAll={onToggleAll}
        />
      )}

      {/* Search + Sort + Detour filter — 2 rows max on 390 px */}
      <Card className="p-2 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 bg-bg-surface border-border-subtle">
        {/* Detour filter chips */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:flex-wrap min-w-0">
          <span className="hidden md:flex text-2xs text-text-muted font-bold uppercase tracking-wider items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3 h-3 text-text-muted" />
            {t('routeResults.detourFilterLabel')}:
          </span>
          <Filter className="w-3.5 h-3.5 text-text-muted shrink-0 md:hidden" />

          {(['all', '15', '30', '60'] as const).map((choice) => {
            const label =
              choice === 'all'
                ? t('routeResults.allDetours')
                : choice === '15'
                ? t('routeResults.within15Min')
                : choice === '30'
                ? t('routeResults.within30Min')
                : t('routeResults.within60Min');

            const active = selectedDetourMax === choice;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => setSelectedDetourMax(choice)}
                className={`min-h-[36px] px-2 sm:px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center justify-center shrink-0 whitespace-nowrap ${
                  active
                    ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/40 font-bold'
                    : 'bg-bg-input text-text-muted hover:text-text-secondary border border-border-subtle'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1 min-w-0 sm:w-56 sm:flex-none">
            <Input
              type="text"
              placeholder={t('routeResults.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs py-1.5 bg-bg-input border-border-subtle"
            />
          </div>

          <div className="w-[7.5rem] shrink-0 sm:w-44">
            <Select
              value={sortBy}
              onChange={(val) => setSortBy(val as 'detour' | 'price')}
              options={[
                { value: 'detour', label: t('routeResults.sortByDetour') },
                { value: 'price', label: t('routeResults.sortByPrice') },
              ]}
              className="text-xs py-1.5 bg-bg-input border-border-subtle whitespace-nowrap"
            />
          </div>
        </div>
      </Card>

      {/* Listing rows */}
      <div className="space-y-2.5 max-h-[calc(100vh-250px)] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
        {filteredListings.length === 0 ? (
          <div className="bg-bg-surface border border-dashed border-border-subtle rounded-2xl p-10 text-center space-y-2">
            <p className="text-xs font-semibold text-text-muted">
              {t('routeResults.noFilterMatches')}
            </p>
            <Button
              variant="badge"
              size="xs"
              onClick={handleResetFilters}
            >
              {t('routeResults.resetFilters')}
            </Button>
          </div>
        ) : (
          filteredListings.map((l) => (
            <ListingRow
              key={l.id}
              listing={l}
              isSelected={selectedListingId === l.id}
              onSelect={onSelectListing}
            />
          ))
        )}
      </div>
    </div>
  );
}
