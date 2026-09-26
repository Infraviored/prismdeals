import { describe, expect, it } from 'vitest';
import { addTarget, conditionText, conditionsById, opsFor, removeTarget, renameTarget, setConditions, sharedAttributes } from '../huntDoc';
import { huntDoc, numberAttr } from '../../test/huntFixtures';
import { translations } from '../../i18n/translations';

const t = ((path: string, params: Record<string, string | number> = {}) => {
  let s = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], translations.de) as string;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{{${k}}}`, String(v));
  return s;
}) as Parameters<typeof conditionText>[1];

describe('huntDoc', () => {
  it('a renamed target loses its node, so the server places it again; conditions and attributes stay', () => {
    const doc = renameTarget(huntDoc(), 0, 'Honda CBR 1000 RR SC57');
    expect(doc.targets[0]).toEqual({ typed: 'Honda CBR 1000 RR SC57', conditions: huntDoc().targets[0].conditions, attributes: [numberAttr] });
    expect(doc.targets[1].node_id).toBe(168);
  });

  it('adds a target once, removes one, sets conditions per target and for all', () => {
    let doc = addTarget(huntDoc(), ' Suzuki GSX-R 1000 ');
    expect(doc.targets.map((x) => x.typed)).toContain('Suzuki GSX-R 1000');
    expect(addTarget(doc, 'suzuki gsx-r 1000').targets).toHaveLength(3);
    doc = removeTarget(doc, 0);
    expect(doc.targets).toHaveLength(2);
    doc = setConditions(doc, null, []);
    expect(doc.conditions).toEqual([]);
    doc = setConditions(doc, 0, [{ label: 'ABS', op: 'present', value: null, importance: 'wish' }]);
    expect(doc.targets[0].conditions[0].label).toBe('ABS');
  });

  it('offers for all only the attributes every target has', () => {
    const doc = huntDoc();
    expect(sharedAttributes(doc.targets)).toEqual([numberAttr]);
    expect(sharedAttributes([...doc.targets, { typed: 'Neu', conditions: [] }])).toEqual([]);
  });

  it('names conditions: the server text, else from label, operator and value', () => {
    expect(conditionText({ label: 'Kilometerstand', op: 'max', value: 5000, importance: 'must', text: 'vom Server' }, t)).toBe('vom Server');
    expect(conditionText({ label: 'Kilometerstand', op: 'max', value: 5000, importance: 'must' }, t)).toBe('Kilometerstand bis 5000');
    expect(conditionText({ label: 'ABS', op: 'absent', value: null, importance: 'must' }, t)).toBe('ohne ABS');
    const marke = { id: 'marke', label: 'Marke', type: 'enum' as const, unit: null, site_filter: null, options: [{ value: 'yamaha', label: 'Yamaha' }] };
    expect(conditionText({ label: 'Marke', op: 'in', value: ['yamaha'], importance: 'must' }, t, marke)).toBe('Marke: Yamaha');
    // Stored as the label (what the adder and the readers write): shown as is.
    expect(conditionText({ label: 'Marke', op: 'in', value: ['Yamaha'], importance: 'must' }, t, marke)).toBe('Marke: Yamaha');
    expect(opsFor('boolean')).toEqual(['present', 'absent']);
  });

  it('indexes every stored condition by id', () => {
    const byId = conditionsById(huntDoc());
    expect([...byId.keys()].sort()).toEqual(['1', '2']);
    expect(conditionsById(null).size).toBe(0);
  });
});
