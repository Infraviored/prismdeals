import { useState, useCallback, useRef } from 'react';
import type {
  HuntType,
  HuntRequirement,
  ProposedModel,
  HuntParsedIntent,
} from '../types';
import type { Place } from '../components/PlaceInput';
import { useProbe } from './useProbe';
import { slugify } from '../utils/searchUrl';
import { broadenQuery } from '../utils/searchTerms';
import { executeHuntSave } from '../utils/huntSave';

export interface UseHuntSetupOptions {
  onSaved?: (saved: { campaignId: number; familyId: number }) => void;
  onCancel?: () => void;
}

export function useHuntSetup({ onSaved }: UseHuntSetupOptions = {}) {
  const [step, setStep] = useState<number>(1);
  const [intentText, setIntentText] = useState('');
  const [isAnalyzingIntent, setIsAnalyzingIntent] = useState(false);
  const [parsedIntent, setParsedIntent] = useState<HuntParsedIntent | null>(null);

  // Hunt strategy
  const [huntType, setHuntType] = useState<HuntType>('features');

  // Step 3 details
  const [models, setModels] = useState<string[]>([]);
  const [proposedModels, setProposedModels] = useState<ProposedModel[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [musts, setMusts] = useState<HuntRequirement[]>([]);
  const [prefs, setPrefs] = useState<HuntRequirement[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);

  // Step 4 location & frame
  const [place, setPlace] = useState<Place | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationSlug, setLocationSlug] = useState<string | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<string[]>([]);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Probe hook
  const probe = useProbe();
  const lookupSeq = useRef(0);

  // Place resolver
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
    setLocationId(null);

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
      // Keep place name even if lookup failed
    }
  }, []);

  // Fetch proposed candidate models for class hunt
  const fetchClassProposals = useCallback(
    async (classText: string, budgetMax: number | null, cat: string | null) => {
      setIsLoadingProposals(true);
      try {
        const frame = {
          category_code: cat ? `c${cat}` : undefined,
          price: budgetMax ? { max: budgetMax } : undefined,
          location_id: locationId,
          radius_km: radius,
        };
        const res = await fetch('/api/intent/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            class_text: classText,
            budget: budgetMax,
            category: cat,
            frame,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models)) {
            setProposedModels(
              data.models.map((m: ProposedModel) => ({
                ...m,
                selected: true,
              }))
            );
          }
        }
      } catch (err) {
        console.error('Failed to load class model proposals:', err);
      } finally {
        setIsLoadingProposals(false);
      }
    },
    [locationId, radius]
  );

  // Step 1: Submit intent text to POST /api/intent/parse
  const submitIntent = useCallback(async (text: string) => {
    setIntentText(text);
    setIsAnalyzingIntent(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/intent/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const intent: HuntParsedIntent = await res.json();
        setParsedIntent(intent);

        if (intent.hunt_type) setHuntType(intent.hunt_type);
        if (Array.isArray(intent.musts) && intent.musts.length > 0) setMusts(intent.musts);
        if (Array.isArray(intent.prefs) && intent.prefs.length > 0) setPrefs(intent.prefs);
        if (Array.isArray(intent.models) && intent.models.length > 0) setModels(intent.models);
        if (Array.isArray(intent.sizes) && intent.sizes.length > 0) setSizes(intent.sizes);
        if (intent.budget?.max) setMaxPrice(intent.budget.max);
      }
    } catch (err) {
      console.error('Intent parsing request error:', err);
    } finally {
      setIsAnalyzingIntent(false);
      setStep(2);
    }
  }, []);

  // Trigger probe for Step 5
  const launchProbe = useCallback(() => {
    const effectivePrice = maxPrice ? { min: null, max: maxPrice } : undefined;
    const effectiveCategory = categoryId ? `c${categoryId}` : null;

    let seedTerms: string[] = [];
    if (huntType === 'shortlist' && models.length > 0) {
      seedTerms = [...models];
    } else if (huntType === 'class' && proposedModels.length > 0) {
      seedTerms = proposedModels.filter((m) => m.selected !== false).map((m) => m.model);
    } else if (intentText.trim()) {
      seedTerms = [broadenQuery(intentText.trim()) || intentText.trim()];
    }

    const payload = {
      category_code: effectiveCategory,
      location_id: locationId,
      radius_km: radius,
      price: effectivePrice,
      hunt_type: huntType,
      musts: musts.map((m) => ({ id: m.id, label: m.label || m.id, want: m.want || { text: m.id } })),
      prefs: prefs.map((p) => ({ id: p.id, label: p.label || p.id, want: p.want || { text: p.id } })),
      seed_terms: seedTerms,
      models:
        huntType === 'shortlist'
          ? models
          : huntType === 'class'
          ? proposedModels.filter((m) => m.selected !== false).map((m) => m.model)
          : [],
      budget_steps: maxPrice
        ? [Math.round(maxPrice * 0.5), Math.round(maxPrice * 0.8), maxPrice]
        : undefined,
    };

    probe.startProbe(payload);
  }, [
    huntType,
    models,
    proposedModels,
    intentText,
    categoryId,
    locationId,
    radius,
    maxPrice,
    musts,
    prefs,
    probe,
  ]);

  // Step transitions
  const nextStep = useCallback(() => {
    if (step === 2) {
      if (huntType === 'exact') {
        setStep(4);
      } else {
        setStep(3);
        if (huntType === 'class' && proposedModels.length === 0) {
          fetchClassProposals(intentText, maxPrice, categoryId);
        }
      }
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      setStep(5);
      launchProbe();
    }
  }, [
    step,
    huntType,
    proposedModels.length,
    intentText,
    maxPrice,
    categoryId,
    fetchClassProposals,
    launchProbe,
  ]);

  const prevStep = useCallback(() => {
    if (step === 4 && huntType === 'exact') {
      setStep(2);
    } else if (step > 1) {
      setStep((s) => s - 1);
    }
  }, [step, huntType]);

  const toggleProposedModel = useCallback((idx: number) => {
    setProposedModels((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
    );
  }, []);

  // Save hunt and start searching
  const saveHunt = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const saved = await executeHuntSave({
        intentText,
        huntType,
        models,
        musts,
        prefs,
        sizes,
        place,
        locationId,
        locationSlug,
        radius,
        maxPrice: probe.selectedBudgetMax ?? maxPrice,
        categoryId,
        attributes,
        parsedIntent,
        probeMarketPicture: probe.marketPicture,
        probeRungs: probe.rungs,
      });

      if (onSaved) {
        onSaved(saved);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    intentText,
    huntType,
    models,
    musts,
    prefs,
    sizes,
    place,
    locationId,
    locationSlug,
    radius,
    probe.selectedBudgetMax,
    probe.marketPicture,
    probe.rungs,
    maxPrice,
    categoryId,
    attributes,
    parsedIntent,
    onSaved,
  ]);

  return {
    step,
    setStep,
    intentText,
    isAnalyzingIntent,
    submitIntent,
    huntType,
    setHuntType,
    models,
    setModels,
    proposedModels,
    isLoadingProposals,
    toggleProposedModel,
    musts,
    setMusts,
    prefs,
    setPrefs,
    sizes,
    setSizes,
    styles,
    setStyles,
    place,
    handlePlaceChange,
    locationId,
    radius,
    setRadius,
    maxPrice,
    setMaxPrice,
    categoryId,
    setCategoryId,
    attributes,
    setAttributes,
    probe,
    launchProbe,
    nextStep,
    prevStep,
    isSaving,
    saveError,
    saveHunt,
  };
}
