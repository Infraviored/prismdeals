/**
 * The verdict, computed (plan §5). Nothing stores one: a listing's node and
 * facts are read once (scraper/graph/), a hunt is its targets and conditions,
 * and whether the one fits the other is arithmetic on every read. Changing a
 * condition changes every verdict at once, without a re-judge.
 *
 *   - a request ("Suche …") is no offer                         -> no
 *   - a node outside every target: above one (the brand, the
 *     category) is "not recognised", beside one is another model -> unclear / no
 *   - a generation target also holds the listing to its years   -> no when outside
 *   - each condition for the listing's target: must violated -> no, must
 *     unread -> unclear, wish -> score only
 */

const { describe, SLACK_AFTER } = require('./graph');

const YEAR_WORDS = ['jahr', 'baujahr', 'erstzulassung', 'ez'];

// The same folding as scraper/graph/store.fold: "Weiß" and "weiss" are one word.
const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
function fold(value) {
  return String(value ?? '').toLowerCase().replace(/[äöüß]/g, c => UMLAUTS[c]).replace(/[^a-z0-9]+/g, '');
}

function words(value) {
  return String(value ?? '').split(/[^\p{L}\p{N}]+/u).map(fold).filter(Boolean);
}

function asNumber(value) {
  if (typeof value === 'number') return value;
  const m = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/.exec(String(value ?? ''));
  if (!m) return null;
  const text = m[0].includes(',') || /\.\d{3}(\D|$)/.test(m[0])
    ? m[0].replace(/\./g, '').replace(',', '.')
    : m[0];
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** The listing's year: first registration, build or release year. */
function yearOf(facts) {
  for (const [attrId, value] of Object.entries(facts)) {
    if (Number.isInteger(value) && value >= 1950 && value <= 2049 && YEAR_WORDS.some(w => attrId.includes(w))) {
      return value;
    }
  }
  return null;
}

/** met | violated | open for one condition against the facts. */
function stateOf(condition, facts) {
  const value = facts[condition.attr_id];
  // "ohne Defekt": an offer that never mentions a defect has none it states.
  if ((value === null || value === undefined) && condition.op === 'absent') return 'met';
  if (value === null || value === undefined) return 'open';
  const want = condition.value;
  switch (condition.op) {
    case 'min':
    case 'max': {
      const n = asNumber(value);
      if (n === null) return 'open';
      return (condition.op === 'min' ? n >= want : n <= want) ? 'met' : 'violated';
    }
    case 'eq': {
      // "90" against "90 cm": a number is compared as one.
      if (typeof want === 'number') {
        const n = asNumber(value);
        return n === null ? 'open' : n === want ? 'met' : 'violated';
      }
      if (fold(value) === fold(want)) return 'met';
      if (!condition.by_words) return 'violated';
      // Free text by its words: "Bosch Mittelmotor Performance" has what
      // "Bosch Mittelmotor" asks; "Bosch" says less, not otherwise; "Brose"
      // says otherwise.
      const have = words(value);
      const wanted = words(want);
      if (wanted.every(w => have.includes(w))) return 'met';
      return wanted.some(w => have.includes(w)) ? 'open' : 'violated';
    }
    case 'in':
      return want.some(w => fold(w) === fold(value)) ? 'met' : 'violated';
    case 'not_in':
      return want.some(w => fold(w) === fold(value)) ? 'violated' : 'met';
    // Only a read yes or no decides: "Nicht vorhanden" kept as raw text is
    // not an ABS that is there.
    case 'present':
      return typeof value !== 'boolean' ? 'open' : value ? 'met' : 'violated';
    case 'absent':
      return typeof value !== 'boolean' ? 'open' : value ? 'violated' : 'met';
    default:
      return 'open';
  }
}

/** Options that are a run of whole numbers read as a range: "2 / 3 / 4 /
 * Mehr als 4" is "ab 2", "0 / 1 / 2" is "0 bis 2"; anything else null. */
function scale(values) {
  const open = values.length > 1 && !/^\s*\d/.test(values[values.length - 1]) && /\d/.test(values[values.length - 1]);
  const numbers = (open ? values.slice(0, -1) : values).map(v => (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN));
  if (numbers.length < 2 || numbers.some(Number.isNaN) || numbers.some((n, i) => i && n !== numbers[i - 1] + 1)) return null;
  return open ? `ab ${numbers[0]}` : `${numbers[0]} bis ${numbers[numbers.length - 1]}`;
}

/** The condition in words: "Kilometerstand bis 5000", "ohne Defekt". */
function conditionText(c) {
  switch (c.op) {
    case 'min': return `${c.label} ab ${c.value}`;
    case 'max': return `${c.label} bis ${c.value}`;
    case 'eq': return `${c.label}: ${c.value}`;
    case 'in': return scale(c.value) ? `${c.label} ${scale(c.value)}` : `${c.label}: ${c.value.join(' / ')}`;
    case 'not_in': return `${c.label}: nicht ${c.value.join(' / ')}`;
    case 'present': return c.label;
    case 'absent': return `ohne ${c.label}`;
    default: return c.label;
  }
}

/**
 * Prepares a hunt for many verdicts: which targets hold which node, which
 * nodes lie above a target.
 */
function prepare(tree, hunt) {
  const above = new Set();
  for (const t of hunt.targets) {
    tree.ancestors(t.node_id).slice(0, -1).forEach(n => above.add(n.id));
  }
  return { tree, hunt, above, targetIds: new Set(hunt.targets.map(t => t.node_id)) };
}

/**
 * @param prepared  from prepare()
 * @param reading   {node_id, facts} or undefined when the listing is not read yet
 * @returns {{verdict, reason, states, target_id}}
 */
function verdict(prepared, reading) {
  const { tree, hunt, above, targetIds } = prepared;
  const states = {};
  if (!reading || !tree.byId.has(reading.node_id)) {
    return { verdict: 'unclear', reason: 'Noch nicht gelesen', states, target_id: null };
  }
  const facts = reading.facts || {};
  if (facts.is_request === true) {
    return { verdict: 'no', reason: 'Gesuch, kein Angebot', states, target_id: null };
  }
  // Asked, the model said it is no product of this kind (an exhaust, a
  // mattress cover) -- wherever names had put it.
  if (reading.method === 'rejected') {
    return { verdict: 'no', reason: 'Kein gesuchtes Produkt', states, target_id: null };
  }
  const chain = tree.ancestors(reading.node_id);
  // The deepest target the listing's node lies in, else a kind of goods the
  // title names: "Haibike SDURO Trekking" is a Trekking under any brand.
  const target = [...chain].reverse().find(n => targetIds.has(n.id))
    || (facts.named_kinds || []).map(id => tree.byId.get(id)).find(n => n && targetIds.has(n.id));
  if (!target) {
    // A brand or model under a hunted kind's parent, its own kind unsaid.
    const kinds = chain.filter(n => n.kind === 'class');
    const kind = kinds[kinds.length - 1];
    if (hunt.targets.some(t => t.kind === 'class') && (!kind || above.has(kind.id)) && chain.some(n => above.has(n.id))) {
      return { verdict: 'unclear', reason: 'Art nicht erkannt', states, target_id: null };
    }
    // Above the target: names did not say which product.
    return above.has(reading.node_id)
      ? { verdict: 'unclear', reason: 'Modell nicht erkannt', states, target_id: null }
      : { verdict: 'no', reason: `Anderes Modell: ${describe(tree, reading.node_id)}`, states, target_id: null };
  }
  const inChain = new Set([...chain.map(n => n.id), target.id]);

  const violated = [];
  const open = [];
  // A generation holds the listing to its years: a CBR "SC59" from 2015 is not one.
  if (target.kind === 'generation' && target.years_from) {
    const year = yearOf(facts);
    // An open range (the generation still built) has no end to be past.
    const to = target.years_to === null || target.years_to === undefined ? Infinity : target.years_to + SLACK_AFTER;
    if (year !== null && (year < target.years_from || year > to)) {
      violated.push(`Baujahr passt nicht zu ${target.name} (${target.years_from}–${target.years_to ?? 'heute'}): ${year}`);
    }
  }
  for (const c of hunt.conditions) {
    if (c.node_id !== null && !inChain.has(c.node_id)) continue;
    const state = stateOf(c, facts);
    states[c.id] = state;
    if (c.importance !== 'must') continue;
    if (state === 'violated') violated.push(`${conditionText(c)} (${facts[c.attr_id]})`);
    if (state === 'open') open.push(c.label);
  }
  if (violated.length) return { verdict: 'no', reason: violated.join(' · '), states, target_id: target.id };
  if (open.length) return { verdict: 'unclear', reason: `Nicht angegeben: ${open.join(', ')}`, states, target_id: target.id };
  return { verdict: 'fit', reason: '', states, target_id: target.id };
}

module.exports = { prepare, verdict, stateOf, conditionText, yearOf, asNumber };
