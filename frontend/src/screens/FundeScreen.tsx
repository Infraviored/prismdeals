import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Row, Pill, type RowListing } from '../components/surface';
import RouteCorridorMap, { type RouteListingGeo } from '../components/RouteCorridorMap';
import { FundeDetailSheet } from './FundeDetailSheet';
import { FundeModelsSheet } from './FundeModelsSheet';
import { FundeFilterSheet } from './FundeFilterSheet';
import { RequirementsSheet } from './RequirementsSheet';
import { FundeAside } from './FundeAside';
import { FundeBestHero } from './FundeBestHero';
import { KnowledgeSheet } from './KnowledgeSheet';
import { FundeCorridorSheet } from './FundeCorridorSheet';
import { useFundeData, type FundeTabKey, type FundeSort } from '../hooks/useFundeData';
import { useKept } from '../hooks/useKept';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign } from '../types';
import { useLinkedListing } from '../hooks/useLinkedListing';
import FundeEmpty from './FundeEmpty';
import Freshness from './Freshness';

export interface FundeScreenProps {
  campaign: Campaign | undefined;
  onBack: () => void;
  onConfigure: () => void;
  onStartScrape?: () => void;
  isScraping?: boolean;
  /** The campaign itself changed (a corridor added): reload the list of them. */
  onCampaignChanged?: () => void;
}

/** The usual price of the listing's own product (P8), when known. */
function marketFor(listing: RowListing | null | undefined): number | null {
  const median = listing?.score_parts?.market_basis?.median;
  return typeof median === 'number' ? median : null;
}

export const FundeScreen: React.FC<FundeScreenProps> = ({
  campaign,
  onBack,
  onConfigure,
  onStartScrape,
  isScraping = false,
  onCampaignChanged,
}) => {
  const { t } = useTranslation();
  const { kept, toggle } = useKept();

  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [researchRecommended, setResearchRecommended] = useState(false);
  const [corridorOpen, setCorridorOpen] = useState(false);

  useEffect(() => {
    if (!campaign?.id) return;
    let active = true;
    fetch(`/api/campaigns/${campaign.id}/brief?check=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.research_value && data.research_value !== 'none') {
          setResearchRecommended(true);
        } else {
          setResearchRecommended(false);
        }
      })
      .catch(() => {
        if (active) setResearchRecommended(false);
      });
    return () => {
      active = false;
    };
  }, [campaign?.id]);

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
    route,
    mapPoints,
    sort,
    setSort,
    radiusDiagnosis,
    diagnosing,
    applyRadius,
  } = useFundeData({ campaign, isScraping });

  const [comparing, setComparing] = useState(false);

  const handleCompare = useCallback(async () => {
    if (!campaign?.id || comparing) return;
    setComparing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/compare`, { method: 'POST' });
      if (!res.ok) return;
      // The comparison runs in the background for a minute or two; ask until
      // it is done, then show the ranks.
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const status = await fetch(`/api/campaigns/${campaign.id}/ranks`).then(r => r.json());
        if (!status.running) break;
      }
      reload();
    } catch (e) {
      console.error('Failed to trigger comparison:', e);
    } finally {
      setComparing(false);
    }
  }, [campaign?.id, comparing, reload]);

  const { selectedListing, openListing } = useLinkedListing(listings, campaign?.id ?? null);

  useEffect(() => {
    if (/[?&]sheet=requirements/.test(window.location.hash)) setRequirementsOpen(true);
  }, []);

  // Every listing of the tab when the family sends its pins; otherwise what
  // is loaded. Memoised: a fresh array each render refitted the map.
  const mapListings: RouteListingGeo[] = useMemo(
    () =>
      mapPoints.length > 0
        ? mapPoints
        : listings.filter((l) => typeof l.lat === 'number' && typeof l.lon === 'number'),
    [mapPoints, listings]
  );

  const openFromMap = useCallback(
    (id: string) => {
      const found = listings.find((l) => l.id === id) ?? mapPoints.find((p) => p.id === id);
      if (found) openListing({ ...found, title: found.title || '', images: found.images || [] } as RowListing);
    },
    [listings, mapPoints, openListing]
  );

  // One corridor button, in the desktop strip and the phone row.
  const corridorButton = (placement: string) =>
    campaign?.family_id ? (
      <button type="button" className={`edit cursor-pointer ${placement}`} onClick={() => setCorridorOpen(true)}>
        {t('surface.corridorSet')}
      </button>
    ) : null;

  const sorts: Array<{ key: FundeSort; label: string }> = [
    { key: 'price_asc', label: t('surface.sortCheap') },
    { key: 'near', label: t('surface.sortNear') },
    { key: 'score', label: t('surface.sortBest') },
  ];

  // A hunt without requirements has nothing to judge, so nothing is
  // "missing": every offer sat under "Unklar" behind an empty "Passend" tab
  // ("Noch passt keines sicher"). Show them all instead, once per hunt.
  const openedAllFor = React.useRef<number | null>(null);
  useEffect(() => {
    const pots = overview?.pots;
    if (!campaign?.id || !pots || openedAllFor.current === campaign.id) return;
    if (pots.all > 0 && pots.unjudged === pots.all && tab === 'fit') {
      openedAllFor.current = campaign.id;
      setTab('all');
    }
  }, [overview?.pots, campaign?.id, tab, setTab]);

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
  // The server orders, over the whole hunt; only the hero leaves the list.
  const displayListings = heroListing ? listings.filter((l) => l.id !== heroListing.id) : listings;

  // Weak market banner (§9.7): best candidate is above median or misses a must
  const isWeakMarket = useMemo(() => {
    if (!bestListing) return false;
    // The product's own market, as the sheet and the score use it. The hunt's
    // overall median mixed in rejected offers (cheap R1s beside the CBRs) and
    // called a fair CBR "above the usual price".
    const median = marketFor(bestListing) ?? overview?.market?.median;
    if (typeof median === 'number' && typeof bestListing.price_eur === 'number' && bestListing.price_eur > median) {
      return 'median';
    }
    if (
      bestListing.fit?.verdict === 'no' ||
      (bestListing.score_parts?.gate?.violated && bestListing.score_parts.gate.violated.length > 0)
    ) {
      return 'must';
    }
    return false;
  }, [bestListing, overview?.market?.median]);

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
        {corridorButton('hidden sm:inline-flex')}
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
        {campaign?.id && (
          <button
            type="button"
            className="edit cursor-pointer hidden sm:inline-flex"
            onClick={handleCompare}
            disabled={comparing}
            data-testid="compare-btn"
          >
            {comparing ? t('surface.comparing') : t('surface.compare')}
          </button>
        )}
        {campaign?.id && researchRecommended && (
          <button
            type="button"
            className="edit cursor-pointer hidden sm:inline-flex items-center gap-1 text-[#4E8C6A] border-[#4E8C6A]/50"
            onClick={() => setKnowledgeOpen(true)}
            data-testid="knowledge-btn"
          >
            {t('surface.knowledge')}
          </button>
        )}
        <button type="button" className="edit cursor-pointer" onClick={onConfigure}>
          {t('surface.editRequirements')}
        </button>
      </nav>

        {/* 2. Masthead */}
        <header className="masthead">
          <h1>{campaign?.name || '—'}</h1>
          <p className="verdict" id="verdict">
            {verdictText}
          </p>
          <Freshness
            isScraping={isScraping}
            lastCrawledAt={overview?.last_crawled_at || listings[0]?.first_seen_at || listings[0]?.last_seen_at}
            scheduleMinutes={overview?.schedule_interval ?? 0}
          />
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
          {corridorButton('whitespace-nowrap')}
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
          {/* No compare button on the phone: the comparison runs after every
              crawl on its own. */}
          {campaign?.id && researchRecommended && (
            <button
              type="button"
              className="edit cursor-pointer whitespace-nowrap text-[#4E8C6A] border-[#4E8C6A]/50"
              onClick={() => setKnowledgeOpen(true)}
              data-testid="knowledge-btn-mobile"
            >
              {t('surface.knowledge')}
            </button>
          )}
        </div>

        {/* Weak market banner (§9.7) */}
        {isWeakMarket && (
          <div
            data-testid="weak-market-banner"
            className="mx-4 sm:mx-8 mt-3 mb-1 px-4 py-2.5 rounded bg-[var(--messing)]/10 border border-[var(--messing)]/40 text-xs text-[var(--messing)] flex items-center gap-2"
          >
            <span>
              {isWeakMarket === 'median'
                ? t('surface.weakMarketAboveMedian')
                : t('surface.weakMarketMissesMust')}
            </span>
          </div>
        )}

        {/* 4. Raster: Main + 400px Aside via Container Query */}
        <div className="layout">
          <main className="main">
            {/* Bester Fund Hero Block */}
            {heroListing && (
              <FundeBestHero
                listing={heroListing}
                medianPrice={marketFor(heroListing) ?? overview?.market?.median ?? null}
                tab={tab}
                isKept={kept.has(heroListing.id)}
                onToggleKeep={toggle}
                onOpenListing={(l) => openListing(l)}
              />
            )}

            {/* List Head */}
            {displayListings.length > 0 && (
              <div className="list-head flex flex-wrap items-center justify-between gap-2" id="list-head">
                <span>{listHeadText}</span>
                <span className="flex gap-1" role="group" aria-label={t('surface.sortBy')} data-testid="sort-pills">
                  {sorts.map((s) => (
                    <Pill key={s.key} active={sort === s.key} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                      {s.label}
                    </Pill>
                  ))}
                </span>
              </div>
            )}

            {/* Rows */}
            <div id="rows">
              {displayListings.map((listing) => (
                <Row
                  key={listing.id}
                  listing={listing}
                  isKept={kept.has(listing.id)}
                  onToggleKeep={toggle}
                  onClick={(l) => openListing(l)}
                />
              ))}
            </div>

            {/* Empty state */}
            {displayListings.length === 0 && !loading && (
              <FundeEmpty
                tab={tab}
                potAll={potAll}
                potUnclear={potUnclear}
                termCount={familyTerms.length || 1}
                lastCrawledAt={overview?.last_crawled_at}
                isScraping={isScraping}
                radiusDiagnosis={radiusDiagnosis}
                diagnosing={diagnosing}
                onShowUnclear={() => setTab('unclear')}
                onWiden={async (km) => {
                  if (await applyRadius(km)) onStartScrape?.();
                }}
                onConfigure={onConfigure}
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

        {/* The map closes the list: every find of this tab, not only the page. */}
        {mapListings.length > 0 && (
          <section className="map-block" aria-label={t('surface.mapAll')} data-testid="funde-map">
            <p className="list-head">
              {t('surface.mapAll')}
              {potAll > mapListings.length && tab === 'all' && (
                <span className="quiet ml-3">{t('surface.mapUnplaced', { count: potAll - mapListings.length })}</span>
              )}
            </p>
            <div className="map-frame">
              {/* No search circles: where the hunt looks is known, and a
                  50 km ring over a street map only got in the way. */}
              <RouteCorridorMap
                polyline={route?.polyline}
                listings={mapListings}
                selectedListingId={selectedListing?.id || null}
                onSelectListing={openFromMap}
                originName={route?.origin}
                destinationName={route?.destination}
              />
            </div>
          </section>
        )}
      </main>

      {/* 400px Seitenspalte */}
      <FundeAside overview={overview} bestListing={bestListing} />
    </div>

      {/* Sheets */}
      <FundeDetailSheet
        listing={selectedListing}
        onClose={() => openListing(null)}
        isKept={selectedListing ? kept.has(selectedListing.id) : false}
        onToggleKeep={toggle}
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

      <FundeCorridorSheet
        isOpen={corridorOpen}
        onClose={() => setCorridorOpen(false)}
        familyId={campaign?.family_id ?? null}
        current={route}
        onChanged={() => {
          // The crawl's end reloads the list; reloading now showed nothing new.
          onCampaignChanged?.();
          onStartScrape?.();
        }}
      />

      {campaign?.id && (
        <KnowledgeSheet
          isOpen={knowledgeOpen}
          onClose={() => setKnowledgeOpen(false)}
          campaignId={campaign.id}
        />
      )}
    </div>
  );
};

export default FundeScreen;
