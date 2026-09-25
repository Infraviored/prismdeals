import type { HuntDocument, HuntOverview } from '../types/hunt';

export const numberAttr = { id: 'km', label: 'Kilometerstand', type: 'number' as const, unit: null, options: null, site_filter: null };

export const huntDoc = (): HuntDocument => ({
  id: 11,
  name: 'Supersportler',
  text: 'CBR SC59 unter 5000 km oder R1 RN19',
  category_code: '305',
  frame: { max_price: 9000, location_id: 7074, place: 'Vilgertshofen', radius_km: 200 },
  family_id: 8,
  route: null,
  targets: [
    {
      node_id: 176,
      typed: 'Honda CBR 1000 RR SC59',
      name: 'Honda CBR 1000 RR SC59',
      years: [2008, 2011],
      attributes: [numberAttr],
      conditions: [{ id: 1, attr_id: 'km', label: 'Kilometerstand', op: 'max', value: 5000, importance: 'must', text: 'Kilometerstand bis 5000' }],
    },
    { node_id: 168, typed: 'Yamaha R1 RN19', name: 'Yamaha R1 RN19', years: [2007, 2008], attributes: [numberAttr], conditions: [] },
  ],
  conditions: [{ id: 2, attr_id: 'km', label: 'Kilometerstand', op: 'max', value: 30000, importance: 'must', text: 'Kilometerstand bis 30000' }],
  crawl: [
    { id: 24, label: 'Honda CBR 1000 RR', searches: 1 },
    { id: 25, label: 'Yamaha R1', searches: 3 },
  ],
});

export const overview = (): HuntOverview => ({
  pots: { all: 3, fit: 1, unclear: 1, no: 1 },
  rejections: [{ reason: 'Anderes Modell', count: 1, examples: ['Anderes Modell: Yamaha R1 RN12'] }],
  markets: [{ node_id: 168, name: 'Yamaha R1 RN19', count: 6, median: 8299 }],
  price_distribution: { min: 3850, max: 9000, count: 2, bins: [{ min: 3000, max: 3999, count: 1, label: '3000–3999 €' }, { min: 7000, max: 7999, count: 1, label: '7000–7999 €' }] },
  conditions: [{ id: 2, label: 'Kilometerstand', op: 'max', value: 30000, importance: 'must', text: 'Kilometerstand bis 30000', node_id: null, met: 15, violated: 0, open: 0, total: 15 }],
  last_crawled_at: new Date().toISOString(),
  schedule_interval: 0,
});

export const listing = (id: string, verdict: 'fit' | 'unclear' | 'no', extra: Record<string, unknown> = {}) => ({
  id,
  title: `Yamaha R1 ${id}`,
  price: '7500 €',
  price_eur: 7500,
  location: 'Bayern - Haiterbach',
  images: [],
  first_seen_at: new Date().toISOString(),
  lat: 48.1,
  lon: 11.2,
  is_deal: false,
  score: 80,
  score_parts: { score: 80, gate: { met: [], violated: [], open: [], factor: 1 }, wishes: { met: [], missed: [], open: [] }, axes: {} },
  fit: { verdict, reason: verdict === 'fit' ? '' : verdict === 'no' ? 'Anderes Modell: Yamaha R1 RN12' : 'Modell nicht erkannt', states: { '2': 'met' }, target_id: verdict === 'fit' ? 168 : null },
  facts: { km: 12000 },
  target: verdict === 'fit' ? { node_id: 168, name: 'Yamaha R1 RN19' } : null,
  ...extra,
});

export const page = (listings: ReturnType<typeof listing>[], counts = { all: 3, fit: 1, unclear: 1, no: 1 }) => ({
  total: listings.length,
  counts,
  offset: 0,
  limit: 50,
  route: null,
  points: listings.map((l) => ({ id: l.id, title: l.title, lat: l.lat, lon: l.lon })),
  listings,
});
