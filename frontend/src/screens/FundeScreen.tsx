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
import { FundeSignalsSheet } from './FundeSignalsSheet';
import { useFundeActions } from './FundeStrip';
import { useFundeData, type FundeTabKey, type FundeSort } from '../hooks/useFundeData';
import { useHuntDocument } from '../hooks/useHuntDocument';
import { useKept } from '../hooks/useKept';
import { useTranslation } from '../hooks/useTranslation';
import { useLinkedListing } from '../hooks/useLinkedListing';
import { conditionsById } from '../utils/huntDoc';
import type { Signal } from '../types/hunt';
import FundeEmpty from './FundeEmpty';
import Freshness from './Freshness';

export interface FundeScreenProps {
  huntId: number | null;
  onBack: () => void;
  onConfigure: () => void;
  onStartScrape?: () => void;
  isScraping?: boolean;
  /** The hunt itself changed (a corridor added): reload the list of hunts. */
  onCampaignChanged?: () => void;
}

/** The usual price of the listing's own product, when known. */
function marketFor(listing: RowListing | null | undefined): number | null {
  const median = listing?.market_basis?.median ?? listing?.score_parts?.market_basis?.median;
  return typeof median === 'number' ? median : null;
}

export const FundeScreen: React.FC<FundeScreenProps> = ({
  huntId,
  onBack,
  onConfigure,
  onStartScrape,
  isScraping = false,
  onCampaignChanged,
}) => {
  const { t } = useTranslation();
  const { kept, toggle } = useKept();
  const hunt = useHuntDocument(huntId);
  const doc = hunt.doc;

  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [corridorOpen, setCorridorOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [comparing, setComparing] = useState(false);

  const data = useFundeData({ huntId, familyId: doc?.family_id ?? null, isScraping });
  const { listings, total, counts, loading, loadingMore, hasMore, loadMore, reload, tab, setTab, overview, bestListing, sort, setSort, route, mapPoints } = data;

  const conditions = useMemo(() => conditionsById(doc), [doc]);

  const handleCompare = useCallback(async () => {
    if (!huntId || comparing) return;
    setComparing(true);
    try {
      const res = await fetch(`/api/campaigns/${huntId}/compare`, { method: 'POST' });
      if (!res.ok) return;
      // The comparison runs in the background for a minute or two; ask until
      // it is done, then show the ranks.
      for (let i = 0; i < 100; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = await fetch(`/api/campaigns/${huntId}/ranks`).then((r) => r.json());
        if (!status.running) break;
      }
      reload();
    } catch (e) {
      console.error('Failed to trigger comparison:', e);
    } finally {
      setComparing(false);
    }
  }, [huntId, comparing, reload]);

  // A wider radius is a change of the hunt's frame, then a new crawl when the
  // server says its URLs changed. Saving gives the conditions new ids: read
  // the offers again, or their states point at ids that are gone.
  const widen = async (km: number) => {
    if (!doc || hunt.saving) return;
    const saved = await hunt.save({ ...doc, frame: { ...doc.frame, radius_km: km } });
    if (!saved) return;
    data.clearRadiusDiagnosis();
    reload();
    if (saved.crawl_changed) onStartScrape?.();
  };

  // A proposed signal taken as a wish, weighted as proposed; the conditions
  // get new ids on saving, so the offers are read again.
  const addSignal = async (signal: Signal): Promise<boolean> => {
    if (!doc || hunt.saving) return false;
    const wish = { attr_id: signal.attr_id, label: signal.label, op: 'present' as const, value: null, importance: 'wish' as const, weight: signal.default_weight };
    const saved = await hunt.save({ ...doc, conditions: [...doc.conditions, wish] });
    if (!saved) return false;
    reload();
    if (saved.crawl_changed) onStartScrape?.();
    return true;
  };

  const { selectedListing, openListing, openPartial } = useLinkedListing(listings, huntId);

  // A link can open a sheet (?sheet=requirements, ?sheet=knowledge), also
  // when only the part after # changes and the page does not reload.
  useEffect(() => {
    const openFromHash = () => {
      if (/[?&]sheet=requirements/.test(window.location.hash)) setRequirementsOpen(true);
      if (/[?&]sheet=knowledge/.test(window.location.hash)) setKnowledgeOpen(true);
      if (/[?&]sheet=signals/.test(window.location.hash)) setSignalsOpen(true);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  // Every pin of the tab when the server sends them; otherwise what is loaded.
  const mapListings: RouteListingGeo[] = useMemo(
    () => (mapPoints.length > 0 ? mapPoints : listings.filter((l) => typeof l.lat === 'number' && typeof l.lon === 'number')),
    [mapPoints, listings]
  );

  const openFromMap = useCallback(
    (id: string) => {
      const loaded = listings.find((l) => l.id === id);
      if (loaded) return openListing(loaded);
      const pin = mapPoints.find((p) => p.id === id);
      if (pin) openPartial({ ...pin, title: pin.title || '', images: pin.images || [] } as RowListing);
    },
    [listings, mapPoints, openListing, openPartial]
  );

  const actions = useFundeActions({
    total,
    onBack,
    onConfigure,
    onCorridor: doc?.family_id ? () => setCorridorOpen(true) : undefined,
    onTargets: doc && doc.targets.length > 1 ? () => setModelsOpen(true) : undefined,
    onFilter: () => setFilterOpen(true),
    onStartScrape,
    isScraping,
    onCompare: huntId ? handleCompare : undefined,
    comparing,
    onKnowledge: huntId ? () => setKnowledgeOpen(true) : undefined,
    onSignals: huntId ? () => setSignalsOpen(true) : undefined,
  });

  const sorts: Array<{ key: FundeSort; label: string }> = [
    { key: 'price_asc', label: t('surface.sortCheap') },
    { key: 'near', label: t('surface.sortNear') },
    { key: 'score', label: t('surface.sortBest') },
  ];

  const pots = counts ?? overview?.pots ?? { all: 0, fit: 0, unclear: 0, no: 0 };
  const tabs: Array<{ key: FundeTabKey; label: string; count: number }> = [
    { key: 'fit', label: t('surface.tabFit'), count: pots.fit },
    { key: 'unclear', label: t('surface.tabUnclear'), count: pots.unclear },
    { key: 'no', label: t('surface.tabNo'), count: pots.no },
    { key: 'all', label: t('surface.tabAll'), count: pots.all },
  ];
  const targetFilter = data.targetId !== null ? doc?.targets.find((tg) => tg.node_id === data.targetId) : null;

  const heroListing = (tab === 'fit' || tab === 'all') && bestListing ? bestListing : null;
  // The server orders, over the whole hunt; only the hero leaves the list.
  const displayListings = heroListing ? listings.filter((l) => l.id !== heroListing.id) : listings;

  // Weak market banner: the best candidate is above its product's usual price.
  const aboveMedian = useMemo(() => {
    const median = marketFor(bestListing);
    return Boolean(bestListing && median !== null && typeof bestListing.price_eur === 'number' && bestListing.price_eur > median);
  }, [bestListing]);

  const delta = bestListing?.price_delta_eur;
  const verdictText =
    pots.all === 0 ? (
      <span className="quiet">{t('surface.verdictEmpty')}</span>
    ) : (
      <>
        {t('surface.verdictSummary', { fits: pots.fit, total: pots.all })}{' '}
        {bestListing?.is_deal && delta ? t('surface.verdictCheapest', { amount: delta }) : <span className="quiet">{t('surface.noDealNotice')}</span>}
      </>
    );

  const listHeadKey = { fit: 'listHeadFit', unclear: 'listHeadUnclear', no: 'listHeadNo', all: 'listHeadAll' } as const;
  const topReason = overview?.rejections?.[0]?.reason || null;

  return (
    <div className="c-page">
      {actions.strip}

      <header className="masthead">
        <h1>{doc?.name || '—'}</h1>
        <p className="verdict" id="verdict">{verdictText}</p>
        <Freshness
          isScraping={isScraping}
          lastCrawledAt={overview?.last_crawled_at || listings[0]?.first_seen_at}
          scheduleMinutes={overview?.schedule_interval ?? 0}
        />
      </header>

      <div className="tabs" role="tablist" id="tabs">
        {tabs.map((item) => (
          <button key={item.key} className="tab" role="tab" type="button" data-tab={item.key} aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label} <span className="num">{item.count}</span>
          </button>
        ))}
      </div>
      {actions.phoneRow}

      {targetFilter && (
        <div className="mx-4 sm:mx-8 mt-3 flex items-center gap-2 text-xs text-[var(--kalk)]" data-testid="target-filter">
          <span>{t('huntEdit.onlyTarget', { name: targetFilter.name || targetFilter.typed })}</span>
          <Pill label={t('surface.resetFilter')} onClick={() => data.setTargetId(null)} />
        </div>
      )}

      {(hunt.error || hunt.saveError) && (
        <p className="mx-4 sm:mx-8 mt-3 text-xs text-[var(--glut)]" role="alert" data-testid="hunt-error">
          {hunt.saveError || hunt.error}
        </p>
      )}

      {aboveMedian && (
        <div
          data-testid="weak-market-banner"
          className="mx-4 sm:mx-8 mt-3 mb-1 px-4 py-2.5 rounded bg-[var(--messing)]/10 border border-[var(--messing)]/40 text-xs text-[var(--messing)] flex items-center gap-2"
        >
          <span>{t('surface.weakMarketAboveMedian')}</span>
        </div>
      )}

      <div className="layout">
        <main className="main">
          {heroListing && (
            <FundeBestHero
              listing={heroListing}
              medianPrice={marketFor(heroListing)}
              tab={tab}
              isKept={kept.has(heroListing.id)}
              onToggleKeep={toggle}
              onOpenListing={(l) => openListing(l)}
            />
          )}

          {displayListings.length > 0 && (
            <div className="list-head flex flex-wrap items-center justify-between gap-2" id="list-head">
              <span>{t(`surface.${listHeadKey[tab]}`, { count: displayListings.length })}</span>
              <span className="flex gap-1" role="group" aria-label={t('surface.sortBy')} data-testid="sort-pills">
                {sorts.map((s) => (
                  <Pill key={s.key} active={sort === s.key} aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                    {s.label}
                  </Pill>
                ))}
              </span>
            </div>
          )}

          <div id="rows">
            {displayListings.map((listing) => (
              <Row key={listing.id} listing={listing} isKept={kept.has(listing.id)} onToggleKeep={toggle} onClick={(l) => openListing(l)} />
            ))}
          </div>

          {displayListings.length === 0 && !loading && (
            <FundeEmpty
              tab={tab}
              potAll={pots.all}
              potUnclear={pots.unclear}
              termCount={doc?.targets.length || 1}
              lastCrawledAt={overview?.last_crawled_at}
              isScraping={isScraping}
              radiusDiagnosis={data.radiusDiagnosis}
              diagnosing={data.diagnosing}
              onShowUnclear={() => setTab('unclear')}
              onWiden={widen}
              widening={hunt.saving}
              onConfigure={onConfigure}
              filtered={data.filtered}
              onResetFilters={data.resetFilters}
            />
          )}

          <div className="more" id="more">
            {tab === 'fit' && pots.no > 0 && topReason && (
              <>
                <p>{t('surface.moreRejected', { count: pots.no, reason: topReason })}</p>
                <button className="btn" type="button" onClick={() => setTab('no')}>
                  {t('surface.viewRejected')}
                </button>
              </>
            )}
            {hasMore && (
              <button className="btn" type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('surface.loading') : t('surface.loadMore')}
              </button>
            )}
          </div>

          {/* The map closes the list: every find of this tab, not only the page. */}
          {mapListings.length > 0 && (
            <section className="map-block" aria-label={t('surface.mapAll')} data-testid="funde-map">
              <p className="list-head">
                {t('surface.mapAll')}
                {total > mapListings.length && (
                  <span className="quiet ml-3">{t('surface.mapUnplaced', { count: total - mapListings.length })}</span>
                )}
              </p>
              <div className="map-frame">
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

        <FundeAside overview={overview} bestListing={bestListing} doc={doc} />
      </div>

      <FundeDetailSheet
        listing={selectedListing}
        onClose={() => openListing(null)}
        isKept={selectedListing ? kept.has(selectedListing.id) : false}
        onToggleKeep={toggle}
        conditions={conditions}
      />

      <RequirementsSheet
        isOpen={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        huntId={huntId}
        onSaved={(crawlChanged) => {
          hunt.reload();
          reload();
          if (crawlChanged) onStartScrape?.();
        }}
      />

      <FundeModelsSheet
        isOpen={modelsOpen}
        onClose={() => setModelsOpen(false)}
        targets={doc?.targets || []}
        targetId={data.targetId}
        onSelect={data.setTargetId}
      />

      <FundeFilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        dealsOnly={data.dealsOnly}
        setDealsOnly={data.setDealsOnly}
        isCorridor={Boolean(doc?.route)}
        maxDetour={data.maxDetour}
        setMaxDetour={data.setMaxDetour}
      />

      <FundeCorridorSheet
        isOpen={corridorOpen}
        onClose={() => setCorridorOpen(false)}
        familyId={doc?.family_id ?? null}
        current={route}
        onChanged={() => {
          // The crawl's end reloads the list; reloading now showed nothing new.
          hunt.reload();
          onCampaignChanged?.();
          onStartScrape?.();
        }}
      />

      {huntId && <FundeSignalsSheet isOpen={signalsOpen} onClose={() => setSignalsOpen(false)} huntId={huntId} onAdd={addSignal} />}

      {huntId && <KnowledgeSheet isOpen={knowledgeOpen} onClose={() => setKnowledgeOpen(false)} huntId={huntId} />}
    </div>
  );
};

export default FundeScreen;
