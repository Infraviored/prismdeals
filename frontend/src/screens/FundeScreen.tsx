import React, { useState } from 'react';
import { Bar, Row, Pill, EmptyLine, type RowListing } from '../components/surface';
import RouteCorridorMap, { type RouteCircle, type RouteListingGeo } from '../components/RouteCorridorMap';
import { FundeDetailSheet } from './FundeDetailSheet';
import { useFundeData } from '../hooks/useFundeData';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign, SearchFamilyTerm, RadiusDiagnosis } from '../types';
import { RefreshCw, Settings } from 'lucide-react';

export interface FundeScreenProps {
  campaign: Campaign | undefined;
  onBack: () => void;
  onConfigure: () => void;
  onStartScrape?: () => void;
  isScraping?: boolean;
}

interface FundeBarActionsProps {
  isCorridor: boolean;
  viewMode: 'list' | 'map';
  setViewMode: (mode: 'list' | 'map') => void;
  sort: string;
  cycleSort: () => void;
  sortLabel: string;
  dealsOnly: boolean;
  setDealsOnly: (d: boolean) => void;
  maxDetour: number | null;
  setMaxDetour: (d: number | null) => void;
  termId: number | null;
  setTermId: (t: number | null) => void;
  familyTerms: SearchFamilyTerm[];
  onStartScrape?: () => void;
  isScraping: boolean;
  onConfigure: () => void;
}

const FundeBarActions: React.FC<FundeBarActionsProps> = ({
  isCorridor,
  viewMode,
  setViewMode,
  sort,
  cycleSort,
  sortLabel,
  dealsOnly,
  setDealsOnly,
  maxDetour,
  setMaxDetour,
  termId,
  setTermId,
  familyTerms,
  onStartScrape,
  isScraping,
  onConfigure,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Term / Model Filter Pills */}
      {familyTerms.length > 0 && (
        <div className="flex items-center gap-1">
          {termId !== null && (
            <Pill
              label={t('surface.allModels')}
              active={false}
              onClick={() => setTermId(null)}
            />
          )}
          {familyTerms.slice(0, 3).map((term) => (
            <Pill
              key={term.id}
              label={term.label || term.term}
              active={termId === term.id}
              onClick={() => setTermId(termId === term.id ? null : (term.id ?? null))}
            />
          ))}
        </div>
      )}

      {/* Corridor Max Detour Filter */}
      {isCorridor && (
        <Pill
          label={maxDetour ? `≤ ${maxDetour} min` : 'Korridor'}
          active={maxDetour !== null}
          onClick={() => setMaxDetour(maxDetour === 10 ? null : (maxDetour === null ? 10 : null))}
        />
      )}

      {/* Deals Only Pill */}
      <Pill
        label={t('surface.dealsOnly')}
        variant="accent"
        active={dealsOnly}
        onClick={() => setDealsOnly(!dealsOnly)}
      />

      {/* Sort Pill */}
      <Pill
        label={sortLabel}
        active={sort !== 'default'}
        onClick={cycleSort}
        title={t('surface.sort')}
      />

      {/* Map / List View Toggle */}
      {isCorridor && (
        <Pill
          label={viewMode === 'map' ? t('surface.list') : t('surface.map')}
          active={viewMode === 'map'}
          onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
        />
      )}

      {/* Scrape / Refresh Action */}
      {onStartScrape && (
        <Pill
          icon={<RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin text-[#10B981]' : ''}`} />}
          onClick={onStartScrape}
          disabled={isScraping}
          title={t('surface.fetchListings')}
        />
      )}

      {/* Settings */}
      <Pill
        data-testid="campaign-settings-btn"
        icon={<Settings className="w-3.5 h-3.5" />}
        onClick={onConfigure}
        title={t('surface.settings')}
      />
    </>
  );
};

interface FundeEmptyStateProps {
  radiusDiagnosis: RadiusDiagnosis | null;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

const FundeEmptyState: React.FC<FundeEmptyStateProps> = ({
  radiusDiagnosis,
  hasActiveFilters,
  onResetFilters,
}) => {
  const { t } = useTranslation();

  return (
    <EmptyLine
      message={t('surface.noMatchesInRadius', { radius: 30 })}
      actions={
        <>
          {radiusDiagnosis?.options?.map((opt) => (
            <Pill
              key={opt.radius}
              label={`${opt.radius} km`}
              count={opt.count}
              onClick={() => {}}
            />
          ))}
          {hasActiveFilters && (
            <Pill
              label={t('surface.resetFilter')}
              onClick={onResetFilters}
            />
          )}
        </>
      }
    />
  );
};

export const FundeScreen: React.FC<FundeScreenProps> = ({
  campaign,
  onBack,
  onConfigure,
  onStartScrape,
  isScraping = false,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedListing, setSelectedListing] = useState<RowListing | null>(null);

  const {
    listings,
    total,
    rawTotal,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    sort,
    setSort,
    dealsOnly,
    setDealsOnly,
    maxDetour,
    setMaxDetour,
    termId,
    setTermId,
    familyTerms,
    radiusDiagnosis,
    routeData,
  } = useFundeData({ campaign, isScraping });

  const cycleSort = () => {
    const sortCycle = ['default', 'price_asc', 'price_desc', 'newest', 'score'];
    const nextIdx = (sortCycle.indexOf(sort) + 1) % sortCycle.length;
    setSort(sortCycle[nextIdx]);
  };

  const getSortLabel = (): string => {
    if (sort === 'price_asc') return `⇅ ${t('surface.sortPriceAsc')}`;
    if (sort === 'price_desc') return `⇅ ${t('surface.sortPriceDesc')}`;
    if (sort === 'newest') return `⇅ ${t('surface.sortNewest')}`;
    if (sort === 'score') return `⇅ ${t('surface.sortScore')}`;
    return '⇅';
  };

  const isCorridor = !!campaign?.route_id;
  const hasActiveFilters = dealsOnly || termId !== null || maxDetour !== null || sort !== 'default';

  const mapListings: RouteListingGeo[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    price: l.price || '',
    location: l.location || '',
    url: l.url || '',
    lat: null,
    lon: null,
    detour_min: l.detour_min ?? null,
    offroute_km: l.offroute_km ?? null,
    niceness_score: null,
    images: l.images || [],
  }));

  const mapCircles: RouteCircle[] = (routeData?.route?.circles || []).map((c) => ({
    lat: c.lat,
    lon: c.lon,
    radius_km: c.radius_km,
    label: c.label || '',
  }));

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col w-full">
      {/* 1. Sticky Bar (48px) */}
      <Bar
        title={campaign?.name || 'Funde'}
        count={loading && listings.length === 0 ? undefined : total}
        onBack={onBack}
        backLabel={t('surface.back')}
        actions={
          <FundeBarActions
            isCorridor={isCorridor}
            viewMode={viewMode}
            setViewMode={setViewMode}
            sort={sort}
            cycleSort={cycleSort}
            sortLabel={getSortLabel()}
            dealsOnly={dealsOnly}
            setDealsOnly={setDealsOnly}
            maxDetour={maxDetour}
            setMaxDetour={setMaxDetour}
            termId={termId}
            setTermId={setTermId}
            familyTerms={familyTerms}
            onStartScrape={onStartScrape}
            isScraping={isScraping}
            onConfigure={onConfigure}
          />
        }
      />

      {/* 2. Main Viewport */}
      {viewMode === 'map' && isCorridor ? (
        <div className="flex-1 w-full h-[calc(100vh-48px)] relative">
          <RouteCorridorMap
            polyline={routeData?.route?.polyline || []}
            circles={mapCircles}
            listings={mapListings}
            selectedListingId={selectedListing?.id || null}
            onSelectListing={(id) => {
              const found = listings.find((l) => l.id === id);
              if (found) setSelectedListing(found);
            }}
            originName={routeData?.route?.origin}
            destinationName={routeData?.route?.destination}
            className="w-full h-full"
          />
        </div>
      ) : (
        <main className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
          {listings.map((listing) => (
            <Row
              key={listing.id}
              listing={listing}
              onClick={(l) => setSelectedListing(l)}
            />
          ))}

          {/* Empty State */}
          {!loading && listings.length === 0 && (
            <FundeEmptyState
              radiusDiagnosis={radiusDiagnosis}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={() => {
                setDealsOnly(false);
                setTermId(null);
                setMaxDetour(null);
                setSort('default');
              }}
            />
          )}

          {/* Pagination: Load More Trigger */}
          {hasMore && (
            <div className="py-4 px-4 flex justify-center items-center border-b border-white/[0.08]">
              <Pill
                label={loadingMore ? t('surface.loading') : `${t('surface.loadMore')} (${listings.length}/${rawTotal})`}
                disabled={loadingMore}
                onClick={loadMore}
                className="px-6 py-2 text-sm"
              />
            </div>
          )}
        </main>
      )}

      {/* 3. Detail Sheet */}
      <FundeDetailSheet
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
    </div>
  );
};

export default FundeScreen;
