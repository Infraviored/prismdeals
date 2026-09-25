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

function fold(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');
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
  if (value === null || value === undefined) return 'open';
  const want = condition.value;
  switch (condition.op) {
    case 'min':
    case 'max': {
      const n = asNumber(value);
      if (n === null) return 'open';
      return (condition.op === 'min' ? n >= want : n <= want) ? 'met' : 'violated';
    }
    case 'eq':
      return fold(value) === fold(want) ? 'met' : 'violated';
    case 'in':
      return want.some(w => fold(w) === fold(value)) ? 'met' : 'violated';
    case 'not_in':
      return want.some(w => fold(w) === fold(value)) ? 'violated' : 'met';
    case 'present':
      return value === false ? 'violated' : 'met';
    case 'absent':
      return value === false ? 'met' : 'violated';
    default:
      return 'open';
  }
}

/** The condition in words: "Kilometerstand bis 5000", "ohne Defekt". */
function conditionText(c) {
  switch (c.op) {
    case 'min': return `${c.label} ab ${c.value}`;
    case 'max': return `${c.label} bis ${c.value}`;
    case 'eq': return `${c.label}: ${c.value}`;
    case 'in': return `${c.label}: ${c.value.join(' / ')}`;
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
  const chain = tree.ancestors(reading.node_id);
  // The deepest target the listing's node lies in.
  const target = [...chain].reverse().find(n => targetIds.has(n.id));
  if (!target) {
    return above.has(reading.node_id)
      ? { verdict: 'unclear', reason: 'Modell nicht erkannt', states, target_id: null }
      : { verdict: 'no', reason: `Anderes Modell: ${describe(tree, reading.node_id)}`, states, target_id: null };
  }
  const inChain = new Set(chain.map(n => n.id));

  const violated = [];
  const open = [];
  // A generation holds the listing to its years: a CBR "SC59" from 2015 is not one.
  if (target.kind === 'generation' && target.years_from) {
    const year = yearOf(facts);
    const to = (target.years_to || target.years_from) + SLACK_AFTER;
    if (year !== null && (year < target.years_from || year > to)) {
      violated.push(`Baujahr ${year} passt nicht zu ${target.name} (${target.years_from}–${target.years_to || target.years_from})`);
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
