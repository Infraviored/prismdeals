import React, { useState, useMemo, useEffect } from 'react';
import { Row, EmptyLine, Pill, type RowListing } from '../components/surface';
import RouteCorridorMap, { type RouteCircle, type RouteListingGeo } from '../components/RouteCorridorMap';
import { FundeDetailSheet } from './FundeDetailSheet';
import { FundeModelsSheet } from './FundeModelsSheet';
import { FundeFilterSheet } from './FundeFilterSheet';
import { RequirementsSheet } from './RequirementsSheet';
import { FundeAside } from './FundeAside';
import { FundeBestHero } from './FundeBestHero';
import { useFundeData, type FundeTabKey } from '../hooks/useFundeData';
import { useKept } from '../hooks/useKept';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign } from '../types';
import { formatFreshness } from '../utils/freshness';

export interface FundeScreenProps {
  campaign: Campaign | undefined;
  onBack: () => void;
  onConfigure: () => void;
  onStartScrape?: () => void;
  isScraping?: boolean;
}

export const FundeScreen: React.FC<FundeScreenProps> = ({
  campaign,
  onBack,
  onConfigure,
  onStartScrape,
  isScraping = false,
}) => {
  const { t } = useTranslation();
  const { kept, toggle } = useKept();

  const [selectedListing, setSelectedListing] = useState<RowListing | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const {
    listings,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload,
    tab,
    setTab,
    overview,
    bestListing,
    dealsOnly,
    setDealsOnly,
    maxDetour,
    setMaxDetour,
    termId,
    setTermId,
    familyTerms,
    routeData,
    radiusDiagnosis,
  } = useFundeData({ campaign, isScraping });

  useEffect(() => {
    try {
      const match = window.location.hash.match(/[?&]listingId=([^&]+)/);
      if (match && match[1] && listings.length > 0) {
        const found = listings.find((l) => l.id === match[1]);
        if (found) setSelectedListing(found);
      }
      if (/[?&]sheet=requirements/.test(window.location.hash)) {
        setRequirementsOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [listings]);

  const isCorridor = Boolean(campaign?.route_id);

  const mapCircles: RouteCircle[] = (routeData?.route?.circles || []).map((c) => ({
    lat: c.lat,
    lon: c.lon,
    radius_km: c.radius_km,
    label: c.label || '',
  }));

  const mapListings: RouteListingGeo[] = (routeData?.listings && routeData.listings.length > 0)
    ? routeData.listings
    : listings
        .filter((l) => typeof l.lat === 'number' && typeof l.lon === 'number')
        .map((l) => ({
          id: l.id,
          lat: l.lat ?? null,
          lon: l.lon ?? null,
          title: l.title || '',
          price: l.price || '',
          location: l.location || '',
          url: l.url || '',
          detour_min: l.detour_min ?? null,
          offroute_km: l.offroute_km ?? null,
          niceness_score: l.niceness_score ?? null,
          images: l.images || [],
          matched_terms: l.matched_terms,
        }));

  // Counts for tabs from overview or fallback
  const potFit = overview?.pots?.fit ?? listings.filter((l) => l.fit?.verdict === 'fit').length;
  const potUnclear = overview?.pots?.unclear ?? listings.filter((l) => l.fit?.verdict === 'unclear').length;
  const potNo = overview?.pots?.no ?? listings.filter((l) => l.fit?.verdict === 'no').length;
  const potAll = overview?.pots?.all ?? total;

  const tabs: Array<{ key: FundeTabKey; label: string; count: number }> = [
    { key: 'fit', label: t('surface.tabFit'), count: potFit },
    { key: 'unclear', label: t('surface.tabUnclear'), count: potUnclear },
    { key: 'no', label: t('surface.tabNo'), count: potNo },
    { key: 'all', label: t('surface.tabAll'), count: potAll },
  ];

  // Hero: shown when tab is fit or all, and bestListing exists
  const heroShown = (tab === 'fit' || tab === 'all') && bestListing !== null;
  const heroListing = heroShown ? bestListing : null;
  const displayListings = useMemo(() => {
    let list = listings;
    if (heroShown && heroListing) {
      list = list.filter((l) => l.id !== heroListing.id);
    }
    return [...list].sort((a, b) => {
      const pa = typeof a.price_eur === 'number' ? a.price_eur : 999999;
      const pb = typeof b.price_eur === 'number' ? b.price_eur : 999999;
      return pa - pb;
    });
  }, [listings, heroShown, heroListing]);

  // Masthead verdict sentence
  const deal = bestListing?.is_deal;
  const delta = bestListing?.price_delta_eur;
  const verdictText = potAll === 0 ? (
    <span className="quiet">{t('surface.verdictEmpty')}</span>
  ) : (
    <>
      {t('surface.verdictSummary', { fits: potFit, total: potAll })}{' '}
      {deal && delta ? (
        t('surface.verdictCheapest', { amount: delta })
      ) : (
        <span className="quiet">{t('surface.noDealNotice')}</span>
      )}
    </>
  );

  // List head text based on active tab
  const listHeadText = useMemo(() => {
    const count = displayListings.length;
    switch (tab) {
      case 'fit':
        return t('surface.listHeadFit', { count });
      case 'unclear':
        return t('surface.listHeadUnclear', { count });
      case 'no':
        return t('surface.listHeadNo', { count });
      case 'all':
      default:
        return t('surface.listHeadAll', { count });
    }
  }, [tab, displayListings.length, t]);

  const topReason = overview?.rejections?.[0]?.reason || null;

  return (
    <div className="c-page">
      {/* 1. Kopfstreifen (strip) */}
      <nav className="strip" aria-label="Navigation">
        <button type="button" data-testid="surface-bar-back" className="back" onClick={onBack}>
          {t('surface.allSearches')}
        </button>
        <span data-testid="surface-bar-count" className="sr-only">{total}</span>
        <span className="spacer" />
        {isCorridor && (
          <button type="button" className="edit cursor-pointer hidden sm:inline-flex" onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}>
            {viewMode === 'map' ? t('surface.list') : t('surface.map')}
          </button>
        )}
        {familyTerms.length > 0 && (
          <button type="button" className="edit cursor-pointer hidden sm:inline-flex" onClick={() => setModelsOpen(true)}>
            {t('surface.models')}
          </button>
        )}
        <button type="button" className="edit cursor-pointer hidden sm:inline-flex" onClick={() => setFilterOpen(true)}>
          {t('surface.filter')}
        </button>
        {onStartScrape && (
          <button type="button" className="edit cursor-pointer hidden sm:inline-flex" onClick={onStartScrape} disabled={isScraping}>
            {isScraping ? t('surface.searching') : t('surface.fetchListings')}
          </button>
        )}
        <button type="button" className="edit cursor-pointer" onClick={onConfigure}>
          {t('surface.editRequirements')}
        </button>
      </nav>

      {viewMode === 'map' && isCorridor ? (
        <div className="w-full h-[calc(100vh-44px)] relative">
          <RouteCorridorMap
            polyline={routeData?.route?.polyline || []}
            circles={mapCircles}
            listings={mapListings}
            selectedListingId={selectedListing?.id || null}
            onSelectListing={(id) => {
              const found = listings.find((l) => l.id === id);
              if (found) setSelectedListing(found);
            }}
          />
        </div>
      ) : (
        <>
          {/* 2. Masthead */}
          <header className="masthead">
            <h1>{campaign?.name || '—'}</h1>
            <p className="verdict" id="verdict">
              {verdictText}
            </p>
            {(() => {
              const rawTime = overview?.last_crawled_at || (listings.length > 0 ? (listings[0].first_seen_at || listings[0].last_seen_at) : null);
              if (!rawTime) return null;
              const f = formatFreshness(rawTime, t);
              if (!f) return null;
              const rawInterval = overview?.schedule_interval ?? 0;
              const intervalHours = rawInterval >= 60 && rawInterval % 60 === 0
                ? rawInterval / 60
                : rawInterval;

              const text =
                intervalHours <= 0
                  ? t('surface.freshnessOnce', { when: f.label })
                  : intervalHours === 1
                  ? t('surface.freshnessHourly', { when: f.label })
                  : t('surface.freshnessInterval', { when: f.label, interval: intervalHours });
              return <p className="freshness" id="freshness" data-testid="freshness">{text}</p>;
            })()}
          </header>

          {/* 3. Sticky Tabs */}
          <div className="tabs" role="tablist" id="tabs">
            {tabs.map((tabItem) => (
              <button key={tabItem.key} className="tab" role="tab" type="button" data-tab={tabItem.key} aria-selected={tab === tabItem.key} onClick={() => setTab(tabItem.key)}>
                {tabItem.label} <span className="num">{tabItem.count}</span>
              </button>
            ))}
          </div>
          <div className="sm:hidden flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-[var(--kante)] bg-[var(--grube)] text-xs text-[var(--kalk)]">
            {isCorridor && (
              <button type="button" className="edit cursor-pointer whitespace-nowrap" onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}>
                {viewMode === 'map' ? t('surface.list') : t('surface.map')}
              </button>
            )}
            {familyTerms.length > 0 && (
              <button type="button" className="edit cursor-pointer whitespace-nowrap" onClick={() => setModelsOpen(true)}>
                {t('surface.models')}
              </button>
            )}
            <button type="button" className="edit cursor-pointer whitespace-nowrap" onClick={() => setFilterOpen(true)}>
              {t('surface.filter')}
            </button>
            {onStartScrape && (
              <button type="button" className="edit cursor-pointer whitespace-nowrap" onClick={onStartScrape} disabled={isScraping}>
                {isScraping ? t('surface.searching') : t('surface.fetchListings')}
              </button>
            )}
          </div>

          {/* 4. Raster: Main + 400px Aside via Container Query */}
          <div className="layout">
            <main className="main">
              {/* Bester Fund Hero Block */}
              {heroListing && (
                <FundeBestHero
                  listing={heroListing}
                  medianPrice={overview?.market?.median ?? null}
                  tab={tab}
                  isKept={kept.has(heroListing.id)}
                  onToggleKeep={toggle}
                  onOpenListing={(l) => setSelectedListing(l)}
                />
              )}

              {/* List Head */}
              {displayListings.length > 0 && (
                <p className="list-head" id="list-head">
                  {listHeadText}
                </p>
              )}

              {/* Rows */}
              <div id="rows">
                {displayListings.map((listing) => (
                  <Row
                    key={listing.id}
                    listing={listing}
                    isKept={kept.has(listing.id)}
                    onToggleKeep={toggle}
                    onClick={(l) => setSelectedListing(l)}
                  />
                ))}
              </div>

              {/* Empty state */}
              {displayListings.length === 0 && !loading && (
                <EmptyLine
                  // An empty tab in a campaign that has listings is not an empty
                  // search: "no matches within 30 km" over four unclear laptops
                  // sent the buyer to widen a radius the campaign never had.
                  message={
                    potAll > 0 && tab === 'fit'
                      ? t('surface.emptyFit')
                      : potAll > 0 && tab !== 'all'
                      ? t('surface.emptyTab')
                      : radiusDiagnosis?.current_radius
                      ? t('surface.noMatchesInRadius', { radius: radiusDiagnosis.current_radius })
                      : radiusDiagnosis?.options?.length
                      ? t('surface.emptyWider')
                      : t('surface.emptySearch')
                  }
                  actions={
                    potAll > 0 && tab === 'fit' && potUnclear > 0
                      ? [
                          <Pill
                            key="unclear"
                            label={t('surface.showUnclear')}
                            count={potUnclear}
                            onClick={() => setTab('unclear')}
                          />,
                        ]
                      : potAll > 0 && tab !== 'all'
                      ? undefined
                      : radiusDiagnosis?.options && radiusDiagnosis.options.length > 0
                      ? radiusDiagnosis.options.map((opt) => (
                          <Pill
                            key={opt.radius}
                            label={`${opt.radius} km`}
                            count={opt.count}
                            onClick={onConfigure}
                          />
                        ))
                      : undefined
                  }
                />
              )}

          {/* More block at list bottom */}
          <div className="more" id="more">
            {tab === 'fit' && potNo > 0 && topReason && (
              <>
                <p>
                  {t('surface.moreRejected', { count: potNo, reason: topReason })}
                </p>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setTab('no')}
                >
                  {t('surface.viewRejected')}
                </button>
              </>
            )}

            {hasMore && (
              <button
                className="btn"
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t('surface.loading') : t('surface.loadMore')}
              </button>
            )}
          </div>
        </main>

        {/* 400px Seitenspalte */}
        <FundeAside overview={overview} bestListing={bestListing} />
      </div>
        </>
      )}

      {/* Sheets */}
      <FundeDetailSheet
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />

      <RequirementsSheet
        isOpen={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        campaignId={campaign?.id ?? null}
        onSaved={reload}
      />

      <FundeModelsSheet
        isOpen={modelsOpen}
        onClose={() => setModelsOpen(false)}
        terms={familyTerms}
        termId={termId}
        onSelect={setTermId}
      />

      <FundeFilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        dealsOnly={dealsOnly}
        setDealsOnly={setDealsOnly}
        isCorridor={Boolean(campaign?.route_id)}
        maxDetour={maxDetour}
        setMaxDetour={setMaxDetour}
      />
    </div>
  );
};

export default FundeScreen;
