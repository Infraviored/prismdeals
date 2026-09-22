import { useState, useEffect, useCallback, useRef } from 'react';
import type { Campaign, SearchFamilyTerm, RouteCorridorData, RouteListingGeo, RadiusDiagnosis } from '../types';
import type { RowListing } from '../components/surface';

/**
 * One listing as the three endpoints send it.
 *
 * Written down rather than left as `any`: every field below is read by the
 * mapper, and an `any` there means a renamed column reaches the surface as
 * `undefined` with nothing to say so.
 */
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
  detailed_description?: string | null;
  short_description?: string | null;
  description?: string | null;
  summary?: string | null;
  reference_comparison?: RowListing['reference_comparison'];
  extracted_facts?: {
    summary?: string | null;
    reference_comparison?: RowListing['reference_comparison'];
  } | null;
}

export interface UseFundeDataOptions {
  campaign: Campaign | undefined;
  isScraping?: boolean;
}

export function useFundeData({ campaign, isScraping }: UseFundeDataOptions) {
  const [listings, setListings] = useState<RowListing[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & sorting
  const [sort, setSort] = useState<string>('default');
  const [maxDetour, setMaxDetour] = useState<number | null>(null);
  const [radius, setRadius] = useState<number>(30);
  const [termId, setTermId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dealsOnly, setDealsOnly] = useState<boolean>(false);
  // Asked of the server, like deals. Hiding rejected rows from the fifty
  // already loaded and calling the remainder the answer is how the bar came
  // to say 50 over a list of 12.
  const [fitOnly, setFitOnly] = useState<boolean>(false);

  // Route & family metadata
  const [routeData, setRouteData] = useState<RouteCorridorData | null>(null);
  const [familyTerms, setFamilyTerms] = useState<SearchFamilyTerm[]>([]);
  const [radiusDiagnosis, setRadiusDiagnosis] = useState<RadiusDiagnosis | null>(null);

  const campaignId = campaign?.id ?? null;
  const routeId = campaign?.route_id ?? null;
  const familyId = campaign?.family_id ?? null;

  // Load family metadata once if present
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

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
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
        if (fitOnly) queryParams.set('fitOnly', '1');

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
          // The server decides this now, from the median price of the same
          // search. The old rule asked niceness_score >= 85, and 10 of 1266
          // listings have a score at all -- so the accent never once appeared.
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
          reference_comparison: l.reference_comparison || l.extracted_facts?.reference_comparison || null,
        }));

        setTotal(fetchedTotal);
        setOffset(targetOffset);
        if (append) {
          setListings((prev) => [...prev, ...mapped]);
        } else {
          setListings(mapped);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message || 'Failed to load listings');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      campaignId,
      routeId,
      familyId,
      limit,
      sort,
      maxDetour,
      termId,
      searchQuery,
      dealsOnly,
      fitOnly,
    ]
  );

  // Trigger initial or filter-reset fetch
  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  // Refetch when scraping finishes -- on the transition, not on every render
  // while it is false.
  //
  // With `fetchPage` in this effect's dependencies, both effects fired for the
  // same change. The second aborted the first, but the first's `finally` still
  // ran setLoading(false) after the second had set it true, so opening the
  // screen and every filter change flashed the "no matches" empty state, and
  // every page was fetched twice.
  const wasScraping = useRef(isScraping);
  useEffect(() => {
    if (wasScraping.current && !isScraping) {
      fetchPage(0, false);
    }
    wasScraping.current = isScraping;
  }, [isScraping, fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (listings.length < total) {
      fetchPage(offset + limit, true);
    }
  }, [loading, loadingMore, listings.length, total, offset, limit, fetchPage]);

  // The server decides and counts. Filtering here meant the header reported the
  // number of deals among the fifty loaded rows as the size of the search.
  const displayedListings = listings;
  const displayedCount = total;

  return {
    listings: displayedListings,
    total: displayedCount,
    rawTotal: total,
    loading,
    loadingMore,
    error,
    hasMore: listings.length < total,
    loadMore,
    reload: () => fetchPage(0, false),
    refetch: () => fetchPage(0, false),
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
  };
}
