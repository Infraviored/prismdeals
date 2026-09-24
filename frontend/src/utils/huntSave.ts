import type {
  HuntType,
  HuntRequirement,
  HuntParsedIntent,
  MarketPicture,
  ProbeRung,
} from '../types';
import type { Place } from '../components/PlaceInput';
import { composeSearchUrl, slugify } from './searchUrl';
import { broadenQuery } from './searchTerms';

export interface HuntSaveParams {
  intentText: string;
  huntType: HuntType;
  models: string[];
  musts: HuntRequirement[];
  prefs: HuntRequirement[];
  sizes: string[];
  place: Place | null;
  locationId: string | null;
  locationSlug: string | null;
  radius: number | null;
  maxPrice: number | null;
  categoryId: string | null;
  attributes: string[];
  parsedIntent: HuntParsedIntent | null;
  probeMarketPicture: MarketPicture | null;
  probeRungs: ProbeRung[];
}

export function compileHuntTerms(params: {
  intentText: string;
  models: string[];
  probeMarketPicture: MarketPicture | null;
  probeRungs: ProbeRung[];
}): Array<{ term: string; label: string; enabled: boolean }> {
  const { intentText, models, probeMarketPicture, probeRungs } = params;
  const huntName = intentText.trim().slice(0, 80) || 'Neue Suche';

  if (probeMarketPicture?.chosen_terms && probeMarketPicture.chosen_terms.length > 0) {
    return probeMarketPicture.chosen_terms.map((t) => ({
      term: slugify(t),
      label: t,
      enabled: true,
    }));
  }

  if (probeRungs.length > 0) {
    const kept = probeRungs.filter((r) => r.kept);
    const candidates = kept.length > 0 ? kept : probeRungs;
    return candidates.map((r) => ({
      term: slugify(r.term || r.label),
      label: r.label || r.term,
      enabled: true,
    }));
  }

  if (models.length > 0) {
    return models.map((m) => ({
      term: slugify(m),
      label: m,
      enabled: true,
    }));
  }

  const fallback = broadenQuery(huntName) || huntName;
  return [{ term: slugify(fallback), label: fallback, enabled: true }];
}

export async function executeHuntSave(
  params: HuntSaveParams
): Promise<{ campaignId: number; familyId: number }> {
  const huntName = params.intentText.trim().slice(0, 80) || 'Neue Suche';
  const finalTerms = compileHuntTerms({
    intentText: params.intentText,
    models: params.models,
    probeMarketPicture: params.probeMarketPicture,
    probeRungs: params.probeRungs,
  });

  const composedBaseUrl = composeSearchUrl({
    locationSlug: params.place ? slugify(params.place.name) : params.locationSlug,
    locationId: params.locationId,
    radius: params.place || params.locationId ? params.radius : null,
    maxPrice: params.maxPrice,
    query: finalTerms[0]?.term,
    category: params.categoryId,
    attributes: params.attributes,
  });

  // 1. Create search family and new campaign
  const familyRes = await fetch('/api/search-families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: huntName,
      base_url: composedBaseUrl,
      terms: finalTerms,
    }),
  });

  const familyData = await familyRes.json();
  if (!familyRes.ok) {
    throw new Error(familyData.error || 'Failed to save search family');
  }

  const campaignId = familyData.campaign_id;
  const familyId = familyData.id;

  // 2. Persist hunt attributes to campaign
  if (campaignId) {
    const intentPayload = {
      text: params.intentText,
      musts: params.musts,
      prefs: params.prefs,
      models: params.models,
      sizes: params.sizes,
      budget: { max: params.maxPrice },
      ...(params.parsedIntent || {}),
    };

    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hunt_type: params.huntType,
        intent_json: JSON.stringify(intentPayload),
      }),
    }).catch(() => {});

    // 3. Start initial harvest crawl
    await fetch('/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    }).catch(() => {});
  }

  return { campaignId, familyId };
}
