import React, { useState } from 'react';
import { Bar, Row, Pill, EmptyLine, type RowListing } from '../components/surface';
import RouteCorridorMap, { type RouteCircle, type RouteListingGeo } from '../components/RouteCorridorMap';
import { FundeDetailSheet } from './FundeDetailSheet';
import { FundeModelsSheet } from './FundeModelsSheet';
import { FundeFilterSheet } from './FundeFilterSheet';
import { useFundeData } from '../hooks/useFundeData';
import { useKept } from '../hooks/useKept';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign, SearchFamilyTerm, RadiusDiagnosis } from '../types';
import { RefreshCw, Settings, X } from 'lucide-react';

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
  maxDetour: number | null;
  onOpenFilter: () => void;
  keptOnly: boolean;
  keptCount: number;
  onToggleKeptOnly: () => void;
  termId: number | null;
  activeTermLabel: string | null;
  onOpenModels: () => void;
  familyTerms: SearchFamilyTerm[];
  clusterFilterCount: number | null;
  onClearClusterFilter: () => void;
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
  maxDetour,
  onOpenFilter,
  keptOnly,
  keptCount,
  onToggleKeptOnly,
  termId,
  activeTermLabel,
  onOpenModels,
  familyTerms,
  clusterFilterCount,
  onClearClusterFilter,
  onStartScrape,
  isScraping,
  onConfigure,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Cluster Area Filter Active Pill */}
      {clusterFilterCount !== null && (
        <Pill
          label={t('surface.areaFilter', { count: clusterFilterCount })}
          active={true}
          icon={<X className="w-3 h-3" />}
          onClick={onClearClusterFilter}
          title={t('surface.clearAreaFilter')}
        />
      )}

      {/* One pill, not one per model. The model names belong to the setup
          screen; on a results bar they were the "Checked Models" list the owner
          asked to have removed, and three of them alone put the button count
          over budget. */}
      {familyTerms.length > 0 && (
        <Pill
          label={activeTermLabel || t('surface.models')}
          active={termId !== null}
          onClick={onOpenModels}
          title={t('surface.models')}
        />
      )}

      {keptCount > 0 && (
        <Pill
          label={t('surface.kept')}
          active={keptOnly}
          onClick={onToggleKeptOnly}
        />
      )}

      {/* One filter pill. Seven controls did not fit across 390 px -- the
          corridor pill rendered as "rridor", clipped mid-word. */}
      <Pill
        label={t('surface.filter')}
        active={dealsOnly || maxDetour !== null}
        onClick={onOpenFilter}
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
  const [clusterListingIds, setClusterListingIds] = useState<string[] | null>(null);

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

  const { kept, toggle: toggleKeep } = useKept();
  const [keptOnly, setKeptOnly] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeTerm = familyTerms.find((term) => term.id === termId);
  const activeTermLabel = activeTerm ? (activeTerm.label || activeTerm.term) : null;

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
  const hasActiveFilters = dealsOnly || termId !== null || maxDetour !== null || sort !== 'default' || clusterListingIds !== null;

  // Filter listings by cluster area if tapped on map
  const inArea = clusterListingIds
    ? listings.filter((l) => clusterListingIds.includes(l.id))
    : listings;

  // Kept finds are filtered here rather than on the server: a shortlist is a
  // handful of rows the buyer has already seen, so there is nothing to page
  // through and nothing to be wrong about in a count.
  const activeListings = keptOnly ? inArea.filter((l) => kept.has(l.id)) : inArea;

  const mapListings: RouteListingGeo[] = listings.map((l) => ({
    id: l.id,
    title: l.title,
    price: l.price || '',
    location: l.location || '',
    url: l.url || '',
    lat: typeof l.lat === 'number' ? l.lat : null,
    lon: typeof l.lon === 'number' ? l.lon : null,
    detour_min: l.detour_min ?? null,
    offroute_km: l.offroute_km ?? null,
    niceness_score: l.niceness_score ?? null,
    images: l.images || [],
  }));

  const mapCircles: RouteCircle[] = (routeData?.route?.circles || []).map((c) => ({
    lat: c.lat,
    lon: c.lon,
    radius_km: c.radius_km,
    label: c.label || '',
  }));

  return (
    <div
      className={`w-full bg-[#011F1F] text-[#F2F5F4] flex flex-col ${
        viewMode === 'map' ? 'h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* 1. Sticky Bar (48px) */}
      <Bar
        title={campaign?.name || 'Funde'}
        count={
          loading && listings.length === 0
            ? undefined
            : clusterListingIds || keptOnly
            ? activeListings.length
            : total
        }
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
            maxDetour={maxDetour}
            onOpenFilter={() => setFilterOpen(true)}
            keptOnly={keptOnly}
            keptCount={kept.size}
            onToggleKeptOnly={() => setKeptOnly((v) => !v)}
            termId={termId}
            activeTermLabel={activeTermLabel}
            onOpenModels={() => setModelsOpen(true)}
            familyTerms={familyTerms}
            clusterFilterCount={clusterListingIds ? clusterListingIds.length : null}
            onClearClusterFilter={() => setClusterListingIds(null)}
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
            onSelectCluster={(ids) => {
              setClusterListingIds(ids);
            }}
            originName={routeData?.route?.origin}
            destinationName={routeData?.route?.destination}
            className="w-full h-full"
          />
        </div>
      ) : (
        <main className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
          {activeListings.map((listing) => (
            <Row
              key={listing.id}
              listing={listing}
              isKept={kept.has(listing.id)}
              onToggleKeep={toggleKeep}
              onClick={(l) => setSelectedListing(l)}
            />
          ))}

          {/* Empty State */}
          {!loading && activeListings.length === 0 && (
            <FundeEmptyState
              radiusDiagnosis={radiusDiagnosis}
              hasActiveFilters={hasActiveFilters}
              onResetFilters={() => {
                setDealsOnly(false);
                setTermId(null);
                setMaxDetour(null);
                setClusterListingIds(null);
                setSort('default');
              }}
            />
          )}

          {/* Pagination: Load More Trigger */}
          {hasMore && !clusterListingIds && (
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
      <FundeFilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        dealsOnly={dealsOnly}
        setDealsOnly={setDealsOnly}
        isCorridor={isCorridor}
        maxDetour={maxDetour}
        setMaxDetour={setMaxDetour}
      />

      <FundeModelsSheet
        isOpen={modelsOpen}
        onClose={() => setModelsOpen(false)}
        terms={familyTerms}
        termId={termId}
        onSelect={setTermId}
      />

      <FundeDetailSheet
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
    </div>
  );
};

export default FundeScreen;
