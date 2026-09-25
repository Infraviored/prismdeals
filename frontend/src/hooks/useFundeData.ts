import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RouteListingGeo, RadiusDiagnosis } from '../types';
import type { HuntOverview, VerdictCounts } from '../types/hunt';
import type { RowListing } from '../components/surface';
import { toRowListing, type ApiListing } from '../utils/toRowListing';
import { api } from '../utils/api';

export type FundeTabKey = 'fit' | 'unclear' | 'no' | 'all';
export type FundeSort = 'price_asc' | 'near' | 'score';

/** One pin: every listing of the tab, not only the loaded page. */
export interface MapPoint extends RouteListingGeo {
  distance_km?: number | null;
}

/** A corridor as the map and the corridor sheet need it. */
export interface RouteShape {
  origin: string;
  destination: string;
  half_width_km: number;
  polyline: [number, number][];
}

interface ListingsPage {
  total: number;
  counts: VerdictCounts;
  route: RouteShape | null;
  points?: Array<MapPoint & { id: string | number }>;
  listings: ApiListing[];
}

export interface UseFundeDataOptions {
  huntId: number | null;
  /** The hunt's search family: only for asking how far out there would be more. */
  familyId?: number | null;
  isScraping?: boolean;
  initialTab?: FundeTabKey;
}

const LIMIT = 50;

function tabFromAddress(fallback: FundeTabKey): FundeTabKey {
  const match = (window.location.hash + window.location.search).match(/[?&]tab=(fit|unclear|no|all)/);
  return match ? (match[1] as FundeTabKey) : fallback;
}

/** A hunt's offers with the verdicts computed on read, and its overview. */
export function useFundeData({ huntId, familyId = null, isScraping, initialTab = 'fit' }: UseFundeDataOptions) {
  const [listings, setListings] = useState<RowListing[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<VerdictCounts | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<FundeTabKey>(() => tabFromAddress(initialTab));
  const [sort, setSort] = useState<FundeSort>('price_asc');
  const [maxDetour, setMaxDetour] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dealsOnly, setDealsOnly] = useState(false);

  const [overview, setOverview] = useState<HuntOverview | null>(null);
  const [route, setRoute] = useState<RouteShape | null>(null);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const fetchOverview = useCallback(async () => {
    if (!huntId) return setOverview(null);
    try {
      setOverview(await api<HuntOverview>(`/api/hunts/${huntId}/overview`));
    } catch {
      // The aside and the freshness line go without it.
    }
  }, [huntId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const filtered = Boolean(searchQuery.trim()) || dealsOnly || targetId !== null || maxDetour !== null;

  // A search that ran and found nothing asks at once how far out there would
  // be something. Once per family and crawl; under a filter it is not empty.
  const searchedEmpty =
    Boolean(familyId) && !isScraping && !filtered && overview?.pots.all === 0 && Boolean(overview?.last_crawled_at);
  const diagnosedFor = useRef<string | null>(null);
  const diagnosisKey = familyId ? `${familyId}@${overview?.last_crawled_at ?? ''}` : null;
  useEffect(() => {
    if (!searchedEmpty || radiusDiagnosis || diagnosing || !diagnosisKey) return;
    if (diagnosedFor.current === diagnosisKey) return;
    diagnosedFor.current = diagnosisKey;
    setDiagnosing(true);
    api<RadiusDiagnosis>(`/api/search-families/${familyId}/diagnose-radius`, { method: 'POST', body: { refresh: true } })
      .then((data) => Array.isArray(data.options) && setRadiusDiagnosis(data))
      .catch(() => {})
      .finally(() => setDiagnosing(false));
  }, [searchedEmpty, familyId, radiusDiagnosis, diagnosing, diagnosisKey]);

  const active = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (at: number, append = false) => {
      if (!huntId) {
        setListings([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(at), sort });
      if (tab !== 'all') params.set('verdict', tab);
      if (maxDetour !== null) params.set('maxDetour', String(maxDetour));
      if (targetId !== null) params.set('target', String(targetId));
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (dealsOnly) params.set('dealsOnly', '1');

      try {
        const data = await api<ListingsPage>(`/api/hunts/${huntId}/listings?${params}`, { signal: controller.signal });
        const mapped = data.listings.map(toRowListing);
        setTotal(data.total);
        setCounts(data.counts);
        setOffset(at);
        // The first page carries the corridor and every pin of the tab.
        if (at === 0) {
          setRoute(data.route || null);
          setMapPoints((data.points || []).map((p) => ({ ...p, id: String(p.id) })));
        }
        setListings((prev) => (append ? [...prev, ...mapped] : mapped));
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') setError(err.message);
      } finally {
        // Only the request still wanted ends the loading: an aborted one
        // cleared it while its replacement ran.
        if (active.current === controller) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [huntId, sort, tab, maxDetour, targetId, searchQuery, dealsOnly]
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const reload = useCallback(() => {
    fetchPage(0);
    fetchOverview();
  }, [fetchPage, fetchOverview]);

  const wasScraping = useRef(isScraping);
  useEffect(() => {
    if (wasScraping.current && !isScraping) reload();
    wasScraping.current = isScraping;
  }, [isScraping, reload]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || listings.length >= total) return;
    fetchPage(offset + LIMIT, true);
  }, [loading, loadingMore, listings.length, total, offset, fetchPage]);

  // Best deal or cheapest fitting listing. Not the comparison's rank 1: it
  // ranks quality without price.
  const bestListing = useMemo(() => {
    const price = (l: RowListing) => (typeof l.price_eur === 'number' ? l.price_eur : Infinity);
    const fits = listings.filter((l) => l.fit?.verdict === 'fit').sort((a, b) => price(a) - price(b));
    return fits.find((l) => l.is_deal) || fits[0] || null;
  }, [listings]);

  return {
    listings,
    total,
    counts,
    loading,
    loadingMore,
    error,
    hasMore: listings.length < total,
    loadMore,
    reload,
    tab,
    setTab,
    overview,
    bestListing,
    sort,
    setSort,
    maxDetour,
    setMaxDetour,
    targetId,
    setTargetId,
    searchQuery,
    setSearchQuery,
    dealsOnly,
    setDealsOnly,
    route,
    mapPoints,
    radiusDiagnosis,
    clearRadiusDiagnosis: () => setRadiusDiagnosis(null),
    diagnosing,
    filtered,
    resetFilters: () => {
      setSearchQuery('');
      setDealsOnly(false);
      setTargetId(null);
      setMaxDetour(null);
    },
  };
}
