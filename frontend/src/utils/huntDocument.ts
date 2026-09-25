import type { SearchFamilyTerm } from '../types';
import { slugify } from './searchUrl';
import { withoutGeneration } from './searchTerms';

/** A requirement as the knowledge set stores it. */
export interface HuntRequirement {
  id: string;
  label?: string;
  importance?: string;
  own?: boolean;
  keywords?: string[];
  buyer_wants: Record<string, unknown>;
  /** Family term ids: for these models only. Absent: for all. */
  applies_to?: number[];
  /** Model names while the new terms have no ids yet (before saving). */
  applies_to_names?: string[];
  [key: string]: unknown;
}

/** The hunt as one document: what the edit screen shows and the AI changes. */
export interface HuntDocument {
  name: string;
  max_price: number | null;
  radius_km: number | null;
  models: Array<{ name: string; requirements: HuntRequirement[] }>;
  requirements: HuntRequirement[];
}

const isScoped = (r: HuntRequirement) =>
  (Array.isArray(r.applies_to) && r.applies_to.length > 0) ||
  (Array.isArray(r.applies_to_names) && r.applies_to_names.length > 0);

function appliesTo(r: HuntRequirement, term: SearchFamilyTerm): boolean {
  if (term.id != null && r.applies_to?.map(Number).includes(term.id)) return true;
  return Boolean(r.applies_to_names?.includes(term.label));
}

/** Without scope markers: what the document shows and the AI sees. */
function bare(r: HuntRequirement): HuntRequirement {
  const { applies_to: _ids, applies_to_names: _names, ...rest } = r;
  void _ids;
  void _names;
  return rest as HuntRequirement;
}

export function buildDocument(
  name: string,
  terms: SearchFamilyTerm[],
  maxPrice: number | null,
  radius: number | null,
  requirements: HuntRequirement[]
): HuntDocument {
  return {
    name,
    max_price: maxPrice,
    radius_km: radius,
    models: terms.map((term) => ({
      name: term.label || term.term,
      requirements: requirements.filter((r) => appliesTo(r, term)).map(bare),
    })),
    requirements: requirements.filter((r) => !isScoped(r)).map(bare),
  };
}

/** The search term a model name asks Kleinanzeigen: without its generation. */
const termOf = (name: string) => withoutGeneration(slugify(name));

/**
 * The form state a changed document stands for.
 *
 * A model keeps its term (and id) when its name only gained or lost a
 * generation code: "Honda CBR 1000 RR" -> "… SC59" is the same search, now
 * judged for one generation, not a new search.
 */
export function applyDocument(
  doc: HuntDocument,
  terms: SearchFamilyTerm[]
): { name: string; maxPrice: number | null; radius: number | null; terms: SearchFamilyTerm[]; requirements: HuntRequirement[] } {
  const nextTerms: SearchFamilyTerm[] = doc.models.map((model) => {
    const same =
      terms.find((t) => (t.label || '').toLowerCase() === model.name.toLowerCase()) ||
      terms.find((t) => termOf(t.label || t.term) === termOf(model.name));
    return same
      ? { ...same, label: model.name }
      : { term: termOf(model.name), label: model.name, enabled: true };
  });

  const requirements: HuntRequirement[] = [...doc.requirements];
  doc.models.forEach((model) => {
    for (const r of model.requirements) {
      // One id per model: the same wish for two models is two requirements.
      const suffix = `__${slugify(model.name).replace(/-/g, '_')}`;
      const id = r.id.endsWith(suffix) ? r.id : `${r.id}${suffix}`;
      requirements.push({ ...r, id, applies_to_names: [model.name] });
    }
  });
  return { name: doc.name, maxPrice: doc.max_price, radius: doc.radius_km, terms: nextTerms, requirements };
}

/** Names turned into term ids, once the saved family has given every model one. */
export function resolveScopes(requirements: HuntRequirement[], saved: SearchFamilyTerm[]): HuntRequirement[] {
  return requirements.map((r) => {
    if (!r.applies_to_names?.length) return r;
    // By name, or by search term: the saved family may spell the label its own way.
    const ids = saved
      .filter((t) => t.id != null && r.applies_to_names!.some((n) => n === t.label || termOf(n) === t.term))
      .map((t) => t.id as number);
    return { ...bare(r), applies_to: ids };
  });
}

/** "Kilometerstand bis 5000 · Muss" */
const UNIT = /\s+(km|ps|kw|kg|cm|mm|gb|tb|zoll|mhz|ccm|w|l)$/i;
const fmt = (n: number) => n.toLocaleString('de-DE');

export function wantText(r: HuntRequirement, labels: { must: string; wish: string; absent: string }): string {
  const w = r.buyer_wants || {};
  // "Kilometerstand km" names its unit for the reader of numbers; shown, the
  // unit follows the number: "Kilometerstand bis 5.000 km".
  const label = String(r.label || r.id);
  const unit = label.match(UNIT)?.[1] ?? '';
  const name = unit ? label.replace(UNIT, '') : label;
  const parts: string[] = [];
  if (typeof w.min === 'number') parts.push(`ab ${fmt(w.min)}${unit ? ' ' + unit : ''}`);
  if (typeof w.max === 'number') parts.push(`bis ${fmt(w.max)}${unit ? ' ' + unit : ''}`);
  if (w.present === false || w.match === false) parts.push(labels.absent);
  if (r.keywords?.length) parts.push(`„${r.keywords[0]}“`);
  const kind = r.importance === 'low' ? labels.wish : labels.must;
  return `${name}${parts.length ? ' ' + parts.join(' ') : ''} · ${kind}`;
}

// The site's filter keys, in words. Unknown ones are shown as they are.
const FILTER_NAMES: Record<string, string> = {
  km: 'Kilometerstand',
  ez: 'Erstzulassung',
  type: 'Art',
  power: 'Leistung',
  cc: 'Hubraum',
  condition: 'Zustand',
  size: 'Größe',
};

/** A filter Kleinanzeigen applies ("motorraeder_roller.km_i:,30000") in words. */
export function filterText(attribute: string): string {
  const [key, value = ''] = attribute.split(':');
  const raw = key.split('.').pop()!.replace(/_[is]$/, '');
  const name = FILTER_NAMES[raw] ?? raw.replace(/_/g, ' ');
  const [low, high] = value.split(',');
  if (value.includes(',')) {
    if (low && high) return `${name} ${low}–${high}`;
    if (low) return `${name} ab ${low}`;
    if (high) return `${name} bis ${high}`;
  }
  return `${name}: ${value}`;
}
