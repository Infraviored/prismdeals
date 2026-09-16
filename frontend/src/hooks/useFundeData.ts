import { useState, useEffect, useCallback, useRef } from 'react';
import type { Campaign, SearchFamilyTerm, RouteCorridorData, RouteListingGeo, RadiusDiagnosis } from '../types';
import type { RowListing } from '../components/surface';

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

        const mapped: RowListing[] = rawListings.map((l: RouteListingGeo) => ({
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
          is_deal: !!(l.is_deal || (l.niceness_score && l.niceness_score >= 85)),
          status: l.geo_status || null,
          url: l.url || undefined,
          matched_terms: Array.isArray(l.matched_terms) ? l.matched_terms : [],
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
    [campaignId, routeId, familyId, limit, sort, maxDetour, termId, searchQuery]
  );

  // Trigger initial or filter-reset fetch
  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  // Refetch when scraping finishes
  useEffect(() => {
    if (!isScraping) {
      fetchPage(0, false);
    }
  }, [isScraping, fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (listings.length < total) {
      fetchPage(offset + limit, true);
    }
  }, [loading, loadingMore, listings.length, total, offset, limit, fetchPage]);

  const displayedListings = dealsOnly ? listings.filter((l) => l.is_deal) : listings;
  const displayedCount = dealsOnly ? displayedListings.length : total;

  return {
    listings: displayedListings,
    total: displayedCount,
    rawTotal: total,
    loading,
    loadingMore,
    error,
    hasMore: listings.length < total,
    loadMore,
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
    // Corridor / Family
    routeData,
    familyTerms,
    radiusDiagnosis,
  };
}
