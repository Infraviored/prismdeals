/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import RouteCorridorMap from './RouteCorridorMap';
import type { RouteCircle, RouteListingGeo } from './RouteCorridorMap';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import {
  Search,
  Sparkles,
  Navigation,
  RefreshCw,
  Filter,
  SlidersHorizontal,
  ListFilter,
  MapPin,
  X,
  Layers,
  AlertCircle,
  Compass,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import ScraperProgressCard from './ScraperProgressCard';
import CorridorPlanner from './CorridorPlanner';
import SearchFamilyFilterBar from './SearchFamilyFilterBar';
import SearchFamilyEditor from './SearchFamilyEditor';
import type { ScraperProgressCardProps, SearchFamilyTerm, MatchedTerm, SearchFamily, RadiusDiagnosis } from '../types';

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

interface RouteResultsViewProps {
  campaignId?: number;
  familyId?: number;
  campaignName: string;
  onEvaluateWithAi: () => void;
  isScraping: boolean;
  onStartScrape: () => void;
  scrapingStatus?: string;
  scrapingProgress?: ScraperProgressCardProps['scrapingProgress'] | null;
  liveLogs?: string;
  showLogConsole?: boolean;
  setShowLogConsole?: (val: boolean) => void;
  onEditFamily?: () => void;
}

function formatLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  // Kleinanzeigen often prefixes locations with state: "Bayern - Landsberg (Lech)" -> "Landsberg (Lech)"
  const dashIndex = loc.indexOf(' - ');
  if (dashIndex !== -1) {
    return loc.slice(dashIndex + 3).trim();
  }
  return loc;
}

function extractRadiusFromUrl(url?: string): number {
  if (!url) return 30;
  const match = url.match(/r(\d+)(?:[#?]|$)/);
  return match ? parseInt(match[1], 10) : 30;
}

function formatLocationSlug(slug: string): string {
  const lowerWords = ['am', 'an', 'der', 'die', 'das', 'im', 'in', 'von', 'zu', 'und'];
  return slug
    .split('-')
    .map((w, idx) =>
      idx > 0 && lowerWords.includes(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

function extractLocationFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (seg.startsWith('k0') || seg.includes(':')) continue;
      if (seg.startsWith('s-')) {
        const afterS = seg.slice(2);
        if (['drucker-scanner', 'multimedia', 'elektronik'].includes(afterS)) continue;
        return formatLocationSlug(afterS);
      }
      if (!['drucker', 'scanner', 'audio', 'kamera', 'computer'].includes(seg)) {
        return formatLocationSlug(seg);
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export default function RouteResultsView({
  campaignId,
  familyId,
  campaignName,
  onEvaluateWithAi,
  isScraping,
  onStartScrape,
  scrapingStatus = '',
  scrapingProgress = null,
  liveLogs = '',
  showLogConsole = false,
  setShowLogConsole,
  onEditFamily,
}: RouteResultsViewProps) {
  const { t } = useTranslation();

  const [routeData, setRouteData] = useState<RouteCorridorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search Family terms and filter selection
  const [familyTerms, setFamilyTerms] = useState<SearchFamilyTerm[]>([]);
  const [selectedTermIds, setSelectedTermIds] = useState<Set<number>>(new Set());
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [effectiveFamilyId, setEffectiveFamilyId] = useState<number | null>(familyId ?? null);

  // Search Family empty-state diagnosis & radius adoption
  const [familyDetail, setFamilyDetail] = useState<SearchFamily | null>(null);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [applyingRadius, setApplyingRadius] = useState<number | null>(null);
  const [radiusSuccessMsg, setRadiusSuccessMsg] = useState<string | null>(null);
  const [showTermDetails, setShowTermDetails] = useState(false);

  useEffect(() => {
    if (familyId) setEffectiveFamilyId(familyId);
  }, [familyId]);

  // Filters and sorting
  const [draft, setDraft] = useState<{ radius: number; corridor: number } | null>(null);
  const [redrawing, setRedrawing] = useState(false);
  const [redrawError, setRedrawError] = useState<string | null>(null);
  const [selectedDetourMax, setSelectedDetourMax] = useState<'all' | '15' | '30' | '60'>('all');
  const [sortBy, setSortBy] = useState<'detour' | 'price'>('detour');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  // Responsive switch for screens below lg (1024px)
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Lock body scroll when mobile corridor settings drawer is open
  useEffect(() => {
    if (draft && !isDesktop) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [draft, isDesktop]);

  const fetchRouteData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let corridorData: RouteCorridorData | null = null;

      // 1. Fetch route corridor if campaignId is present
      if (campaignId) {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/route`);
          if (res.ok) {
            corridorData = await res.json();
          }
        } catch {
          // Corridor endpoint fetch failed or no route
        }
      }

      // 2. Fetch search family if familyId is provided or via campaignId
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
        } catch {
          // Ignore
        }
      } else if (targetFamilyId !== undefined) {
        setEffectiveFamilyId(targetFamilyId ?? null);
      }

      if (targetFamilyId) {
        try {
          const famDetailRes = await fetch(`/api/search-families/${targetFamilyId}`);
          if (famDetailRes.ok) {
            const famDetail = await famDetailRes.json();
            setFamilyDetail(famDetail);
            if (famDetail.radius_diagnosis) {
              setRadiusDiagnosis(famDetail.radius_diagnosis);
            }
            const termsList: SearchFamilyTerm[] = famDetail.terms || [];
            setFamilyTerms(termsList);
            setSelectedTermIds(new Set(termsList.map((tm) => tm.id ?? 0)));
          }

          const listingsRes = await fetch(`/api/search-families/${targetFamilyId}/listings`);
          if (listingsRes.ok) {
            const listingsData = await listingsRes.json();
            const rawListings = listingsData.listings || [];

            const matchedTermsMap = new Map<string, MatchedTerm[]>();
            for (const rl of rawListings) {
              if (rl.id && Array.isArray(rl.matched_terms)) {
                matchedTermsMap.set(String(rl.id), rl.matched_terms);
              }
            }

            if (corridorData) {
              // Campaign has both route corridor and search family: enrich corridor listings with matched_terms
              corridorData.listings = corridorData.listings.map((l) => ({
                ...l,
                matched_terms:
                  l.matched_terms && l.matched_terms.length > 0
                    ? l.matched_terms
                    : matchedTermsMap.get(String(l.id)) || [],
              }));
            } else {
              // Pure search family without route corridor
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
                  id: 0,
                  campaign_id: campaignId || 0,
                  name: campaignName,
                  base_url: '',
                  origin: '',
                  destination: '',
                  radius_km: 0,
                  half_width_km: 0,
                  distance_km: null,
                  duration_min: null,
                  polyline: [],
                  circles: [],
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
        } catch {
          // Ignore
        }
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
    if (!isScraping) {
      fetchRouteData();
    }
  }, [isScraping, fetchRouteData]);

  // If no family terms loaded via API, extract terms present in listings
  useEffect(() => {
    if (familyTerms.length === 0 && routeData?.listings) {
      const termMap = new Map<number, SearchFamilyTerm>();
      for (const l of routeData.listings) {
        if (l.matched_terms) {
          for (const mt of l.matched_terms) {
            if (!termMap.has(mt.id)) {
              termMap.set(mt.id, {
                id: mt.id,
                term: mt.term || mt.label,
                label: mt.label,
                enabled: true,
              });
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

  const redrawCorridor = useCallback(async () => {
    if (!draft || !routeData) return;
    setRedrawing(true);
    setRedrawError(null);
    try {
      const res = await fetch(`/api/route-searches/${routeData.route.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radius_km: draft.radius,
          corridor_km: draft.corridor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedrawError(data.error || t('common.connectionIssueFailed'));
        return;
      }
      setRouteData(data);
      setDraft(null);
    } catch {
      setRedrawError(t('common.connectionIssueFailed'));
    } finally {
      setRedrawing(false);
    }
  }, [draft, routeData, t]);

  const handleDiagnoseRadius = async () => {
    if (!effectiveFamilyId) return;
    setDiagnosing(true);
    setDiagnoseError(null);
    try {
      const res = await fetch(`/api/search-families/${effectiveFamilyId}/diagnose-radius`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setDiagnoseError(data.error || 'Diagnosis failed');
        return;
      }
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
      if (!res.ok) {
        setDiagnoseError(data.error || 'Failed to update radius');
        return;
      }
      setRadiusSuccessMsg(t('searchFamily.radiusAppliedSuccess', { radius: newRadius }));
      if (data.family) {
        setFamilyDetail(data.family);
      }
      await fetchRouteData();
    } catch {
      setDiagnoseError('Network error while updating radius');
    } finally {
      setApplyingRadius(null);
    }
  };

  const parsePrice = (priceStr: string): number => {
    if (!priceStr) return 999999;
    const match = priceStr.replace(/\./g, '').replace(/,/g, '.').match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 999999;
  };

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

  const handleToggleTermFilter = useCallback((termId: number) => {
    setSelectedTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  }, []);

  const handleToggleAllTerms = useCallback(() => {
    setSelectedTermIds(new Set(familyTerms.map((t) => t.id ?? 0)));
  }, [familyTerms]);

  const locationName = useMemo(() => {
    const extracted = extractLocationFromUrl(familyDetail?.base_url);
    if (extracted) return extracted;
    if (campaignName) return campaignName;
    return '';
  }, [familyDetail?.base_url, campaignName]);

  const filteredListings = useMemo(() => {
    if (!routeData) return [];
    let list = [...routeData.listings];

    // Filter by active search family models ("alle an bedeutet alles")
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
  }, [routeData, familyTerms, selectedTermIds, selectedDetourMax, searchQuery, sortBy]);

  const selectedListing = useMemo(() => {
    if (!selectedListingId) return null;
    return filteredListings.find((l) => l.id === selectedListingId) ?? null;
  }, [filteredListings, selectedListingId]);

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
        <Button variant="primary" size="sm" onClick={fetchRouteData}>
          {t('common.retry')}
        </Button>
      </Card>
    );
  }

  const { route, counts } = routeData;
  const hasListings = counts.total > 0;
  const isSearchFamily =
    (familyTerms.length > 0 && route.circles.length === 0) || !!effectiveFamilyId;
  const hasCrawled = familyDetail?.has_crawled ?? false;
  const currentRadius =
    radiusDiagnosis?.current_radius ??
    (familyDetail?.base_url ? extractRadiusFromUrl(familyDetail.base_url) : 30);

  return (
    <div className="flex flex-col space-y-4 animate-fadeIn w-full">
      {/* Top Corridor Overview Card */}
      <Card className="p-4 sm:p-5 relative overflow-hidden bg-bg-surface border-border-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            {/* Headline Fact */}
            <h1 className="text-lg sm:text-xl font-extrabold text-text-primary tracking-tight font-heading">
              {hasListings ? (
                counts.total === 1 ? (
                  t('routeResults.listingsFoundSingular')
                ) : (
                  t('routeResults.listingsFound', { count: counts.total })
                )
              ) : isSearchFamily && hasCrawled ? (
                t('searchFamily.zeroInRadiusHeadline', { radius: currentRadius })
              ) : (
                t('routeResults.noListingsFound')
              )}
            </h1>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-muted">
              <span>
                <strong className="font-semibold text-text-secondary">{campaignName}</strong>
                {route.origin && route.destination ? `: ${route.origin} → ${route.destination}` : ''}
              </span>
              {route.distance_km && route.duration_min ? (
                <span className="flex items-center gap-1">
                  <span className="text-text-muted/60">·</span>
                  <Navigation className="w-3 h-3 text-brand-accent shrink-0 inline" />
                  {t('routeResults.routeStats', {
                    distance: route.distance_km,
                    duration: route.duration_min,
                  })}
                </span>
              ) : null}
              {route.circles && route.circles.length > 0 ? (
                <span className="flex items-center gap-1">
                  <span className="text-text-muted/60">·</span>
                  {t('routeResults.searchCirclesCount', { count: route.circles.length })}
                </span>
              ) : null}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            <Button
              id="btn-corridor-scrape"
              variant="action-emerald"
              size="sm"
              onClick={onStartScrape}
              disabled={isScraping}
              className="py-2 px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {isScraping ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{t('routeResults.scrapingInProgress')}</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 shrink-0" />
                  <span>{t('routeResults.startScrape')}</span>
                </>
              )}
            </Button>

            {routeData.route.id > 0 && routeData.route.radius_km > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDraft({
                    radius: routeData.route.radius_km,
                    corridor: routeData.route.half_width_km,
                  })
                }
                className="py-2 px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span>{t('corridor.editSettings')}</span>
              </Button>
            )}

            {(familyTerms.length > 0 || effectiveFamilyId) && (
              <Button
                id="btn-edit-family"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowFamilyModal(true);
                  if (onEditFamily) onEditFamily();
                }}
                className="py-2 px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span>{t('searchFamily.editFamily')}</span>
              </Button>
            )}

            {hasListings && routeData.listings.some((l) => !l.llm_processed) && (
              <Button
                id="btn-evaluate-ai"
                variant="action-indigo"
                size="sm"
                onClick={onEvaluateWithAi}
                className="col-span-2 sm:col-span-1 py-2 px-3.5 font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{t('routeResults.evaluateWithAi')}</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Corridor Settings Drawer / Overlay */}
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
              baseUrl={routeData.route.name || ''}
              origin={routeData.route.origin || ''}
              destination={routeData.route.destination || ''}
              originName={routeData.route.origin || ''}
              destinationName={routeData.route.destination || ''}
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

      {/* Scraper Progress Tracker (if active) */}
      <ScraperProgressCard
        isScraping={isScraping}
        scrapingStatus={scrapingStatus}
        scrapingProgress={scrapingProgress}
        liveLogs={liveLogs || ''}
        showLogConsole={showLogConsole}
        setShowLogConsole={setShowLogConsole || (() => {})}
      />

      {/* Mobile Segmented Switch (below lg) */}
      <div className="lg:hidden flex p-1 rounded-xl bg-bg-input border border-border-subtle">
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex-1 min-h-[44px] py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            mobileTab === 'list'
              ? 'bg-bg-surface text-text-primary shadow-md border border-border-subtle'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span>{t('routeResults.tabListings', { count: filteredListings.length })}</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex-1 min-h-[44px] py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            mobileTab === 'map'
              ? 'bg-bg-surface text-text-primary shadow-md border border-border-subtle'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>{t('routeResults.tabMap')}</span>
        </button>
      </div>

      {/* Main Content Area */}
      {!hasListings ? (
        isSearchFamily && hasCrawled ? (
          /* Zero In Radius State ("Null im Radius") */
          <div className="max-w-2xl mx-auto w-full space-y-5" data-testid="zero-in-radius-view">
            {/* Diagnosis / Zero-in-radius Header Card */}
            <Card className="p-6 sm:p-7 border-border-subtle bg-bg-surface space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-status-amber/15 text-status-amber border border-status-amber/30 w-fit">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('searchFamily.zeroInRadiusBadge')}</span>
                </div>
                {familyDetail?.last_crawled_at && (
                  <span className="text-2xs font-mono text-text-muted">
                    {familyDetail.last_crawled_at}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-lg sm:text-xl font-black text-text-primary">
                  {t('searchFamily.zeroInRadiusHeadline', { radius: currentRadius })}
                </h3>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                  {t('searchFamily.zeroInRadiusExplanation', {
                    count: familyTerms.length,
                    radius: currentRadius,
                    location: locationName,
                  })}
                </p>
              </div>

              {/* List of checked models with 0-hit badges */}
              <div className="pt-2 border-t border-border-subtle/60 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">
                    {t('searchFamily.configuredModelsChecked', { count: familyTerms.length })}
                  </p>
                  {onEditFamily && (
                    <button
                      type="button"
                      onClick={() => setShowFamilyModal(true)}
                      className="text-2xs font-semibold text-brand-accent hover:underline"
                    >
                      {t('searchFamily.editFamily')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 scrollbar-thin">
                  {familyTerms.map((term) => {
                    const termDiag = radiusDiagnosis?.terms?.find(
                      (t) => t.id === term.id || t.term === term.term
                    );
                    const hitCount = termDiag?.counts?.[String(currentRadius)] ?? (term.listings ?? 0);
                    return (
                      <span
                        key={term.id ?? term.term}
                        data-testid="term-chip"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-input text-text-secondary border border-border-subtle"
                      >
                        <span className="truncate max-w-[200px]">{term.label || term.term}</span>
                        <span
                          className={`font-mono text-2xs px-1.5 py-0.5 rounded ${
                            hitCount > 0
                              ? 'bg-brand-accent/20 text-brand-accent font-bold'
                              : 'bg-bg-surface text-text-muted border border-border-subtle'
                          }`}
                        >
                          {hitCount}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Way Out / Radius Expansion Card */}
            <Card className="p-6 sm:p-7 border-border-brand/40 bg-gradient-to-br from-bg-surface to-bg-surface-hover space-y-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center text-brand-accent shrink-0 mt-0.5">
                  <Compass className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-text-primary">
                    {t('searchFamily.diagnosisCardTitle')}
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {t('searchFamily.diagnosisCardSubtitle')}
                  </p>
                </div>
              </div>

              {radiusSuccessMsg && (
                <div className="p-3.5 bg-status-emerald/10 border border-status-emerald/30 rounded-xl text-status-emerald text-xs font-semibold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{radiusSuccessMsg}</span>
                  </div>
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={onStartScrape}
                    disabled={isScraping}
                    className="font-bold shrink-0"
                  >
                    {t('searchFamily.scrapeNewRadiusNow', { radius: currentRadius })}
                  </Button>
                </div>
              )}

              {diagnoseError && (
                <div className="p-3 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-xs font-semibold">
                  {diagnoseError}
                </div>
              )}

              {/* Radius Options Grid or Diagnose Trigger */}
              {radiusDiagnosis ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {radiusDiagnosis.options.map((opt) => {
                      const isCurrent = opt.radius === currentRadius;
                      const isRecommended = !isCurrent && opt.radius === 200;
                      return (
                        <div
                          key={opt.radius}
                          data-testid={`radius-option-${opt.radius}`}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 transition-all ${
                            isCurrent
                              ? 'bg-bg-input/60 border-border-subtle opacity-75'
                              : isRecommended
                              ? 'bg-brand-accent/10 border-brand-accent shadow-sm'
                              : 'bg-bg-surface border-border-subtle hover:border-border-brand'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-text-primary">
                              {opt.radius} km
                            </span>
                            {isCurrent && (
                              <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border-subtle">
                                {t('searchFamily.currentRadiusTag')}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-extrabold text-text-primary">
                            {opt.count === 1
                              ? t('searchFamily.listingCountSingular')
                              : t('searchFamily.listingCount', { count: opt.count })}
                          </div>
                          {!isCurrent && (
                            <Button
                              variant={isRecommended ? 'primary' : 'secondary'}
                              size="xs"
                              disabled={applyingRadius !== null || isScraping}
                              onClick={() => handleApplyRadius(opt.radius)}
                              className="w-full text-2xs font-bold mt-1"
                            >
                              {applyingRadius === opt.radius
                                ? t('searchFamily.applyingRadius')
                                : t('searchFamily.selectRadiusOption', { radius: opt.radius })}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Primary Call To Action to expand to the largest tested radius */}
                  {radiusDiagnosis.options.some((o) => o.radius > currentRadius && o.count > 0) && (
                    <div className="pt-1">
                      {(() => {
                        const bestOpt = [...radiusDiagnosis.options]
                          .filter((o) => o.radius > currentRadius && o.count > 0)
                          .sort((a, b) => b.radius - a.radius)[0];
                        if (!bestOpt) return null;
                        return (
                          <Button
                            id="btn-apply-best-radius"
                            variant="primary"
                            size="md"
                            disabled={applyingRadius !== null || isScraping}
                            onClick={() => handleApplyRadius(bestOpt.radius)}
                            className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                          >
                            <span>
                              {applyingRadius === bestOpt.radius
                                ? t('searchFamily.applyingRadius')
                                : t('searchFamily.applyRadiusAction', {
                                    radius: bestOpt.radius,
                                    count: bestOpt.count,
                                  })}
                            </span>
                          </Button>
                        );
                      })()}
                    </div>
                  )}

                  {/* Model Details Toggle & Table */}
                  <div className="pt-2 border-t border-border-subtle/50 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-2xs">
                      <button
                        type="button"
                        onClick={() => setShowTermDetails((v) => !v)}
                        className="inline-flex items-center gap-1 font-semibold text-brand-accent hover:underline py-1"
                      >
                        {showTermDetails ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>{t('searchFamily.hideTermBreakdown')}</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>{t('searchFamily.showTermBreakdown')}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={diagnosing}
                        onClick={handleDiagnoseRadius}
                        className="inline-flex items-center gap-1 font-semibold text-text-muted hover:text-text-primary"
                      >
                        <RefreshCw className={`w-3 h-3 ${diagnosing ? 'animate-spin' : ''}`} />
                        <span>{t('searchFamily.reDiagnoseRadiusBtn')}</span>
                      </button>
                    </div>

                    {showTermDetails && radiusDiagnosis.terms && (
                      <div className="mt-1 border border-border-subtle rounded-xl overflow-x-auto bg-bg-surface text-2xs">
                        <table className="w-full text-left">
                          <thead className="bg-bg-input/80 border-b border-border-subtle text-text-muted font-bold">
                            <tr>
                              <th className="p-2">{t('searchFamily.termTableHeader')}</th>
                              {radiusDiagnosis.options.map((o) => (
                                <th key={o.radius} className="p-2 text-right">
                                  {o.radius} km
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle/40">
                            {radiusDiagnosis.terms.map((term) => (
                              <tr key={term.id ?? term.term} className="hover:bg-bg-surface-hover/50">
                                <td className="p-2 font-medium text-text-primary truncate max-w-[160px]">
                                  {term.label || term.term}
                                </td>
                                {radiusDiagnosis.options.map((o) => {
                                  const c = term.counts?.[String(o.radius)] ?? 0;
                                  return (
                                    <td
                                      key={o.radius}
                                      className={`p-2 text-right font-mono ${
                                        c > 0 ? 'text-brand-accent font-bold' : 'text-text-muted'
                                      }`}
                                    >
                                      {c}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t('searchFamily.diagnosePrompt')}
                  </p>
                  <Button
                    id="btn-diagnose-radius"
                    variant="primary"
                    size="md"
                    disabled={diagnosing}
                    onClick={handleDiagnoseRadius}
                    className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${diagnosing ? 'animate-spin' : ''}`} />
                    <span>
                      {diagnosing
                        ? t('searchFamily.diagnosingRadius')
                        : t('searchFamily.diagnoseRadiusBtn')}
                    </span>
                  </Button>
                </div>
              )}
            </Card>

            {/* Fallback actions */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onStartScrape}
                disabled={isScraping}
                className="text-xs font-bold"
              >
                {t('routeResults.emptyAction')}
              </Button>
              {onEditFamily && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => setShowFamilyModal(true)}
                  className="text-xs font-semibold"
                >
                  {t('searchFamily.editFamily')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className={`grid grid-cols-1 ${route.circles.length > 0 ? 'lg:grid-cols-12' : 'max-w-md mx-auto'} gap-5 items-start`}>
            {route.circles.length > 0 && (isDesktop || mobileTab === 'map') && (
              <div className={`rounded-2xl overflow-hidden ${isDesktop ? 'lg:col-span-7 h-[420px]' : 'h-[360px]'}`}>
                <RouteCorridorMap
                  polyline={route.polyline}
                  circles={route.circles}
                  listings={[]}
                  selectedListingId={null}
                  onSelectListing={() => {}}
                  originName={route.origin}
                  destinationName={route.destination}
                />
              </div>
            )}

            {(isDesktop || mobileTab === 'list' || route.circles.length === 0) && (
              <div className={route.circles.length > 0 && isDesktop ? 'lg:col-span-5' : 'w-full'}>
                <Card className="p-8 text-center space-y-4 border-border-subtle bg-bg-surface">
                  <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto text-brand-accent">
                    {familyTerms.length > 0 && route.circles.length === 0 ? (
                      <Layers className="w-6 h-6" />
                    ) : (
                      <Navigation className="w-6 h-6" />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold text-text-primary">
                      {familyTerms.length > 0 && route.circles.length === 0
                        ? t('searchFamily.emptyHeadline')
                        : t('routeResults.emptyHeadline')}
                    </h3>
                    <p className="text-xs text-text-muted leading-relaxed font-semibold">
                      {familyTerms.length > 0 && route.circles.length === 0
                        ? t('searchFamily.emptyExplanation', { count: familyTerms.length })
                        : t('routeResults.emptyExplanation', { count: route.circles.length })}
                    </p>
                  </div>

                  {/* Show list of configured models so user can see them immediately */}
                  {familyTerms.length > 0 && (
                    <div className="pt-2 pb-1 text-left">
                      <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-2 text-center">
                        {t('searchFamily.configuredModels', { count: familyTerms.length })}
                      </p>
                      <div className="flex flex-wrap gap-1.5 justify-center max-h-36 overflow-y-auto p-1">
                        {familyTerms.map((term) => (
                          <span
                            key={term.id ?? term.term}
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-base/60 text-text-secondary border border-border-subtle"
                          >
                            {term.label || term.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3">
                    <Button
                      id="btn-empty-scrape"
                      variant="primary"
                      size="md"
                      onClick={onStartScrape}
                      disabled={isScraping}
                      className="w-full py-3 text-base font-bold"
                    >
                      {isScraping
                        ? t('routeResults.scrapingInProgress')
                        : familyTerms.length > 0 && route.circles.length === 0
                          ? t('searchFamily.emptyAction')
                          : t('routeResults.emptyAction')}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )
      ) : (
        /* Populated Results View */
        <div className="space-y-4">
          {/* Search Family Model Filter Bar */}
          {(isDesktop || mobileTab === 'list') && familyTerms.length > 0 && (
            <SearchFamilyFilterBar
              terms={familyTerms}
              selectedTermIds={selectedTermIds}
              termCounts={termCounts}
              totalCount={routeData.listings.length}
              onToggleTerm={handleToggleTermFilter}
              onToggleAll={handleToggleAllTerms}
            />
          )}

          {/* Filter & Sorting Controls: on desktop, or on mobile when in list tab */}
          {(isDesktop || mobileTab === 'list') && (
            <Card className="p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-bg-surface border-border-subtle">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs text-text-muted font-bold uppercase tracking-wider flex items-center gap-1 mr-1">
                  <Filter className="w-3 h-3 text-text-muted" />
                  {t('routeResults.detourFilterLabel')}:
                </span>

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
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center justify-center ${
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

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Input
                    type="text"
                    placeholder={t('routeResults.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-xs py-1.5 bg-bg-input border-border-subtle"
                  />
                </div>

                <div className="w-full sm:w-44">
                  <Select
                    value={sortBy}
                    onChange={(val) => setSortBy(val as 'detour' | 'price')}
                    options={[
                      { value: 'detour', label: t('routeResults.sortByDetour') },
                      { value: 'price', label: t('routeResults.sortByPrice') },
                    ]}
                    className="text-xs py-1.5 bg-bg-input border-border-subtle"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Interactive Split Layout: Map & Listings List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Map Column: Mounted on desktop OR when mobileTab === 'map' */}
            {(isDesktop || mobileTab === 'map') && (
              <div
                className={`w-full relative ${
                  isDesktop
                    ? 'lg:col-span-6 xl:col-span-7 h-[calc(100vh-250px)] lg:sticky lg:top-20 z-10'
                    : 'h-[calc(100vh-280px)] min-h-[460px]'
                }`}
              >
                <RouteCorridorMap
                  polyline={route.polyline}
                  circles={route.circles}
                  listings={filteredListings}
                  selectedListingId={selectedListingId}
                  onSelectListing={setSelectedListingId}
                  originName={route.origin}
                  destinationName={route.destination}
                />

                {/* Floating Card for Selected Listing on Mobile Map View */}
                {!isDesktop && selectedListing && (
                  <div className="absolute bottom-4 left-3 right-3 z-[500] animate-fadeIn">
                    <div className="bg-bg-surface/95 backdrop-blur-md p-3 rounded-2xl border border-border-brand shadow-2xl flex items-center gap-3">
                      {selectedListing.images && selectedListing.images.length > 0 ? (
                        <img
                          src={selectedListing.images[0]}
                          alt={selectedListing.title}
                          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border-subtle bg-bg-input"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl shrink-0 border border-border-subtle bg-bg-input flex items-center justify-center text-text-muted text-2xs">
                          {t('common.noImage')}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-extrabold text-brand-accent font-mono">
                            {selectedListing.detour_min !== null
                              ? selectedListing.detour_min < 1
                                ? t('routeResults.onRouteShort')
                                : `+${Math.round(selectedListing.detour_min)}m`
                              : ''}
                          </span>
                          <span className="text-xs font-semibold text-text-secondary font-mono">
                            {selectedListing.price}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-text-primary line-clamp-2 mt-0.5 leading-snug">
                          {selectedListing.title}
                        </h4>
                        {selectedListing.matched_terms && selectedListing.matched_terms.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedListing.matched_terms.map((mt) => (
                              <span
                                key={mt.id}
                                className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent border border-border-brand truncate max-w-[160px]"
                              >
                                {mt.label}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-2xs text-text-muted truncate mt-0.5">
                          {formatLocation(selectedListing.location)}
                          {selectedListing.offroute_km !== null ? ` · ${selectedListing.offroute_km.toFixed(1)} km` : ''}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedListingId(null);
                          }}
                          className="p-1 text-text-muted hover:text-text-primary rounded-lg"
                          aria-label={t('routeResults.closeCard')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <a
                          href={selectedListing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 text-2xs font-bold rounded-lg bg-brand-accent text-white shadow hover:opacity-90 transition-opacity whitespace-nowrap"
                        >
                          {t('routeResults.viewOnPlatform')} ↗
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Listings Column: Mounted on desktop OR when mobileTab === 'list' */}
            {(isDesktop || mobileTab === 'list') && (
              <div className="lg:col-span-6 xl:col-span-5 space-y-2.5 max-h-[calc(100vh-250px)] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
                {filteredListings.length === 0 ? (
                  <div className="bg-bg-surface border border-dashed border-border-subtle rounded-2xl p-10 text-center space-y-2">
                    <p className="text-xs font-semibold text-text-muted">
                      {t('routeResults.noFilterMatches')}
                    </p>
                    <Button
                      variant="badge"
                      size="xs"
                      onClick={() => {
                        setSelectedDetourMax('all');
                        setSearchQuery('');
                      }}
                    >
                      {t('routeResults.resetFilters')}
                    </Button>
                  </div>
                ) : (
                  filteredListings.map((l) => {
                    const isSelected = selectedListingId === l.id;
                    const firstImg = l.images && l.images.length > 0 ? l.images[0] : null;

                    return (
                      <a
                        key={l.id}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setSelectedListingId(l.id)}
                        className={`group min-h-[76px] p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center gap-3 cursor-pointer no-underline ${
                          isSelected
                            ? 'bg-bg-surface-hover border-border-brand ring-1 ring-border-brand shadow-lg'
                            : 'bg-bg-surface border-border-subtle hover:bg-bg-surface-hover hover:border-border-brand'
                        }`}
                      >
                        {/* 56px Thumbnail */}
                        {firstImg ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-border-subtle bg-bg-input">
                            <img
                              src={firstImg}
                              alt={l.title}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl shrink-0 border border-border-subtle bg-bg-input flex items-center justify-center text-text-muted font-mono text-2xs">
                            {t('common.noImage')}
                          </div>
                        )}

                        {/* Details: Title & Location */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                          <h3 className="text-sm font-semibold text-text-primary line-clamp-2 group-hover:text-brand-accent transition-colors leading-snug break-words">
                            {l.title}
                          </h3>

                          {l.matched_terms && l.matched_terms.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {l.matched_terms.map((mt) => (
                                <span
                                  key={mt.id}
                                  data-testid="matched-term-badge"
                                  className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent border border-border-brand truncate max-w-[200px]"
                                  title={mt.label}
                                >
                                  {mt.label}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 text-2xs text-text-muted truncate mt-1">
                            <span className="truncate">{formatLocation(l.location)}</span>
                            {l.offroute_km !== null && (
                              <span className="font-mono text-text-muted shrink-0">
                                · {l.offroute_km.toFixed(1)} km
                              </span>
                            )}
                            {l.llm_processed && l.niceness_score !== null && (
                              <span className="font-mono font-bold text-text-secondary bg-bg-input border border-border-subtle px-1.5 py-0.5 rounded text-2xs shrink-0 ml-1">
                                ★ {l.niceness_score}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cost Column: Detour above Price */}
                        <div className="shrink-0 flex flex-col items-end justify-center text-right pl-1 min-w-[52px]">
                          {l.detour_min !== null ? (
                            l.detour_min < 1 ? (
                              <span className="text-xs font-bold text-brand-accent font-mono leading-none">
                                {t('routeResults.onRouteShort')}
                              </span>
                            ) : (
                              <span className="text-base font-extrabold text-brand-accent font-mono tracking-tight leading-none">
                                +{Math.round(l.detour_min)}m
                              </span>
                            )
                          ) : (
                            <span className="text-2xs text-text-muted font-mono leading-none">
                              {l.geo_status === 'too_far'
                                ? t('routeResults.offCorridor')
                                : l.geo_status === 'failed'
                                  ? t('routeResults.detourUnknown')
                                  : t('routeResults.noCoordinates')}
                            </span>
                          )}

                          <span className="text-sm font-semibold text-text-secondary font-mono mt-1 leading-none">
                            {l.price?.trim() || t('routeResults.noPrice')}
                          </span>
                        </div>
                      </a>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Family Editor Modal */}
      {showFamilyModal && effectiveFamilyId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <SearchFamilyEditor
              campaignId={campaignId}
              familyId={effectiveFamilyId}
              onSave={() => {
                setShowFamilyModal(false);
                fetchRouteData();
              }}
              onCancel={() => setShowFamilyModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
