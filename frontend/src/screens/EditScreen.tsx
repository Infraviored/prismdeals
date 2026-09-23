import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RadiusField } from '../components/RadiusField';
import CategoryFilters from '../components/CategoryFilters';
import { Bar } from '../components/surface';
import PlaceInput, { type Place } from '../components/PlaceInput';
import ModelPillGroup from '../components/ModelPillGroup';
import { RequirementsSheet } from './RequirementsSheet';
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
  // No limit until the buyer sets one. A radius only means something around a
  // place, and 30 km preset on a search without one was a limit nobody chose.
  const [radius, setRadius] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [terms, setTerms] = useState<SearchFamilyTerm[]>([]);

  const [saving, setSaving] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lookupSeq = useRef(0);
  const [resolveFailed, setResolveFailed] = useState(false);

  const applyDecomposedUrl = useCallback((url: string) => {
    const dec = decomposeSearchUrl(url);
    if (!dec) return;
    if (dec.radius) setRadius(dec.radius);
    if (dec.maxPrice !== null) setMaxPrice(dec.maxPrice);
    setCategoryId(dec.category);
    setAttributes(dec.attributes);
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

  // Initialize data from family or active search.
  //
  // Once per campaign, never again. `campaign` and `searches` are rebuilt by
  // useAppData on every refreshAll(), and the scrape poller calls that every
  // two seconds -- so with these in the dependency list the form reset itself
  // mid-edit: a half-typed name snapped back and radius, price, category and
  // filters all reverted.
  const initialisedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!campaign) return;
    if (initialisedFor.current === campaign.id) return;
    initialisedFor.current = campaign.id;
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
    // Drop the previous town's id first. Kept while the new one resolves, a
    // failed lookup left the screen showing one place and the search aimed at
    // another -- silently, in both directions.
    setLocationId(null);
    setResolveFailed(false);

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
      if (!res.ok) setResolveFailed(true);
    } catch {
      setResolveFailed(true);
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
      // Only a resolved Kleinanzeigen location id, never a postal code: they
      // are different namespaces, and l86899 is not Landsberg (7091). Writing
      // the PLZ into the tail produced a URL the scraper crawled somewhere
      // else entirely, with nothing to show for it.
      locationId,
      radius: place || locationId ? radius : null,
      maxPrice,
      query: trimmedName ? slugify(trimmedName) : undefined,
      category: categoryId,
      attributes,
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
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans w-full overflow-x-hidden">
      {/* 1. Header Bar (44px) */}
      <Bar
        measure="max-w-xl"
        title={t('surface.setupTitle', { name: name || campaign?.name || '' })}
        onBack={onBack}
        backLabel={t('surface.back')}
        actions={
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={handleSave}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t('surface.saving') : t('surface.save')}
          </button>
        }
      />

      {/* 2. Main Form Body — 4 fields, clean whitespace, no Card frames */}
      <main className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col space-y-6">
        {/* Field 1: Was (What) */}
        <div className="space-y-2">
          <label htmlFor="setup-what" className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.what')}
          </label>
          <input
            id="setup-what"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('surface.whatPlaceholder')}
            className="w-full px-3.5 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm transition-colors"
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

        {resolveFailed && (
          <p className="text-sm text-[#C9A227]">{t('surface.placeUnresolved')}</p>
        )}

        <CategoryFilters
          categoryId={categoryId}
          attributes={attributes}
          term={name}
          onCategoryChange={setCategoryId}
          onAttributesChange={setAttributes}
        />

        {/* Field 2: Wo (Where) */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#8FA6A1]">
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
          <label className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.howFar')}
          </label>
          {!place && !locationId ? (
            <p className="text-sm text-[#8FA6A1]">{t('surface.radiusNoPlace')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2" role="radiogroup" aria-label={t('surface.howFar')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={radius === null}
                  onClick={() => setRadius(null)}
                  className={`px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
                    radius === null ? 'border-[#E4D6BE] text-[#F2F5F4]' : 'border-[#0E4A40] text-[#8FA6A1] hover:border-[#8FA6A1]'
                  }`}
                >
                  {t('surface.radiusUnlimited')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={radius !== null}
                  onClick={() => setRadius(radius ?? 50)}
                  className={`px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
                    radius !== null ? 'border-[#E4D6BE] text-[#F2F5F4]' : 'border-[#0E4A40] text-[#8FA6A1] hover:border-[#8FA6A1]'
                  }`}
                >
                  {t('surface.radiusLimited')}
                </button>
              </div>
              {radius !== null && <RadiusField value={radius} onChange={setRadius} />}
            </div>
          )}
        </div>

        {/* Field 4: Bis wie viel (Max price) */}
        <div className="space-y-2">
          <label htmlFor="setup-price" className="block text-xs font-medium text-[#8FA6A1]">
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
              className="w-full pl-3.5 pr-8 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm tabular-nums text-right transition-colors"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[#8FA6A1] pointer-events-none font-medium">
              €
            </span>
          </div>
        </div>

        {/* Field 5: what the site cannot filter on */}
        {campaign && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#8FA6A1]">
              {t('surface.requirements')}
            </label>
            <button
              type="button"
              onClick={() => setRequirementsOpen(true)}
              className="w-full px-3.5 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-left text-sm text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer"
            >
              {t('surface.requirementsOpen')}
            </button>
          </div>
        )}

        {saveError && (
          <p className="text-xs text-[#E87967] font-semibold">{saveError}</p>
        )}

        {/* Quiet delete button at the bottom */}
        {campaign && (
          <div className="pt-10 pb-6">
            <button
              type="button"
              onClick={handleDelete}
              className="w-full px-4 py-2.5 rounded border border-[#0E4A40] text-sm text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer bg-transparent"
            >
              {t('surface.deleteSearch')}
            </button>
          </div>
        )}
      </main>

      <RequirementsSheet
        isOpen={requirementsOpen}
        onClose={() => setRequirementsOpen(false)}
        campaignId={campaign?.id ?? null}
      />
    </div>
  );
};

export default EditScreen;
