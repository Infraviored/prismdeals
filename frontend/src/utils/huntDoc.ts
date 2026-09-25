import type { Attribute, Condition, HuntDocument, Op, Target } from '../types/hunt';
import type { TranslateFn } from './freshness';

/** Changes to a hunt document. Pure: each returns a new document. */

export function addTarget(doc: HuntDocument, typed: string): HuntDocument {
  const clean = typed.trim();
  if (!clean || doc.targets.some((t) => (t.name || t.typed).toLowerCase() === clean.toLowerCase())) return doc;
  return { ...doc, targets: [...doc.targets, { typed: clean, conditions: [] }] };
}

export function removeTarget(doc: HuntDocument, index: number): HuntDocument {
  return { ...doc, targets: doc.targets.filter((_, i) => i !== index) };
}

/** A renamed target is a new place in the graph: the server places it again. */
export function renameTarget(doc: HuntDocument, index: number, typed: string): HuntDocument {
  return {
    ...doc,
    targets: doc.targets.map((t, i) =>
      i === index ? { typed, conditions: t.conditions } : t
    ),
  };
}

/** `index` null: the conditions for all targets. */
export function setConditions(doc: HuntDocument, index: number | null, conditions: Condition[]): HuntDocument {
  if (index === null) return { ...doc, conditions };
  return { ...doc, targets: doc.targets.map((t, i) => (i === index ? { ...t, conditions } : t)) };
}

/** The attributes every target shares: what a condition for all can read. */
export function sharedAttributes(targets: Target[]): Attribute[] {
  const lists = targets.map((t) => t.attributes || []);
  if (lists.length === 0 || lists.some((l) => l.length === 0)) return [];
  return lists[0].filter((a) => lists.every((l) => l.some((b) => b.id === a.id)));
}

/** Every stored condition by id, for reading a listing's `fit.states`. */
export function conditionsById(doc: HuntDocument | null): Map<string, Condition> {
  const out = new Map<string, Condition>();
  if (!doc) return out;
  for (const c of [...doc.targets.flatMap((t) => t.conditions), ...doc.conditions]) {
    if (c.id !== undefined) out.set(String(c.id), c);
  }
  return out;
}

/** The operators that make sense for an attribute type. */
export function opsFor(type: Attribute['type']): Op[] {
  switch (type) {
    case 'number':
      return ['max', 'min', 'eq'];
    case 'enum':
      return ['in', 'not_in'];
    case 'boolean':
      return ['present', 'absent'];
    default:
      return ['present', 'absent', 'eq'];
  }
}

function valueText(value: Condition['value'], attribute?: Attribute): string {
  const labelOf = (v: string) => attribute?.options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(labelOf).join(', ');
  if (value === null || value === undefined) return '';
  return labelOf(String(value));
}

/** "Kilometerstand bis 5000". The server's text when it has one; a condition
 * edited here has none until it is saved. */
export function conditionText(c: Condition, t: TranslateFn, attribute?: Attribute): string {
  if (c.text) return c.text;
  const unit = attribute?.unit ? ` ${attribute.unit}` : '';
  const value = valueText(c.value, attribute) + unit;
  return t(`huntEdit.op_${c.op}` as Parameters<TranslateFn>[0], { label: c.label, value });
}
