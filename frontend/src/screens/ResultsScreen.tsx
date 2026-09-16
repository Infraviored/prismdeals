/**
 * ResultsScreen — the results view for route/family campaigns.
 *
 * Modular results screen for route and family campaigns.
 *   - searchState decides which child renders.
 *   - Actions are defined once here, rendered by ScreenActionBar.
 *   - No ISO timestamps visible anywhere.
 *   - The Listings/Map tab toggle is hidden when both sides would be empty.
 *   - "Corridor" only appears in labels when a real route corridor exists.
 *   - Family settings has exactly one entry point (ScreenActionBar).
 *
 * Line budget: stays under 400 lines — subcomponents hold their own logic.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { resolveSearchState } from '../searchState';
import type { ScreenAction } from '../types/screenActions';
import ScreenActionBar from '../components/ScreenActionBar';
import ScraperProgressCard from '../components/ScraperProgressCard';
import SearchFamilyEditor from '../components/SearchFamilyEditor';
import CorridorPlanner from '../components/CorridorPlanner';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import ListingsPane from '../components/results/ListingsPane';
import MapPane from '../components/results/MapPane';
import EmptyStateView from '../components/results/EmptyStateView';
import ZeroInRadiusView from '../components/results/ZeroInRadiusView';
import type { RouteCircle, RouteListingGeo } from '../components/RouteCorridorMap';
import type { ScraperProgressCardProps, SearchFamilyTerm, SearchFamily, RadiusDiagnosis } from '../types';
import { Search, Sparkles, SlidersHorizontal, ListFilter, MapPin, X, Navigation } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteCorridorData {
  route: {
    id: number;
    campaign_id: number;
    name: string;
    base_url: string;
    origin: string;
    destination: string;
    radius_km: number;
    half_width_km: number;
    distance_km: number | null;
    duration_min: number | null;
    polyline: [number, number][];
    circles: RouteCircle[];
  };
  listings: RouteListingGeo[];
  counts: {
    total: number;
    routed: number;
    unplaced: number;
  };
}

interface ResultsScreenProps {
  campaignId?: number;
  familyId?: number;
  campaignName: string;
  onBack?: () => void;
  onEvaluateWithAi: () => void;
  isScraping: boolean;
  onStartScrape: () => void;
  scrapingStatus?: string;
  scrapingProgress?: ScraperProgressCardProps['scrapingProgress'] | null;
  liveLogs?: string;
  showLogConsole?: boolean;
  setShowLogConsole?: (val: boolean) => void;
  /** Opens the family settings modal. Only one entry point allowed. */
  onEditFamily?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRadiusFromUrl(url?: string): number {
  if (!url) return 30;
  const match = url.match(/r(\d+)(?:[#?]|$)/);
  return match ? parseInt(match[1], 10) : 30;
}

function extractLocationFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lowerWords = ['am', 'an', 'der', 'die', 'das', 'im', 'in', 'von', 'zu', 'und'];
    const formatSlug = (slug: string) =>
      slug
        .split('-')
        .map((w, idx) =>
          idx > 0 && lowerWords.includes(w.toLowerCase())
            ? w.toLowerCase()
            : w.charAt(0).toUpperCase() + w.slice(1)
        )
        .join(' ');

    for (const seg of segments) {
      if (seg.startsWith('k0') || seg.includes(':')) continue;
      if (seg.startsWith('s-')) {
        const afterS = seg.slice(2);
        if (['drucker-scanner', 'multimedia', 'elektronik'].includes(afterS)) continue;
        return formatSlug(afterS);
      }
      if (!['drucker', 'scanner', 'audio', 'kamera', 'computer'].includes(seg)) {
        return formatSlug(seg);
      }
    }
  } catch {
    // ignore
  }
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultsScreen({
  campaignId,
  familyId,
  campaignName,
  onBack,
  onEvaluateWithAi,
  isScraping,
  onStartScrape,
  scrapingStatus = '',
  scrapingProgress = null,
  liveLogs = '',
  showLogConsole = false,
  setShowLogConsole,
  onEditFamily,
}: ResultsScreenProps) {
  const { t } = useTranslation();

  // ---- data state ----
  const [routeData, setRouteData] = useState<RouteCorridorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [familyTerms, setFamilyTerms] = useState<SearchFamilyTerm[]>([]);
  const [selectedTermIds, setSelectedTermIds] = useState<Set<number>>(new Set());
  const [effectiveFamilyId, setEffectiveFamilyId] = useState<number | null>(familyId ?? null);
  const [familyDetail, setFamilyDetail] = useState<SearchFamily | null>(null);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);

  // ---- diagnosis action state ----
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [applyingRadius, setApplyingRadius] = useState<number | null>(null);
  const [radiusSuccessMsg, setRadiusSuccessMsg] = useState<string | null>(null);

  // ---- corridor draft state ----
  const [draft, setDraft] = useState<{ radius: number; corridor: number } | null>(null);
  const [redrawing, setRedrawing] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);

  // ---- UI state ----
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  useEffect(() => {
    if (familyId) setEffectiveFamilyId(familyId);
  }, [familyId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Lock body scroll when mobile corridor drawer is open
  useEffect(() => {
    if (draft && !isDesktop) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [draft, isDesktop]);

  // ---- data fetching ----
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let corridorData: RouteCorridorData | null = null;

      if (campaignId) {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/route`);
          if (res.ok) corridorData = await res.json();
        } catch { /* no corridor */ }
      }

      let targetFamilyId = familyId;
      if (!targetFamilyId && campaignId) {
        try {
          const famRes = await fetch(`/api/search-families?campaign_id=${campaignId}`);
          if (famRes.ok) {
            const famList = await famRes.json();
            if (Array.isArray(famList) && famList.length > 0) {
              targetFamilyId = famList[0].id;
              setEffectiveFamilyId(targetFamilyId ?? null);
            }
          }
        } catch { /* ignore */ }
      } else if (targetFamilyId !== undefined) {
        setEffectiveFamilyId(targetFamilyId ?? null);
      }

      if (targetFamilyId) {
        try {
          const famDetailRes = await fetch(`/api/search-families/${targetFamilyId}`);
          if (famDetailRes.ok) {
            const famDetail = await famDetailRes.json();
            setFamilyDetail(famDetail);
            if (famDetail.radius_diagnosis) setRadiusDiagnosis(famDetail.radius_diagnosis);
            const termsList: SearchFamilyTerm[] = famDetail.terms || [];
            setFamilyTerms(termsList);
            setSelectedTermIds(new Set(termsList.map((tm) => tm.id ?? 0)));
          }

          const listingsRes = await fetch(`/api/search-families/${targetFamilyId}/listings`);
          if (listingsRes.ok) {
            const listingsData = await listingsRes.json();
            const rawListings = listingsData.listings || [];
            const matchedTermsMap = new Map<string, { id: number; label: string; term?: string }[]>();
            for (const rl of rawListings) {
              if (rl.id && Array.isArray(rl.matched_terms)) {
                matchedTermsMap.set(String(rl.id), rl.matched_terms);
              }
            }

            if (corridorData) {
              corridorData.listings = corridorData.listings.map((l) => ({
                ...l,
                matched_terms:
                  l.matched_terms && l.matched_terms.length > 0
                    ? l.matched_terms
                    : matchedTermsMap.get(String(l.id)) || [],
              }));
            } else {
              const familyListings: RouteListingGeo[] = rawListings.map(
                (l: Partial<RouteListingGeo> & Record<string, unknown>) => ({
                  id: String(l.id),
                  title: String(l.title || ''),
                  price: String(l.price || ''),
                  location: String(l.location || ''),
                  url: String(l.url || ''),
                  lat: typeof l.lat === 'number' ? l.lat : null,
                  lon: typeof l.lon === 'number' ? l.lon : null,
                  detour_min: typeof l.detour_min === 'number' ? l.detour_min : null,
                  offroute_km: typeof l.offroute_km === 'number' ? l.offroute_km : null,
                  geo_status: l.geo_status ?? null,
                  niceness_score: typeof l.niceness_score === 'number' ? l.niceness_score : null,
                  llm_processed: !!l.llm_processed,
                  images: Array.isArray(l.images)
                    ? (l.images as string[])
                    : typeof l.images === 'string'
                      ? JSON.parse(l.images || '[]')
                      : [],
                  matched_terms: l.matched_terms || [],
                })
              );
              corridorData = {
                route: {
                  id: 0, campaign_id: campaignId || 0, name: campaignName,
                  base_url: '', origin: '', destination: '',
                  radius_km: 0, half_width_km: 0, distance_km: null, duration_min: null,
                  polyline: [], circles: [],
                },
                listings: familyListings,
                counts: {
                  total: familyListings.length,
                  routed: familyListings.filter((l) => l.detour_min !== null).length,
                  unplaced: familyListings.filter((l) => l.lat === null).length,
                },
              };
            }
          }
        } catch { /* ignore */ }
      }

      if (!corridorData) {
        setError('no_route');
        setRouteData(null);
      } else {
        setRouteData(corridorData);
      }
    } catch {
      setError('network_error');
    } finally {
      setLoading(false);
    }
  }, [campaignId, familyId, campaignName]);

  useEffect(() => {
    if (!isScraping) fetchData();
  }, [isScraping, fetchData]);

  // Derive terms from listings if family API had none
  useEffect(() => {
    if (familyTerms.length === 0 && routeData?.listings) {
      const termMap = new Map<number, SearchFamilyTerm>();
      for (const l of routeData.listings) {
        if (l.matched_terms) {
          for (const mt of l.matched_terms) {
            if (!termMap.has(mt.id)) {
              termMap.set(mt.id, { id: mt.id, term: mt.term || mt.label, label: mt.label, enabled: true });
            }
          }
        }
      }
      if (termMap.size > 0) {
        const derived = Array.from(termMap.values());
        setFamilyTerms(derived);
        setSelectedTermIds(new Set(derived.map((tm) => tm.id ?? 0)));
      }
    }
  }, [routeData?.listings, familyTerms.length]);

  // ---- corridor redraw ----
  const redrawCorridor = useCallback(async () => {
    if (!draft || !routeData) return;
    setRedrawing(true);
    setRedrawError(null);
    try {
      const res = await fetch(`/api/route-searches/${routeData.route.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius_km: draft.radius, corridor_km: draft.corridor }),
      });
      const data = await res.json();
      if (!res.ok) { setRedrawError(data.error || t('common.connectionIssueFailed')); return; }
      setRouteData(data);
      setDraft(null);
    } catch {
      setRedrawError(t('common.connectionIssueFailed'));
    } finally {
      setRedrawing(false);
    }
  }, [draft, routeData, t]);

  // ---- radius diagnosis ----
  const handleDiagnoseRadius = async () => {
    if (!effectiveFamilyId) return;
    setDiagnosing(true);
    setDiagnoseError(null);
    try {
      const res = await fetch(`/api/search-families/${effectiveFamilyId}/diagnose-radius`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setDiagnoseError(data.error || 'Diagnosis failed'); return; }
      setRadiusDiagnosis(data);
    } catch {
      setDiagnoseError('Network error while measuring radii');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleApplyRadius = async (newRadius: number) => {
    if (!effectiveFamilyId) return;
    setApplyingRadius(newRadius);
    setRadiusSuccessMsg(null);
    setDiagnoseError(null);
    try {
      const res = await fetch(`/api/search-families/${effectiveFamilyId}/radius`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius_km: newRadius }),
      });
      const data = await res.json();
      if (!res.ok) { setDiagnoseError(data.error || 'Failed to update radius'); return; }
      setRadiusSuccessMsg(t('searchFamily.radiusAppliedSuccess', { radius: newRadius }));
      if (data.family) setFamilyDetail(data.family);
      await fetchData();
    } catch {
      setDiagnoseError('Network error while updating radius');
    } finally {
      setApplyingRadius(null);
    }
  };

  // ---- derived values ----
  const termCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    if (!routeData?.listings) return counts;
    for (const l of routeData.listings) {
      if (l.matched_terms) {
        for (const mt of l.matched_terms) {
          counts[mt.id] = (counts[mt.id] || 0) + 1;
        }
      }
    }
    return counts;
  }, [routeData]);

  const handleToggleTerm = useCallback((termId: number) => {
    setSelectedTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId); else next.add(termId);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedTermIds(new Set(familyTerms.map((t) => t.id ?? 0)));
  }, [familyTerms]);

  const locationName = useMemo(() => {
    const extracted = extractLocationFromUrl(familyDetail?.base_url);
    return extracted || campaignName;
  }, [familyDetail?.base_url, campaignName]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted space-y-3">
        <div className="animate-spin w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full" />
        <p className="text-xs font-semibold">{t('common.loading')}</p>
      </div>
    );
  }

  if (error || !routeData) {
    return (
      <Card className="p-8 text-center space-y-4 max-w-xl mx-auto my-8 bg-bg-surface border-border-subtle">
        <p className="text-text-primary font-bold text-sm">
          {error === 'no_route' ? t('dashboard.noSearches') : t('common.connectionIssueFailed')}
        </p>
        <Button variant="primary" size="sm" onClick={fetchData}>{t('common.retry')}</Button>
      </Card>
    );
  }

  const { route, counts } = routeData;
  const hasCorridor = route.circles.length > 0;
  const isSearchFamily = (familyTerms.length > 0 && !hasCorridor) || !!effectiveFamilyId;
  const hasCrawled = familyDetail?.has_crawled ?? false;
  const currentRadius =
    radiusDiagnosis?.current_radius ??
    (familyDetail?.base_url ? extractRadiusFromUrl(familyDetail.base_url) : 30);

  // Resolve state from the single source of truth
  const searchPhase = resolveSearchState({
    hasCrawled,
    isScraping,
    listingCount: counts.total,
  });

  // ---- Screen actions — defined once, rendered by ScreenActionBar ----
  const actions: ScreenAction[] = [
    {
      id: 'fetch-listings',
      labelKey: 'routeResults.startScrape',
      icon: Search,
      handler: onStartScrape,
      disabled: isScraping,
      variant: 'action-emerald',
    },
    {
      id: 'corridor-settings',
      labelKey: 'corridor.editSettings',
      icon: SlidersHorizontal,
      handler: () => setDraft({ radius: route.radius_km, corridor: route.half_width_km }),
      // Only show when there is a real route with circles
      visible: hasCorridor && route.id > 0 && route.radius_km > 0,
      variant: 'secondary',
    },
    {
      id: 'family-settings',
      labelKey: 'searchFamily.editFamily',
      icon: SlidersHorizontal,
      handler: () => {
        if (onEditFamily) {
          onEditFamily();
        } else {
          setShowFamilyModal(true);
        }
      },
      // Only show when a search family exists. This is the ONE entry point.
      visible: isSearchFamily,
      variant: 'secondary',
    },
    {
      id: 'evaluate-ai',
      labelKey: 'routeResults.evaluateWithAi',
      icon: Sparkles,
      handler: onEvaluateWithAi,
      visible: searchPhase === 'has_results' && routeData.listings.some((l) => !l.llm_processed),
      variant: 'action-indigo',
    },
  ];

  // Whether to show the Listings/Map toggle: only if there are listings and a map to show
  const showMobileToggle = searchPhase === 'has_results' && hasCorridor;

  return (
    <div className="flex flex-col space-y-1.5 sm:space-y-4 animate-fadeIn w-full">
      {/* Top card: headline + action bar */}
      <Card className="p-2 sm:p-5 relative overflow-hidden bg-bg-surface border-border-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-1.5 sm:gap-4">
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {onBack && (
                <Button
                  variant="badge"
                  size="xs"
                  onClick={onBack}
                  className="px-2 py-0.5 text-2xs font-semibold shrink-0"
                  aria-label={t('common.backToCampaigns')}
                >
                  <span className="mr-0.5">←</span>
                  <span>{t('common.backToCampaigns')}</span>
                </Button>
              )}
              <h1 className="text-base sm:text-xl font-extrabold text-text-primary tracking-tight font-heading truncate">
                {searchPhase === 'has_results'
                  ? counts.total === 1
                    ? t('routeResults.listingsFoundSingular')
                    : t('routeResults.listingsFound', { count: counts.total })
                  : campaignName}
              </h1>
            </div>

            <div className="flex items-center gap-x-2 gap-y-0.5 text-2xs sm:text-xs text-text-muted whitespace-nowrap overflow-x-auto sm:whitespace-normal sm:flex-wrap">
              {searchPhase === 'has_results' && (
                <span className="shrink-0">
                  <strong className="font-semibold text-text-secondary">{campaignName}</strong>
                  {route.origin && route.destination ? `: ${route.origin} → ${route.destination}` : ''}
                </span>
              )}
              {searchPhase !== 'has_results' && route.origin && route.destination && (
                <span className="shrink-0">
                  {route.origin} → {route.destination}
                </span>
              )}
              {route.distance_km && route.duration_min ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-text-muted/60">·</span>
                  <Navigation className="w-3 h-3 text-brand-accent shrink-0 inline" />
                  {t('routeResults.routeStats', {
                    distance: route.distance_km,
                    duration: route.duration_min,
                  })}
                </span>
              ) : null}
              {hasCorridor ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-text-muted/60">·</span>
                  {t('routeResults.searchCirclesCount', { count: route.circles.length })}
                </span>
              ) : null}
            </div>
          </div>

          <ScreenActionBar actions={actions} />
        </div>
      </Card>

      {/* Corridor settings drawer */}
      {draft && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-bg-base/95 backdrop-blur-md p-4 lg:static lg:bg-transparent lg:overflow-visible lg:p-0 lg:z-auto animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label={t('corridor.editSettings')}
        >
          <Card className="p-4 sm:p-5 space-y-4 max-w-4xl mx-auto bg-bg-surface border-border-subtle shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-text-primary">{t('corridor.editSettings')}</h3>
                <p className="text-sm text-text-muted">{t('corridor.widthHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => { setDraft(null); setRedrawError(null); }}
                className="lg:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-text-primary rounded-xl"
                aria-label={t('corridor.closeSettings')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {redrawError && (
              <div className="p-3 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-sm font-semibold">
                {redrawError}
              </div>
            )}
            <CorridorPlanner
              baseUrl={route.name || ''}
              origin={route.origin || ''}
              destination={route.destination || ''}
              originName={route.origin || ''}
              destinationName={route.destination || ''}
              radiusKm={draft.radius}
              corridorKm={draft.corridor}
              onRadiusChange={(r) => setDraft((d) => (d ? { ...d, radius: r } : null))}
              onCorridorChange={(c) => setDraft((d) => (d ? { ...d, corridor: c } : null))}
              onCancel={() => { setDraft(null); setRedrawError(null); }}
              onCommit={redrawCorridor}
              committing={redrawing}
              commitLabel={t('corridor.commitChange')}
            />
          </Card>
        </div>
      )}

      {/* Scraper progress */}
      <ScraperProgressCard
        isScraping={isScraping}
        scrapingStatus={scrapingStatus}
        scrapingProgress={scrapingProgress}
        liveLogs={liveLogs}
        showLogConsole={showLogConsole}
        setShowLogConsole={setShowLogConsole || (() => {})}
      />

      {/* Mobile tab toggle — ONLY when there are results and a map */}
      {showMobileToggle && (
        <div className="lg:hidden flex p-0.5 rounded-xl bg-bg-input border border-border-subtle">
          <button
            type="button"
            onClick={() => setMobileTab('list')}
            className={`flex-1 min-h-[36px] py-1 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'list'
                ? 'bg-bg-surface text-text-primary shadow-sm border border-border-subtle'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>{t('routeResults.tabListings', { count: counts.total })}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={`flex-1 min-h-[36px] py-1 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'map'
                ? 'bg-bg-surface text-text-primary shadow-sm border border-border-subtle'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{t('routeResults.tabMap')}</span>
          </button>
        </div>
      )}

      {/* State routing — one state, one component */}
      {searchPhase === 'searching' && null /* ScraperProgressCard above handles feedback */}

      {searchPhase === 'never_searched' && (
        <EmptyStateView
          familyTerms={familyTerms}
          hasCorridor={hasCorridor}
          circles={route.circles}
          polyline={route.polyline}
          origin={route.origin}
          destination={route.destination}
          isScraping={isScraping}
          onStartScrape={onStartScrape}
          isDesktop={isDesktop}
        />
      )}

      {searchPhase === 'empty' && (
        isSearchFamily ? (
          <ZeroInRadiusView
            familyTerms={familyTerms}
            radiusDiagnosis={radiusDiagnosis}
            diagnosing={diagnosing}
            diagnoseError={diagnoseError}
            applyingRadius={applyingRadius}
            radiusSuccessMsg={radiusSuccessMsg}
            isScraping={isScraping}
            currentRadius={currentRadius}
            locationName={locationName}
            lastCrawledAt={familyDetail?.last_crawled_at}
            onDiagnose={handleDiagnoseRadius}
            onApplyRadius={handleApplyRadius}
            onStartScrape={onStartScrape}
          />
        ) : (
          <EmptyStateView
            familyTerms={familyTerms}
            hasCorridor={hasCorridor}
            circles={route.circles}
            polyline={route.polyline}
            origin={route.origin}
            destination={route.destination}
            isScraping={isScraping}
            onStartScrape={onStartScrape}
            isDesktop={isDesktop}
          />
        )
      )}

      {searchPhase === 'has_results' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Map column — desktop always, mobile only on map tab */}
          {(isDesktop || mobileTab === 'map') && hasCorridor && (
            <MapPane
              geometry={{
                polyline: route.polyline,
                circles: route.circles,
                origin: route.origin,
                destination: route.destination,
              }}
              listings={routeData.listings}
              selectedListingId={selectedListingId}
              onSelectListing={(id: string | null) => setSelectedListingId(id)}
              isDesktop={isDesktop}
            />
          )}

          {/* Listings column — desktop always, mobile only on list tab */}
          {(isDesktop || mobileTab === 'list') && (
            <div className={hasCorridor ? 'lg:col-span-6 xl:col-span-5' : 'lg:col-span-12'}>
              <ListingsPane
                listings={routeData.listings}
                familyTerms={familyTerms}
                selectedTermIds={selectedTermIds}
                termCounts={termCounts}
                onToggleTerm={handleToggleTerm}
                onToggleAll={handleToggleAll}
                selectedListingId={selectedListingId}
                onSelectListing={setSelectedListingId}
              />
            </div>
          )}
        </div>
      )}

      {/* Family editor modal */}
      {showFamilyModal && effectiveFamilyId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <SearchFamilyEditor
              campaignId={campaignId}
              familyId={effectiveFamilyId}
              onSave={() => { setShowFamilyModal(false); fetchData(); }}
              onCancel={() => setShowFamilyModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
