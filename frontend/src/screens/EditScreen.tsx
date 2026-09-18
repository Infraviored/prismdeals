import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bar, Pill } from '../components/surface';
import PlaceInput, { type Place } from '../components/PlaceInput';
import ModelPillGroup from '../components/ModelPillGroup';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign, SearchTarget, SearchFamilyTerm } from '../types';
import { composeSearchUrl, decomposeSearchUrl, slugify } from '../utils/searchUrl';

export interface EditScreenProps {
  campaign: Campaign | undefined;
  searches?: SearchTarget[];
  onBack: () => void;
  onSaved?: (savedFamily: { id: number; searches?: number; conflicts?: unknown[] }) => void;
  onDelete?: (campaign: Campaign) => void;
}

export const EditScreen: React.FC<EditScreenProps> = ({
  campaign,
  searches = [],
  onBack,
  onSaved,
  onDelete,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState(campaign?.name || '');
  const [place, setPlace] = useState<Place | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationSlug, setLocationSlug] = useState<string | null>(null);
  const [radius, setRadius] = useState<number>(30);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [terms, setTerms] = useState<SearchFamilyTerm[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lookupSeq = useRef(0);

  const applyDecomposedUrl = useCallback((url: string) => {
    const dec = decomposeSearchUrl(url);
    if (!dec) return;
    if (dec.radius) setRadius(dec.radius);
    if (dec.maxPrice !== null) setMaxPrice(dec.maxPrice);
    if (dec.locationId) setLocationId(dec.locationId);
    if (dec.locationSlug) {
      setLocationSlug(dec.locationSlug);
      fetch(`/api/places/suggest?q=${encodeURIComponent(dec.locationSlug.replace(/-/g, ' '))}`)
        .then((pr) => (pr.ok ? pr.json() : null))
        .then((pdata) => {
          if (pdata && Array.isArray(pdata.places) && pdata.places.length > 0) {
            setPlace(pdata.places[0]);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Initialize data from family or active search
  useEffect(() => {
    if (!campaign) return;
    if (campaign.name) setName(campaign.name);

    if (campaign.family_id) {
      fetch(`/api/search-families/${campaign.family_id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.name) setName(data.name);
          if (Array.isArray(data.terms)) {
            setTerms(
              data.terms.map((t: { id?: number; term: string; label?: string; enabled?: boolean | number }) => ({
                id: t.id,
                term: t.term,
                label: t.label || t.term,
                enabled: t.enabled !== 0 && t.enabled !== false,
              }))
            );
          }
          if (data.base_url) applyDecomposedUrl(data.base_url);
        })
        .catch(() => {});
    } else {
      const activeSearches = searches.filter((s) => s.campaign_id === campaign.id);
      if (activeSearches.length > 0 && activeSearches[0].url) {
        applyDecomposedUrl(activeSearches[0].url);
      }
    }
  }, [campaign, searches, applyDecomposedUrl]);

  const handlePlaceChange = useCallback(async (newPlace: Place | null) => {
    setPlace(newPlace);
    if (!newPlace) {
      setLocationId(null);
      setLocationSlug(null);
      return;
    }

    const seq = ++lookupSeq.current;
    const slug = slugify(newPlace.name);
    setLocationSlug(slug);

    try {
      const queryParam = newPlace.postal_code || newPlace.name;
      const res = await fetch(`/api/locations/resolve?postal_code=${encodeURIComponent(queryParam)}`);
      if (seq !== lookupSeq.current) return;
      if (res.ok) {
        const data = await res.json();
        if (data && data.location_id) {
          setLocationId(String(data.location_id));
        }
      }
    } catch {
      // Fallback silently if offline or unresolvable
    }
  }, []);

  const handleAddModel = (labelText: string) => {
    const slug = slugify(labelText);
    const existing = terms.some((t) => t.term === slug || t.label.toLowerCase() === labelText.toLowerCase());
    if (!existing) {
      setTerms((prev) => [...prev, { term: slug, label: labelText, enabled: true }]);
    }
  };

  const handleRemoveModel = (index: number) => {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    setSaveError(null);

    const composedBaseUrl = composeSearchUrl({
      locationSlug: place ? slugify(place.name) : locationSlug,
      locationId: locationId || (place?.postal_code ? place.postal_code : null),
      radius,
      maxPrice,
      query: trimmedName ? slugify(trimmedName) : undefined,
    });

    const effectiveTerms =
      terms.length > 0
        ? terms.map((t) => ({
            ...(t.id ? { id: t.id } : {}),
            term: t.term,
            label: t.label || t.term,
            enabled: true,
          }))
        : [{ term: slugify(trimmedName), label: trimmedName, enabled: true }];

    try {
      const isUpdate = Boolean(campaign?.family_id);
      const endpoint = isUpdate ? `/api/search-families/${campaign!.family_id}` : '/api/search-families';
      const method = isUpdate ? 'PUT' : 'POST';
      const payload: Record<string, unknown> = {
        name: trimmedName,
        base_url: composedBaseUrl,
        terms: effectiveTerms,
      };
      if (!isUpdate && campaign?.id) {
        payload.campaign_id = campaign.id;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || t('common.connectionIssueFailed'));
        setSaving(false);
        return;
      }

      if (isUpdate && campaign?.id && campaign.name !== trimmedName) {
        await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: campaign.id, name: trimmedName }),
        }).catch(() => {});
      }

      if (onSaved) onSaved(data);
      else onBack();
    } catch {
      setSaveError(t('common.connectionIssueFailed'));
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!campaign) return;
    if (window.confirm(t('surface.deleteConfirmSearch'))) {
      if (onDelete) onDelete(campaign);
    }
  };

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans w-full">
      {/* 1. Header Bar (48px) */}
      <Bar
        title={t('surface.setupTitle', { name: name || campaign?.name || '' })}
        onBack={onBack}
        actions={
          <Pill
            label={saving ? t('surface.saving') : t('surface.save')}
            active
            disabled={saving || !name.trim()}
            onClick={handleSave}
            className="font-semibold text-xs px-4 py-1.5 cursor-pointer"
          />
        }
      />

      {/* 2. Main Form Body — 4 fields, clean whitespace, no Card frames */}
      <main className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col space-y-6">
        {/* Field 1: Was (What) */}
        <div className="space-y-2">
          <label htmlFor="setup-what" className="block text-xs font-semibold text-[#9FB3B0] uppercase tracking-wider">
            {t('surface.what')}
          </label>
          <input
            id="setup-what"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('surface.whatPlaceholder')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] placeholder-[#9FB3B0]/40 focus:outline-none focus:border-white/30 text-sm transition-colors"
          />

          {/* Models as pills */}
          <ModelPillGroup
            terms={terms}
            onAdd={handleAddModel}
            onRemove={handleRemoveModel}
            addPlaceholder={t('surface.addModel')}
            addTitle={t('surface.addModel')}
          />
        </div>

        {/* Field 2: Wo (Where) */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#9FB3B0] uppercase tracking-wider">
            {t('surface.where')}
          </label>
          <PlaceInput
            label=""
            placeholder={t('surface.wherePlaceholder')}
            value={place}
            onChange={handlePlaceChange}
            emptyHint={t('common.routeNoMatches')}
          />
        </div>

        {/* Field 3: Wie weit (How far) */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#9FB3B0] uppercase tracking-wider">
            {t('surface.howFar')}
          </label>
          <div className="flex flex-wrap gap-2">
            {[10, 30, 50, 100].map((r) => (
              <Pill
                key={r}
                label={`${r} km`}
                active={radius === r}
                onClick={() => setRadius(r)}
              />
            ))}
          </div>
        </div>

        {/* Field 4: Bis wie viel (Max price) */}
        <div className="space-y-2">
          <label htmlFor="setup-price" className="block text-xs font-semibold text-[#9FB3B0] uppercase tracking-wider">
            {t('surface.maxPrice')}
          </label>
          <div className="relative w-36">
            <input
              id="setup-price"
              type="number"
              min="0"
              step="5"
              value={maxPrice !== null && maxPrice !== undefined ? maxPrice : ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                setMaxPrice(val ? parseInt(val, 10) : null);
              }}
              placeholder="150"
              className="w-full pl-3.5 pr-8 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] placeholder-[#9FB3B0]/40 focus:outline-none focus:border-white/30 text-sm tabular-nums font-mono text-right transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[#9FB3B0] pointer-events-none font-medium">
              €
            </span>
          </div>
        </div>

        {saveError && (
          <p className="text-xs text-status-danger font-semibold">{saveError}</p>
        )}

        {/* Quiet delete button at the bottom */}
        {campaign && (
          <div className="pt-8 pb-4 flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-[#9FB3B0] hover:text-[#F2F5F4] transition-colors cursor-pointer bg-transparent border-0 p-0"
            >
              {t('surface.deleteSearch')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default EditScreen;
