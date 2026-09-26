import type { RowListing } from '../components/surface';

/** A listing as the listings endpoints send it. */
export interface ApiListing {
  id: string | number;
  title?: string | null;
  price?: string | null;
  price_eur?: number | null;
  location?: string | null;
  url?: string | null;
  images?: string[] | null;
  detour_min?: number | null;
  offroute_km?: number | null;
  distance_km?: number | null;
  lat?: number | null;
  lon?: number | null;
  geo_status?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_deal?: boolean;
  price_delta_eur?: number | null;
  price_history?: RowListing['price_history'];
  fit?: RowListing['fit'];
  facts?: RowListing['facts'];
  target?: RowListing['target'];
  niceness_score?: number | null;
  score?: RowListing['score'];
  score_parts?: RowListing['score_parts'];
  market_median?: RowListing['market_median'];
  market_basis?: RowListing['market_basis'];
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
  same_as?: number[] | null;
  also?: RowListing['also'];
  chips?: RowListing['chips'];
}

/** The row the list, the sheet and a shared link all show. */
export function toRowListing(l: ApiListing): RowListing {
  return {
    id: String(l.id),
    title: l.title || '',
    price: l.price,
    price_eur: typeof l.price_eur === 'number' ? l.price_eur : null,
    location: l.location || null,
    images: Array.isArray(l.images) ? l.images : [],
    image_url: Array.isArray(l.images) && l.images.length > 0 ? l.images[0] : null,
    detour_min: typeof l.detour_min === 'number' ? l.detour_min : null,
    offroute_km: typeof l.offroute_km === 'number' ? l.offroute_km : null,
    distance_km: typeof l.distance_km === 'number' ? l.distance_km : null,
    first_seen_at: l.first_seen_at || l.last_seen_at || null,
    last_seen_at: l.last_seen_at || null,
    is_deal: !!l.is_deal,
    price_delta_eur: typeof l.price_delta_eur === 'number' ? l.price_delta_eur : null,
    fit: l.fit || null,
    price_history: Array.isArray(l.price_history) ? l.price_history : null,
    route_status: l.geo_status || null,
    url: l.url || undefined,
    facts: l.facts || null,
    target: l.target || null,
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
    market_basis: l.market_basis || null,
    details: l.details || null,
    reference_comparison: l.reference_comparison || l.extracted_facts?.reference_comparison || null,
    rank: typeof l.rank === 'number' ? l.rank : null,
    rank_of: typeof l.rank_of === 'number' ? l.rank_of : null,
    rank_reason: l.rank_reason || null,
    seller_questions: Array.isArray(l.seller_questions) ? l.seller_questions : null,
    uncertain: !!l.uncertain,
    same_as: Array.isArray(l.same_as) ? l.same_as : null,
    also: Array.isArray(l.also) ? l.also : null,
    chips: Array.isArray(l.chips) ? l.chips : null,
  };
}
