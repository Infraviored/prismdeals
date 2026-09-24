import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Campaign, SearchFamilyTerm, RouteCorridorData, RouteListingGeo, RadiusDiagnosis } from '../types';
import type { RowListing } from '../components/surface';
import type { CampaignOverviewData } from '../screens/FundeAside';

interface ApiListing {
  id: string | number;
  title?: string | null;
  price?: string | null;
  price_eur?: number | null;
  location?: string | null;
  url?: string | null;
  images?: string[] | null;
  detour_min?: number | null;
  offroute_km?: number | null;
  lat?: number | null;
  lon?: number | null;
  geo_status?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_deal?: boolean;
  price_delta_eur?: number | null;
  price_history?: RowListing['price_history'];
  fit?: RowListing['fit'];
  matched_terms?: RowListing['matched_terms'];
  niceness_score?: number | null;
  score?: RowListing['score'];
  score_parts?: RowListing['score_parts'];
  market_median?: RowListing['market_median'];
  details?: RowListing['details'];
  detailed_description?: string | null;
  short_description?: string | null;
  description?: string | null;
  summary?: string | null;
  reference_comparison?: RowListing['reference_comparison'];
  extracted_facts?: {
    summary?: string | null;
    reference_comparison?: RowListing['reference_comparison'];
  } | null;
  rank?: number | null;
  rank_of?: number | null;
  rank_reason?: string | null;
  seller_questions?: string[] | null;
  uncertain?: boolean;
  same_as?: string[] | null;
}

export type FundeTabKey = 'fit' | 'unclear' | 'no' | 'all';

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
  const [sort, setSort] = useState<string>('price_asc');
  const [maxDetour, setMaxDetour] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(30);
  const [termId, setTermId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dealsOnly, setDealsOnly] = useState<boolean>(false);
  const [fitOnly, setFitOnly] = useState<boolean>(false);

  // Route & family metadata & overview
  const [overview, setOverview] = useState<CampaignOverviewData | null>(null);
  const [routeData, setRouteData] = useState<RouteCorridorData | null>(null);
  const [familyTerms, setFamilyTerms] = useState<SearchFamilyTerm[]>([]);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);
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
  const searchedEmpty =
    Boolean(familyId) && !isScraping && overview?.pots?.all === 0 && Boolean(overview?.last_crawled_at);
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
        if (sort && sort !== 'default') queryParams.set('sort', sort);
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

        let url = '';
        if (routeId) {
          url = `/api/campaigns/${campaignId}/route?${queryParams.toString()}`;
        } else if (familyId) {
          url = `/api/search-families/${familyId}/listings?${queryParams.toString()}`;
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
          if (data.route) setRouteData(data as RouteCorridorData);
        }

        const mapped: RowListing[] = rawListings.map((l: ApiListing) => ({
          id: String(l.id),
          title: l.title || '',
          price: l.price,
          price_eur: typeof l.price_eur === 'number' ? l.price_eur : null,
          location: l.location || null,
          images: Array.isArray(l.images) ? l.images : [],
          image_url: Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : null,
          detour_min: typeof l.detour_min === 'number' ? l.detour_min : null,
          offroute_km: typeof l.offroute_km === 'number' ? l.offroute_km : null,
          first_seen_at: l.first_seen_at || l.last_seen_at || null,
          last_seen_at: l.last_seen_at || null,
          is_deal: !!l.is_deal,
          price_delta_eur: typeof l.price_delta_eur === 'number' ? l.price_delta_eur : null,
          fit: l.fit || null,
          price_history: Array.isArray(l.price_history) ? l.price_history : null,
          status: l.geo_status || null,
          url: l.url || undefined,
          matched_terms: Array.isArray(l.matched_terms) ? l.matched_terms : [],
          lat: typeof l.lat === 'number' ? l.lat : null,
          lon: typeof l.lon === 'number' ? l.lon : null,
          description: l.detailed_description || l.short_description || l.description || null,
          summary: l.summary || l.extracted_facts?.summary || null,
          niceness_score: typeof l.niceness_score === 'number' ? l.niceness_score : null,
          // Dropping these here is how the percent vanished from every row
          // while the API sent it and the sheet showed it.
          score: typeof l.score === 'number' ? l.score : null,
          score_parts: l.score_parts || null,
          market_median: typeof l.market_median === 'number' ? l.market_median : null,
          details: l.details || null,
          reference_comparison: l.reference_comparison || l.extracted_facts?.reference_comparison || null,
          rank: typeof l.rank === 'number' ? l.rank : null,
          rank_of: typeof l.rank_of === 'number' ? l.rank_of : null,
          rank_reason: l.rank_reason || null,
          seller_questions: Array.isArray(l.seller_questions) ? l.seller_questions : null,
          uncertain: !!l.uncertain,
          same_as: Array.isArray(l.same_as) ? l.same_as : null,
        }));

        setTotal(fetchedTotal);
        setOffset(targetOffset);
        if (append) setListings((prev) => [...prev, ...mapped]);
        else setListings(mapped);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load listings');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
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

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (listings.length < total) {
      fetchPage(offset + limit, true);
    }
  }, [loading, loadingMore, listings.length, total, offset, limit, fetchPage]);

  // Best deal or cheapest fitting listing, or top-ranked candidate from judge run
  const bestListing = useMemo(() => {
    const ranked1 = listings.find((l) => l.rank === 1 && l.fit?.verdict !== 'no');
    if (ranked1) return ranked1;
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
    reload: () => { fetchPage(0, false); fetchOverview(); },
    refetch: () => { fetchPage(0, false); fetchOverview(); },
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
    routeData,
    familyTerms,
    radiusDiagnosis,
    diagnosing,
    applyRadius,
  };
}
