/**
 * The chips a row shows (docs/plan-signals.md §6), computed once so the list,
 * the detail sheet, the map and the comparison show the same.
 *
 * yes/no chips: the hunt's yes/no conditions the offer states, by weight --
 *   ABS ✓ (a plus it has), "ohne ABS" (a plus it denies), Unfallschaden (a
 *   minus it has). Unsaid facts get no chip.
 * value chips: what to compare at a glance, chosen per hunt, never per
 *   category -- the attributes the hunt's conditions name, then the facts the
 *   market model prices by, then the values its node's signals proposed.
 */

const MAX_CHIPS = 5;
const MAX_VALUES = 3;
const MAX_TEXT = 24;
const MAX_LABEL = 10;
const PREFIX = 5;

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
function fold(value) {
  return String(value ?? '').toLowerCase().replace(/[äöüß]/g, c => UMLAUTS[c]).replace(/[^a-z0-9]+/g, '');
}

function short(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
}

/** The detail page's own words for an attribute ("21.800 km"), if it states it. */
function detailText(listing, attribute) {
  const want = fold(attribute.label);
  const details = Object.entries(listing.details || {}).map(([key, value]) => [fold(key), value]);
  const exact = details.find(([have]) => have === want);
  if (exact) return String(exact[1]);
  // A prefix only between names long enough to mean the same thing ("Art" is
  // not "Artikelzustand"); the same rule as scraper/graph/readers._detail.
  const prefix = details.find(([have]) => Math.min(have.length, want.length) >= PREFIX
    && (have.startsWith(want) || want.startsWith(have)));
  return prefix ? String(prefix[1]) : null;
}

/** A value says what it is: "21.800 km" by its unit, "April 2009" only with
 * its label in front ("Erstzulas… April 2009" -> first word, shortened). */
function labelled(attribute, text) {
  if (/\d\s*[a-zA-Z€%"″]/.test(text)) return text;
  const word = String(attribute.label).split(/[\s/(]/)[0];
  const label = word.length > MAX_LABEL ? `${word.slice(0, MAX_LABEL - 1)}.` : word;
  return `${label} ${text}`;
}

function valueText(listing, attribute, value) {
  const raw = detailText(listing, attribute);
  if (raw) return short(labelled(attribute, raw));
  if (typeof value === 'number') {
    const n = value.toLocaleString('de-DE');
    return short(attribute.unit ? `${n} ${attribute.unit}` : labelled(attribute, n));
  }
  return short(labelled(attribute, String(value)));
}

/** A must for all targets the site filters by ("Art: Speicher") is in the
 * crawl URL (graph/hunts._site_filters): every offer meets it, so it says
 * nothing about one of them. A scoped must (km for the SC59) still does. */
function sayable(condition, attribute) {
  return !(condition.importance === 'must' && condition.node_id === null && attribute && attribute.site_filter);
}

/**
 * Per target of the hunt: which attributes to show as values, in order.
 * @param hunt      the loaded hunt (conditions with attr_id, node_id)
 * @param attrs     Map target node id -> Map attr id -> attribute
 * @param pricing   Map target node id -> [attr id] the market prices by
 * @param signals   [attr id] of value signals at the targets' common node
 */
function valuePlan(hunt, attrs, pricing, signals) {
  const plan = new Map();
  for (const t of hunt.targets) {
    const own = attrs.get(t.node_id) || new Map();
    const ids = [
      ...hunt.conditions
        .filter(c => (c.node_id === null || c.node_id === t.node_id) && sayable(c, own.get(c.attr_id)))
        .map(c => c.attr_id),
      ...(pricing.get(t.node_id) || []),
      ...signals,
    ].filter(id => own.has(id) && own.get(id).type !== 'boolean');
    plan.set(t.node_id, [...new Set(ids)]);
  }
  return plan;
}

function chipsFor(listing, hunt, attrs, plan) {
  const target = listing.fit?.target_id;
  if (!target) return [];
  const states = listing.fit.states || {};
  const own = attrs.get(target) || new Map();
  const yesno = [];
  for (const c of hunt.conditions) {
    const state = states[c.id];
    const attribute = own.get(c.attr_id);
    if (!state || state === 'open' || !attribute || attribute.type !== 'boolean' || !sayable(c, attribute)) continue;
    const weight = c.importance === 'must' ? 4 : c.weight ?? 2;
    // What the offer states: the thing is there (met for "present") or not.
    const present = (c.op === 'absent') === (state === 'violated');
    const wanted = c.op === 'absent' ? weight < 0 : weight >= 0;
    const tone = weight === 0 ? 'value' : present === wanted ? 'good' : 'bad';
    yesno.push({ text: present ? short(c.label) : `ohne ${short(c.label)}`, tone, kind: 'yesno', rank: Math.abs(weight) });
  }
  yesno.sort((a, b) => b.rank - a.rank);
  const values = [];
  for (const id of plan.get(target) || []) {
    const value = listing.facts?.[id];
    if (value === null || value === undefined || value === '') continue;
    const condition = hunt.conditions.find(c => c.attr_id === id && states[c.id] && states[c.id] !== 'open');
    const tone = !condition ? 'value' : states[condition.id] === 'met' ? 'good' : 'bad';
    values.push({ text: valueText(listing, own.get(id), value), tone, kind: 'value' });
    if (values.length === MAX_VALUES) break;
  }
  return [...values, ...yesno.map(({ text, tone, kind }) => ({ text, tone, kind }))].slice(0, MAX_CHIPS);
}

module.exports = { chipsFor, valuePlan };
