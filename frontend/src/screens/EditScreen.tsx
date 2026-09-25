import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RadiusChoice } from '../components/RadiusChoice';
import { MaxPriceField } from '../components/MaxPriceField';
import CategoryFilters from '../components/CategoryFilters';
import { Bar } from '../components/surface';
import PlaceInput, { type Place } from '../components/PlaceInput';
import SearchTermsField from '../components/SearchTermsField';
import { RequirementsSheet } from './RequirementsSheet';
import { EditProbeSheet } from './EditProbeSheet';
import { useTranslation } from '../hooks/useTranslation';
import type { Campaign, SearchTarget, SearchFamilyTerm } from '../types';
import { composeSearchUrl, decomposeSearchUrl, slugify } from '../utils/searchUrl';
import { withoutGeneration, broadenQuery } from '../utils/searchTerms';
import { applyDocument, buildDocument, resolveScopes, type HuntDocument, type HuntRequirement } from '../utils/huntDocument';
import { HuntStructure } from './edit/HuntStructure';
import { HuntAiEdit } from './edit/HuntAiEdit';

export interface EditScreenProps {
  campaign: Campaign | undefined;
  searches?: SearchTarget[];
  onBack: () => void;
  onSaved?: (
    savedFamily: { id: number; searches?: number; conflicts?: unknown[] },
    change?: { searchChanged: boolean }
  ) => void;
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
  // The hunt's requirements, per model or for all; changed here only by the AI.
  const [requirements, setRequirements] = useState<HuntRequirement[]>([]);
  const [requirementsChanged, setRequirementsChanged] = useState(false);

  const [saving, setSaving] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [probeOpen, setProbeOpen] = useState(false);
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
    fetch(`/api/campaigns/${campaign.id}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.requirements)) setRequirements(data.requirements);
      })
      .catch(() => {});

    if (campaign.family_id) {
      fetch(`/api/search-families/${campaign.family_id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.name) setName(data.name);
          if (Array.isArray(data.terms)) {
            setTerms(data.terms.map((t: Omit<SearchFamilyTerm, 'enabled'> & { enabled?: boolean | number }) => ({
              id: t.id, term: t.term, label: t.label || t.term, enabled: t.enabled !== 0 && t.enabled !== false, listings: t.listings, fit_listings: t.fit_listings,
            })));
          }
          if (data.base_url) applyDecomposedUrl(data.base_url);
        })
        .catch(() => {});
    } else {
      const activeSearches = searches.filter((s) => s.campaign_id === campaign.id);
      if (activeSearches.length > 0 && activeSearches[0].url) {
        applyDecomposedUrl(activeSearches[0].url);
      }
      // A campaign of plain searches already asks Kleinanzeigen something. Show
      // those terms, so saving converts them instead of replacing them with the
      // hunt's name -- which is how "corsair vengeance 32gb" (50 found) once
      // became "...-2x16-ddr4-3200-cl16" (almost nothing).
      const seen = new Set<string>();
      const existing: SearchFamilyTerm[] = [];
      for (const search of activeSearches) {
        const query = search.url ? decomposeSearchUrl(search.url)?.query : null;
        if (query && !seen.has(query)) {
          seen.add(query);
          existing.push({ term: query, label: query.replace(/-/g, ' '), enabled: true });
        }
      }
      if (existing.length > 0) setTerms(existing);
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

  const doc = useMemo(
    () => buildDocument(name, terms, maxPrice, radius, requirements),
    [name, terms, maxPrice, radius, requirements]
  );

  const handleAiApply = (next: HuntDocument) => {
    const applied = applyDocument(next, terms);
    setName(applied.name);
    setTerms(applied.terms);
    setMaxPrice(applied.maxPrice);
    setRadius(applied.radius);
    setRequirements(applied.requirements);
    setRequirementsChanged(true);
  };

  /** The requirements with model names turned into the saved terms' ids. */
  const saveRequirements = async (familyId: number, searchChanged: boolean) => {
    if (!campaign?.id || !requirementsChanged) return;
    const family = await fetch(`/api/search-families/${familyId}`).then((r) => (r.ok ? r.json() : null));
    const saved: SearchFamilyTerm[] = family?.terms || [];
    const res = await fetch(`/api/campaigns/${campaign.id}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements: resolveScopes(requirements, saved) }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'requirements');
    // Same offers, new requirements: judge again. A changed search is judged
    // after its crawl anyway.
    if (!searchChanged) {
      await fetch(`/api/campaigns/${campaign.id}/judge`, { method: 'POST' }).catch(() => {});
    }
  };

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

    const fallback = broadenQuery(trimmedName) || trimmedName;
    const effectiveTerms = terms.length > 0
      ? terms.map((t) => ({
          ...(t.id ? { id: t.id } : {}),
          term: withoutGeneration(t.term),
          label: t.label || t.term,
          enabled: true,
        }))
      : [{ term: slugify(fallback), label: fallback, enabled: true }];

    // One search per term: "yamaha-r1-rn19" and "yamaha-r1" become the same.
    const seenTerms = new Set<string>();
    for (let i = effectiveTerms.length - 1; i >= 0; i--) {
      if (seenTerms.has(effectiveTerms[i].term)) effectiveTerms.splice(i, 1);
      else seenTerms.add(effectiveTerms[i].term);
    }

    const composedBaseUrl = composeSearchUrl({
      locationSlug: place ? slugify(place.name) : locationSlug,
      locationId,
      radius: place || locationId ? radius : null,
      maxPrice,
      query: effectiveTerms[0]?.term ? slugify(effectiveTerms[0].term) : undefined,
      category: categoryId,
      // As the setup writes it: without a place the first path part is
      // "suchanfrage", not the first term. Composed differently here, a mere
      // rename changed the URL and started a crawl.
      categorySlug: 'suchanfrage',
      attributes,
    });

    try {
      const isUpdate = Boolean(campaign?.family_id);
      // Only what goes into the URL is a new question to Kleinanzeigen: the
      // terms, place, radius, price and filters. A renamed hunt is not.
      let searchChanged = true;
      if (isUpdate) {
        const before = await fetch(`/api/search-families/${campaign!.family_id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (before) {
          const oldTerms = (before.terms || [])
            .filter((t: { enabled?: number | boolean }) => t.enabled !== 0 && t.enabled !== false)
            .map((t: { term: string }) => t.term)
            .sort()
            .join('|');
          const newTerms = effectiveTerms.map((t) => t.term).sort().join('|');
          searchChanged = before.base_url !== composedBaseUrl || oldTerms !== newTerms;
        }
      }
      const endpoint = isUpdate ? `/api/search-families/${campaign!.family_id}` : '/api/search-families';
      const method = isUpdate ? 'PUT' : 'POST';
      const payload: Record<string, unknown> = {
        name: trimmedName,
        base_url: composedBaseUrl,
        terms: effectiveTerms,
        ...(!isUpdate && campaign?.id ? { campaign_id: campaign.id } : {}),
      };

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

      try {
        await saveRequirements(Number(isUpdate ? campaign!.family_id : data.id), searchChanged);
      } catch {
        setSaveError(t('surface.requirementsSaveFailed'));
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

      if (onSaved) onSaved(data, { searchChanged });
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
        </div>

        {campaign && <HuntAiEdit doc={doc} onApply={handleAiApply} />}
        {campaign && (
          <HuntStructure doc={doc} place={place?.label ?? locationSlug} filters={attributes} />
        )}

        <SearchTermsField
          terms={terms}
          suggestion={broadenQuery(name)}
          onAdd={handleAddModel}
          onRemove={handleRemoveModel}
        />

        {resolveFailed && (
          <p className="text-sm text-[#C9A227]">{t('surface.placeUnresolved')}</p>
        )}

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
          <RadiusChoice hasPlace={Boolean(place || locationId)} radius={radius} onChange={setRadius} />
        </div>

        {/* Field 4: Bis wie viel (Max price) */}
        <div className="space-y-2">
          <label htmlFor="setup-price" className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.maxPrice')}
          </label>
          <MaxPriceField value={maxPrice} onChange={setMaxPrice} />
        </div>

        <CategoryFilters
          categoryId={categoryId}
          attributes={attributes}
          term={name}
          onCategoryChange={setCategoryId}
          onAttributesChange={setAttributes}
        />

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

        {/* Field 6: Markt neu prüfen (Plan §6) */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#8FA6A1]">
            {t('hunt.step5Title')}
          </label>
          <button
            type="button"
            data-testid="edit-probe-btn"
            onClick={() => setProbeOpen(true)}
            className="w-full px-3.5 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-left text-sm text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer"
          >
            {t('hunt.probeAgain')}
          </button>
        </div>

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

      <EditProbeSheet
        isOpen={probeOpen}
        onClose={() => setProbeOpen(false)}
        terms={terms}
        locationId={locationId}
        radius={radius}
        maxPrice={maxPrice}
        categoryId={categoryId}
      />
    </div>
  );
};

export default EditScreen;
