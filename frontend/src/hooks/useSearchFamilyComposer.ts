import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SearchFamilyTerm } from '../types';
import type { Place } from '../components/PlaceInput';
import { decomposeSearchUrl, composeSearchUrl, slugify } from '../utils/searchUrl';
import { parseLinesToTerms } from '../utils/searchFamily';

export interface UseSearchFamilyComposerProps {
  familyId?: number;
  initialName?: string;
  initialBaseUrl?: string;
  initialTerms?: SearchFamilyTerm[];
}

export function useSearchFamilyComposer({
  familyId,
  initialName = '',
  initialBaseUrl = '',
  initialTerms = [],
}: UseSearchFamilyComposerProps) {
  const [name, setName] = useState(initialName);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [terms, setTerms] = useState<SearchFamilyTerm[]>(initialTerms);
  const [pasteText, setPasteText] = useState('');
  const [additionalText, setAdditionalText] = useState('');

  // Composer fields state
  const [place, setPlace] = useState<Place | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationSlug, setLocationSlug] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(30);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [loadingFamily, setLoadingFamily] = useState(false);

  // Helper to decompose a URL and initialize composer fields
  const applyDecomposedUrl = useCallback((urlToDecompose: string) => {
    const dec = decomposeSearchUrl(urlToDecompose);
    if (!dec) return;

    if (dec.radius !== null) setRadius(dec.radius);
    setMinPrice(dec.minPrice);
    setMaxPrice(dec.maxPrice);
    if (dec.locationId) setLocationId(dec.locationId);
    if (dec.locationSlug) setLocationSlug(dec.locationSlug);
    if (dec.query) setQuery(dec.query);
    if (dec.category) setCategory(dec.category);

    if (dec.locationSlug) {
      const searchNeedle = dec.locationSlug.replace(/-/g, ' ');
      fetch(`/api/places/suggest?q=${encodeURIComponent(searchNeedle)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.places) && data.places.length > 0) {
            setPlace(data.places[0]);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Initialize from initialBaseUrl if provided
  useEffect(() => {
    if (initialBaseUrl) {
      applyDecomposedUrl(initialBaseUrl);
    }
  }, [initialBaseUrl, applyDecomposedUrl]);

  // Load family data if familyId provided
  useEffect(() => {
    if (!familyId) return;
    if (initialTerms.length > 0 && initialName && initialBaseUrl) return;
    setLoadingFamily(true);
    fetch(`/api/search-families/${familyId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.name) setName(data.name);
        if (data.base_url) {
          setBaseUrl(data.base_url);
          applyDecomposedUrl(data.base_url);
        }
        if (Array.isArray(data.terms)) {
          setTerms(
            data.terms.map((item: { id?: number; term: string; label?: string; enabled?: boolean | number }) => ({
              id: item.id,
              term: item.term,
              label: item.label || item.term,
              enabled: item.enabled !== 0 && item.enabled !== false,
            }))
          );
        }
      })
      .catch((err) => console.error('Failed to load search family data:', err))
      .finally(() => setLoadingFamily(false));
  }, [familyId, initialName, initialBaseUrl, initialTerms.length, applyDecomposedUrl]);

  // Re-compose base URL whenever composer fields change
  const recompose = useCallback(
    (
      newLocationSlug: string | null,
      newLocationId: string | null,
      newRadius: number,
      newMinPrice: number | null,
      newMaxPrice: number | null
    ) => {
      if (!newLocationSlug && !newLocationId) return;
      const composed = composeSearchUrl({
        locationSlug: newLocationSlug,
        locationId: newLocationId,
        radius: newRadius,
        minPrice: newMinPrice,
        maxPrice: newMaxPrice,
        query,
        category,
      });
      setBaseUrl(composed);
    },
    [query, category]
  );

  const handlePlaceChange = useCallback(
    async (newPlace: Place | null) => {
      setPlace(newPlace);
      if (!newPlace) {
        setLocationId(null);
        setLocationSlug(null);
        return;
      }

      const slug = slugify(newPlace.name);
      setLocationSlug(slug);

      let resolvedId = locationId;
      try {
        const queryParam = newPlace.postal_code || newPlace.name;
        const res = await fetch(`/api/locations/resolve?postal_code=${encodeURIComponent(queryParam)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.location_id) {
            resolvedId = data.location_id;
            setLocationId(resolvedId);
          }
        }
      } catch {
        // Fall back to existing location ID
      }

      recompose(slug, resolvedId, radius, minPrice, maxPrice);
    },
    [locationId, radius, minPrice, maxPrice, recompose]
  );

  const handleRadiusChange = useCallback(
    (newRadius: number) => {
      setRadius(newRadius);
      recompose(locationSlug, locationId, newRadius, minPrice, maxPrice);
    },
    [locationSlug, locationId, minPrice, maxPrice, recompose]
  );

  const handleMinPriceChange = useCallback(
    (newMin: number | null) => {
      setMinPrice(newMin);
      recompose(locationSlug, locationId, radius, newMin, maxPrice);
    },
    [locationSlug, locationId, radius, maxPrice, recompose]
  );

  const handleMaxPriceChange = useCallback(
    (newMax: number | null) => {
      setMaxPrice(newMax);
      recompose(locationSlug, locationId, radius, minPrice, newMax);
    },
    [locationSlug, locationId, radius, minPrice, recompose]
  );

  const handleApplyPaste = useCallback(() => {
    if (!pasteText.trim()) return;
    const newItems = parseLinesToTerms(pasteText);
    if (newItems.length > 0) {
      setTerms(newItems);
      setPasteText('');
    }
  }, [pasteText]);

  const handleAddAdditional = useCallback(() => {
    if (!additionalText.trim()) return;
    const newItems = parseLinesToTerms(additionalText);
    if (newItems.length > 0) {
      setTerms((prev) => [...prev, ...newItems]);
      setAdditionalText('');
    }
  }, [additionalText]);

  const handleToggleTerm = useCallback((index: number) => {
    setTerms((prev) =>
      prev.map((term, i) => (i === index ? { ...term, enabled: !term.enabled } : term))
    );
  }, []);

  const handleDeleteTerm = useCallback((index: number) => {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleToggleAll = useCallback(() => {
    setTerms((prev) => {
      const someDisabled = prev.some((term) => !term.enabled);
      return prev.map((term) => ({ ...term, enabled: someDisabled }));
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setTerms([]);
    setPasteText('');
  }, []);

  const activeTerms = useMemo(() => terms.filter((t) => t.enabled), [terms]);

  return {
    name,
    setName,
    baseUrl,
    setBaseUrl,
    terms,
    setTerms,
    pasteText,
    setPasteText,
    additionalText,
    setAdditionalText,
    place,
    locationId,
    locationSlug,
    radius,
    minPrice,
    maxPrice,
    loadingFamily,
    activeTerms,
    handlePlaceChange,
    handleRadiusChange,
    handleMinPriceChange,
    handleMaxPriceChange,
    handleApplyPaste,
    handleAddAdditional,
    handleToggleTerm,
    handleDeleteTerm,
    handleToggleAll,
    handleClearAll,
  };
}
