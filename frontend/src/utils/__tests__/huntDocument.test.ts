import { describe, it, expect } from 'vitest';
import { applyDocument, buildDocument, resolveScopes, filterText, wantText } from '../huntDocument';
import type { SearchFamilyTerm } from '../../types';

const TERMS: SearchFamilyTerm[] = [
  { id: 11, term: 'yamaha-r1', label: 'Yamaha R1 RN19', enabled: true },
  { id: 12, term: 'honda-cbr-1000-rr', label: 'Honda CBR 1000 RR', enabled: true },
];
const ABS = { id: 'own_abs', label: 'ABS', importance: 'low', own: true, buyer_wants: { present: true } };

describe('huntDocument', () => {
  it('shows a scoped requirement under its model, the rest for all', () => {
    const km = { id: 'own_km__honda', label: 'Kilometerstand km', buyer_wants: { max: 5000 }, applies_to: [12] };
    const doc = buildDocument('Bikes', TERMS, 7000, 200, [ABS, km]);
    expect(doc.requirements.map((r) => r.id)).toEqual(['own_abs']);
    expect(doc.models[0].requirements).toEqual([]);
    expect(doc.models[1].requirements[0]).not.toHaveProperty('applies_to');
    expect(doc.models[1].requirements[0].label).toBe('Kilometerstand km');
  });

  it('a generation added to a model keeps its search and scopes its wish', () => {
    const doc = buildDocument('Bikes', TERMS, 7000, 200, [ABS]);
    doc.models[1] = {
      name: 'Honda CBR 1000 RR SC59',
      requirements: [{ id: 'own_kilometerstand_km', label: 'Kilometerstand km', importance: 'high', buyer_wants: { max: 5000 } }],
    };
    const next = applyDocument(doc, TERMS);
    expect(next.terms[1]).toMatchObject({ id: 12, term: 'honda-cbr-1000-rr', label: 'Honda CBR 1000 RR SC59' });
    const km = next.requirements.find((r) => r.label === 'Kilometerstand km')!;
    expect(km.id).toBe('own_kilometerstand_km__honda_cbr_1000_rr_sc59');
    expect(resolveScopes(next.requirements, next.terms).find((r) => r.id === km.id)).toMatchObject({ applies_to: [12] });
    expect(resolveScopes(next.requirements, next.terms).find((r) => r.id === km.id)).not.toHaveProperty('applies_to_names');
  });

  it('a new model gets a new term', () => {
    const doc = buildDocument('Bikes', TERMS, null, null, []);
    doc.models.push({ name: 'Suzuki GSX-R 1000 K5', requirements: [] });
    const next = applyDocument(doc, TERMS);
    expect(next.terms[2]).toEqual({ term: 'suzuki-gsx-r-1000', label: 'Suzuki GSX-R 1000 K5', enabled: true });
  });

  it('reads a site filter', () => {
    expect(filterText('motorraeder_roller.km_i:,30000')).toBe('Kilometerstand bis 30000');
    expect(filterText('motorraeder_roller.ez_i:2005,')).toBe('Erstzulassung ab 2005');
    expect(filterText('motorraeder_roller.type_s:motorrad')).toBe('Art: motorrad');
  });

  it('puts the unit after the number', () => {
    const km = { id: 'k', label: 'Kilometerstand km', importance: 'high', buyer_wants: { max: 5000 } };
    expect(wantText(km, { must: 'Muss', wish: 'Wunsch', absent: 'nicht vorhanden' })).toBe('Kilometerstand bis 5.000 km · Muss');
  });
});
