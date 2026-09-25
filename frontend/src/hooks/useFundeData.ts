import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Campaign, SearchFamilyTerm, RouteListingGeo, RadiusDiagnosis } from '../types';
import type { RowListing } from '../components/surface';
import type { CampaignOverviewData } from '../screens/FundeAside';
import { toRowListing, type ApiListing } from '../utils/toRowListing';


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

export interface UseFundeDataOptions {
  campaign: Campaign | undefined;
  isScraping?: boolean;
  initialTab?: FundeTabKey;
}

export function useFundeData({ campaign, isScraping, initialTab = 'fit' }: UseFundeDataOptions) {
  const [listings, setListings] = useState<RowListing[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Tab & filters
  const [tab, setTab] = useState<FundeTabKey>(() => {
    try {
      const match = window.location.hash.match(/[?&]tab=(fit|unclear|no|all)/);
      if (match) return match[1] as FundeTabKey;
      const searchMatch = window.location.search.match(/[?&]tab=(fit|unclear|no|all)/);
      if (searchMatch) return searchMatch[1] as FundeTabKey;
    } catch {
      /* ignore */
    }
    return initialTab;
  });
  const [sort, setSort] = useState<FundeSort>('price_asc');
  const [maxDetour, setMaxDetour] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(30);
  const [termId, setTermId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dealsOnly, setDealsOnly] = useState<boolean>(false);
  const [fitOnly, setFitOnly] = useState<boolean>(false);

  // Route & family metadata & overview
  const [overview, setOverview] = useState<CampaignOverviewData | null>(null);
  const [route, setRoute] = useState<RouteShape | null>(null);
  const [familyTerms, setFamilyTerms] = useState<SearchFamilyTerm[]>([]);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);

  const campaignId = campaign?.id ?? null;
  const routeId = campaign?.route_id ?? null;
  const familyId = campaign?.family_id ?? null;

  // Load family metadata
  useEffect(() => {
    if (!familyId) {
      setFamilyTerms([]);
      setRadiusDiagnosis(null);
      return;
    }
    fetch(`/api/search-families/${familyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (Array.isArray(data.terms)) setFamilyTerms(data.terms);
          if (data.radius_diagnosis) setRadiusDiagnosis(data.radius_diagnosis);
        }
      })
      .catch(() => {});
  }, [familyId]);

  // Fetch campaign overview
  const fetchOverview = useCallback(async () => {
    if (!campaignId) {
      setOverview(null);
      return;
    }
    try {
      const qp = new URLSearchParams();
      if (searchQuery.trim()) qp.set('q', searchQuery.trim());
      if (dealsOnly) qp.set('dealsOnly', '1');
      if (termId !== null) qp.set('term', String(termId));
      if (maxDetour !== null) qp.set('maxDetour', String(maxDetour));

      const res = await fetch(`/api/campaigns/${campaignId}/overview?${qp.toString()}`, {
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch {
      // overview is optional progressive enhancement
    }
  }, [campaignId, searchQuery, dealsOnly, termId, maxDetour]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // A search that ran and found nothing asks at once how far out there would
  // be something. Without it the buyer pressed "Funde abrufen" again and again
  // and watched nothing change -- the printer family, 13 exact model names
  // within 30 km, is genuinely empty, and only a wider net says so usefully.
  // The overview counts with the filters on; empty under a filter is not an
  // empty search, and must not start a probe of Kleinanzeigen.
  const filtered = Boolean(searchQuery.trim()) || dealsOnly || termId !== null || maxDetour !== null;
  const searchedEmpty =
    Boolean(familyId) && !isScraping && !filtered && overview?.pots?.all === 0 && Boolean(overview?.last_crawled_at);
  // Once per family and crawl. Retrying whenever an answer came back without
  // options restarted the probe in a loop, and the hint flickered ten times a
  // second.
  const diagnosedFor = useRef<string | null>(null);
  const diagnosisKey = familyId ? `${familyId}@${overview?.last_crawled_at ?? ''}` : null;
  useEffect(() => {
    if (!searchedEmpty || radiusDiagnosis || diagnosing || !diagnosisKey) return;
    if (diagnosedFor.current === diagnosisKey) return;
    diagnosedFor.current = diagnosisKey;
    setDiagnosing(true);
    fetch(`/api/search-families/${familyId}/diagnose-radius`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.options)) setRadiusDiagnosis(data);
      })
      .catch(() => {})
      .finally(() => setDiagnosing(false));
  }, [searchedEmpty, familyId, radiusDiagnosis, diagnosing, diagnosisKey]);

  const applyRadius = useCallback(
    async (km: number) => {
      if (!familyId) return false;
      const res = await fetch(`/api/search-families/${familyId}/radius`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius: km }),
      }).catch(() => null);
      if (res?.ok) setRadiusDiagnosis(null);
      return Boolean(res?.ok);
    },
    [familyId]
  );

  const activeFetchController = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (targetOffset: number, append: boolean = false) => {
      if (!campaignId) {
        setListings([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      if (activeFetchController.current) {
        activeFetchController.current.abort();
      }
      const controller = new AbortController();
      activeFetchController.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          limit: String(limit),
          offset: String(targetOffset),
        });
        queryParams.set('sort', sort);
        if (maxDetour !== null) queryParams.set('maxDetour', String(maxDetour));
        if (termId !== null) queryParams.set('term', String(termId));
        if (searchQuery.trim()) queryParams.set('q', searchQuery.trim());
        if (dealsOnly) queryParams.set('dealsOnly', '1');

        // Tab maps to verdict filter
        if (tab && tab !== 'all') {
          queryParams.set('verdict', tab);
        } else if (fitOnly) {
          queryParams.set('fitOnly', '1');
        }

        // The family endpoint first, corridor or not: it knows the terms,
        // the distance and every order. The corridor's own endpoint is for
        // routes planned without a hunt.
        let url = '';
        if (familyId) {
          url = `/api/search-families/${familyId}/listings?${queryParams.toString()}`;
        } else if (routeId) {
          url = `/api/campaigns/${campaignId}/route?${queryParams.toString()}`;
        } else {
          queryParams.set('campaign_id', String(campaignId));
          url = `/api/listings?${queryParams.toString()}`;
        }

        const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        let rawListings: RouteListingGeo[] = [];
        let fetchedTotal = 0;

        if (Array.isArray(data)) {
          rawListings = data as RouteListingGeo[];
          fetchedTotal = data.length;
        } else if (data && Array.isArray(data.listings)) {
          rawListings = data.listings as RouteListingGeo[];
          fetchedTotal = typeof data.total === 'number' ? data.total : (data.counts?.total ?? rawListings.length);
          // The first page carries the corridor and every pin of the tab.
          if (targetOffset === 0) {
            setRoute(data.route || null);
            setMapPoints(
              (data.points || []).map((p: MapPoint & { id: string | number }) => ({ ...p, id: String(p.id) }))
            );
          }
        }

        const mapped: RowListing[] = rawListings.map((l) => toRowListing(l as ApiListing));

        setTotal(fetchedTotal);
        setOffset(targetOffset);
        if (append) setListings((prev) => [...prev, ...mapped]);
        else setListings(mapped);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load listings');
        }
      } finally {
        // Only the request still wanted ends the loading: an aborted one
        // cleared it while its replacement ran, and "Mehr laden" appended the
        // old order's page two to the new order's page one.
        if (activeFetchController.current === controller) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [campaignId, routeId, familyId, limit, sort, maxDetour, termId, searchQuery, dealsOnly, tab, fitOnly]
  );

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const wasScraping = useRef(isScraping);
  useEffect(() => {
    if (wasScraping.current && !isScraping) {
      fetchPage(0, false);
      fetchOverview();
    }
    wasScraping.current = isScraping;
  }, [isScraping, fetchPage, fetchOverview]);

  const reload = useCallback(() => {
    fetchPage(0, false);
    fetchOverview();
  }, [fetchPage, fetchOverview]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (listings.length < total) {
      fetchPage(offset + limit, true);
    }
  }, [loading, loadingMore, listings.length, total, offset, limit, fetchPage]);

  // Best deal or cheapest fitting listing. Not the comparison's rank 1: it
  // ranks quality without price, and under "Günstigstes passendes Angebot"
  // it put the most expensive R1 on top.
  const bestListing = useMemo(() => {
    const fits = listings
      .filter((l) => l.fit?.verdict === 'fit')
      .sort((a, b) => {
        const pa = typeof a.price_eur === 'number' ? a.price_eur : 999999;
        const pb = typeof b.price_eur === 'number' ? b.price_eur : 999999;
        return pa - pb;
      });
    return fits.find((l) => l.is_deal) || fits[0] || listings.find((l) => l.is_deal) || null;
  }, [listings]);

  return {
    listings,
    total,
    rawTotal: total,
    loading,
    loadingMore,
    error,
    hasMore: listings.length < total,
    loadMore,
    reload,
    // Tab control
    tab,
    setTab,
    overview,
    bestListing,
    // Filter controls
    sort,
    setSort,
    maxDetour,
    setMaxDetour,
    radius,
    setRadius,
    termId,
    setTermId,
    searchQuery,
    setSearchQuery,
    dealsOnly,
    setDealsOnly,
    fitOnly,
    setFitOnly,
    // Corridor / Family
    route,
    mapPoints,
    familyTerms,
    radiusDiagnosis,
    diagnosing,
    applyRadius,
    filtered,
    resetFilters: () => {
      setSearchQuery('');
      setDealsOnly(false);
      setTermId(null);
      setMaxDetour(null);
    },
  };
}
