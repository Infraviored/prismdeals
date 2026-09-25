import type {
  HuntType,
  HuntRequirement,
  HuntParsedIntent,
  MarketPicture,
  ProbeRung,
} from '../types';
import type { Place } from '../components/PlaceInput';
import { composeSearchUrl, slugify } from './searchUrl';
import { broadenQuery, withoutGeneration } from './searchTerms';

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
      term: slugify(withoutGeneration(t)),
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
      term: slugify(withoutGeneration(m)),
      label: m,
      enabled: true,
    }));
  }

  const fallback = broadenQuery(huntName) || huntName;
  return [{ term: slugify(fallback), label: fallback, enabled: true }];
}

/**
 * A name a person recognises on the start screen: the models for a model
 * list, the class for a class hunt, else the first search term. The whole
 * sentence ("Supersportmotorrad mit min. 170PS. Yamaha r1 rn19 oder ...")
 * was the name before.
 */
export function huntDisplayName(params: {
  intentText: string;
  huntType: HuntType;
  models: string[];
  parsedIntent: HuntParsedIntent | null;
}): string {
  const { intentText, huntType, models, parsedIntent } = params;
  const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  // A class hunt is named after the class ("Ventilator"), not after the
  // models it happened to propose ("Honeywell HT-900 / Dyson AM07 / ...").
  if (huntType === 'class') {
    const cls = parsedIntent?.class || parsedIntent?.search_terms?.[0];
    if (cls) return cap(cls);
  }
  if (huntType === 'shortlist' && models.length > 0) {
    return models.slice(0, 3).join(' / ');
  }
  const term = parsedIntent?.search_terms?.[0];
  if (term) return cap(term);
  const text = intentText.trim();
  if (text.length <= 40) return text || 'Neue Suche';
  return text.slice(0, 40).replace(/\s+\S*$/, '') + ' …';
}

/**
 * A must or wish from the setup in the requirement shape the judge and score
 * read. Written in the buyer's words, so it is read as words ("own_" fields,
 * scraper/wishes.py); a wish only lifts the score, a must decides.
 */
export function toRequirement(
  req: HuntRequirement,
  importance: 'high' | 'low' = 'high'
): {
  id: string;
  label: string;
  importance: 'high' | 'low';
  own: true;
  buyer_wants: Record<string, unknown>;
} | null {
  const want = req.want || {};
  const wants: Record<string, unknown> = {};
  if (typeof want.min === 'number') wants.min = want.min;
  if (typeof want.max === 'number') wants.max = want.max;
  if (Array.isArray(want.oneOf) && want.oneOf.length) wants.preferred = want.oneOf;
  if (typeof want.match === 'boolean') wants.match = want.match;
  if (typeof want.match === 'string' && want.match) wants.preferred = [want.match];
  if (want.present === true) wants.present = true;
  // Typed in as free text ("ABS"): it should be there.
  if (Object.keys(wants).length === 0) wants.present = true;
  const label = (req.label || req.id || '').trim();
  if (!label) return null;
  const slug = label.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '');
  return { id: `own_${slug}`, label, importance, own: true, buyer_wants: wants };
}

/** The brand of each model ("Honeywell HT-900" -> "honeywell"), once. */
export function brandsOf(models: string[]): string[] {
  const out: string[] = [];
  for (const model of models) {
    const brand = model.trim().split(/\s+/)[0]?.toLowerCase();
    if (brand && brand.length >= 2 && !out.includes(brand)) out.push(brand);
  }
  return out;
}

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${url}: ${res.status}`);
  return data;
}

/**
 * Saves a new hunt: the hunt itself (campaign), its search terms (family,
 * one search per term), and the buyer's musts as requirements.
 *
 * The family endpoint does not create a campaign. The first version expected
 * it to and got back no campaign id: the terms were saved without a hunt, the
 * start screen never showed it, and the results screen opened another hunt's
 * list. The crawl is started by the caller (App), not here as well.
 */
export async function executeHuntSave(
  params: HuntSaveParams
): Promise<{ campaignId: number; familyId: number }> {
  const huntName = huntDisplayName(params);
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
    // Without a place the first path part is free; filled with the first term
    // it showed up as the hunt's place on the start screen.
    categorySlug: 'suchanfrage',
    attributes: params.attributes,
  });

  const intentPayload = {
    ...(params.parsedIntent || {}),
    text: params.intentText,
    musts: params.musts,
    prefs: params.prefs,
    models: params.models,
    sizes: params.sizes,
    budget: { min: null, max: params.maxPrice },
  };

  const campaign = await postJson('/api/campaigns', 'POST', {
    name: huntName,
    hunt_type: params.huntType,
    intent_json: intentPayload,
  });
  const campaignId = Number(campaign.id);
  if (!campaignId) throw new Error('Die Suche wurde nicht angelegt.');

  const family = await postJson('/api/search-families', 'POST', {
    name: huntName,
    base_url: composedBaseUrl,
    campaign_id: campaignId,
    terms: finalTerms,
  });

  const requirements = [
    ...params.musts.map((m) => toRequirement(m, 'high')),
    ...params.prefs.map((p) => toRequirement(p, 'low')),
  ].filter((r): r is NonNullable<ReturnType<typeof toRequirement>> => r !== null);
  // A class hunt searches the class and the models it proposed; an offer from
  // one of those brands is worth more than a no-name one -- a wish, not a must.
  const brands = brandsOf(params.huntType === 'class' ? params.models : []);
  if (brands.length > 0) {
    requirements.push({
      id: 'own_bekannte_marke',
      label: 'Bekannte Marke',
      importance: 'low',
      own: true,
      buyer_wants: { present: true },
      keywords: brands,
    } as NonNullable<ReturnType<typeof toRequirement>>);
  }
  if (requirements.length > 0) {
    await postJson(`/api/campaigns/${campaignId}/requirements`, 'PUT', { requirements });
  }

  return { campaignId, familyId: Number(family.id) };
}
