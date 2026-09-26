/**
 * The score: a gate from the must conditions, five graded axes weighed by
 * profile, fed by the computed verdict's condition states.
 */
const assert = require('assert');
const { scoreListing } = require('./db/score');
const { stateOf, verdict, prepare } = require('./db/verdict');

const RAM = 'https://www.kleinanzeigen.de/s-anzeige/kit/3507841883-225-1';
const MOTO = 'https://www.kleinanzeigen.de/s-anzeige/r1/1234567890-305-1';
const CONDITIONS = [
  { id: 1, attr_id: 'sticks', label: 'Riegel', op: 'eq', value: 2, importance: 'must' },
  { id: 2, attr_id: 'mhz', label: 'Takt', op: 'min', value: 3200, importance: 'must' },
  { id: 3, attr_id: 'abs', label: 'ABS', op: 'present', value: null, importance: 'wish' },
];
const MET = { 1: 'met', 2: 'met', 3: 'open' };

function score(listing, conditions = CONDITIONS) {
  return scoreListing({ url: RAM, images: [1, 2, 3, 4], details: { Zustand: 'Sehr Gut' }, ...listing }, { conditions });
}
const fit = (states, verdictName = 'fit') => ({ verdict: verdictName, states, target_id: 7 });

// A violated must is 0, however cheap; so is any listing the verdict rules out.
assert.strictEqual(score({ fit: fit({ ...MET, 2: 'violated' }, 'no'), price_eur: 10, market_median: 150 }).score, 0);
assert.strictEqual(score({ fit: { verdict: 'no', states: {}, target_id: null }, price_eur: 10, market_median: 150 }).score, 0);

// An open must caps the score; it does not zero it.
const full = score({ fit: fit(MET), price_eur: 150, market_median: 150 });
const open = score({ fit: fit({ ...MET, 2: 'open' }, 'unclear'), price_eur: 150, market_median: 150 });
assert.ok(open.score > 0 && open.score < full.score);
assert.ok(Math.abs(open.gate.factor - 0.75) < 1e-9, 'one open must caps at 75 %');
// A model not recognised is one open must and leaves both musts open: below
// a recognised offer with one must open. A site-filtered must is met by all.
const unplaced = score({ fit: { verdict: 'unclear', states: {}, target_id: null }, price_eur: 150, market_median: 150 });
assert.ok(Math.abs(unplaced.gate.factor - Math.pow(0.75, 3)) < 1e-9);
assert.ok(unplaced.score < open.score);
const filtered = score({ fit: { verdict: 'unclear', states: {}, target_id: null }, price_eur: 150, market_median: 150 },
  CONDITIONS.map(c => (c.id === 1 ? { ...c, site_filter: true } : c)));
assert.ok(Math.abs(filtered.gate.factor - Math.pow(0.75, 2)) < 1e-9);

// Cheaper against the market is better; no market, no value grade.
assert.ok(score({ fit: fit(MET), price_eur: 100, market_median: 150 }).score > full.score);
assert.strictEqual(score({ fit: fit(MET), price_eur: 100, market_median: null }).axes.value, null);

// The profile decides the weights: for a vehicle, condition outweighs identity.
const worn = { details: { Zustand: 'In Ordnung' }, images: [1] };
const motoGood = scoreListing({ url: MOTO, fit: fit(MET), price_eur: 150, market_median: 150, details: { Zustand: 'Sehr Gut' }, images: [1, 2, 3, 4] }, { conditions: CONDITIONS });
const motoWorn = scoreListing({ url: MOTO, fit: fit(MET), price_eur: 150, market_median: 150, ...worn }, { conditions: CONDITIONS });
const ramWorn = score({ fit: fit(MET), price_eur: 150, market_median: 150, ...worn });
assert.ok(motoGood.score - motoWorn.score > full.score - ramWorn.score);

// A wish lifts the score when met, counts half when unmentioned, nothing when denied.
const withAbs = score({ fit: fit({ ...MET, 3: 'met' }), price_eur: 150, market_median: 150 });
const withoutAbs = score({ fit: fit({ ...MET, 3: 'violated' }), price_eur: 150, market_median: 150 });
assert.ok(withAbs.score > full.score && full.score > withoutAbs.score);
assert.deepStrictEqual(withAbs.wishes.met, ['ABS']);
assert.deepStrictEqual(withoutAbs.wishes.missed, ['ABS']);

// Weights: a strong plus counts more than a weak one; a minus costs when present;
// weight 0 is shown, not scored.
const W = (w) => [{ id: 7, attr_id: 'x', label: 'Scheckheft', op: 'present', value: null, importance: 'wish', weight: w }];
const withW = (w, state) => score({ fit: fit({ 7: state }), price_eur: 150, market_median: 150 }, W(w));
assert.ok(withW(3, 'met').score > withW(3, 'violated').score);
assert.strictEqual(withW(-2, 'met').wishes.missed[0], 'Scheckheft', 'a present minus is missed');
assert.ok(withW(-2, 'met').score < withW(-2, 'open').score, 'a minus costs only when present');
assert.strictEqual(withW(-2, 'open').score, withW(-2, 'violated').score, 'unsaid is as good as absent');
assert.strictEqual(withW(0, 'met').score, withW(0, 'violated').score, 'weight 0 does not score');
// A preferred target counts as one more wish.
const preferring = { conditions: [], targets: [{ node_id: 7, weight: 3 }, { node_id: 8, weight: 0 }] };
const best = scoreListing({ url: RAM, images: [1, 2, 3, 4], fit: { verdict: 'fit', states: {}, target_id: 7 }, price_eur: 150, market_median: 150 }, preferring);
const other = scoreListing({ url: RAM, images: [1, 2, 3, 4], fit: { verdict: 'fit', states: {}, target_id: 8 }, price_eur: 150, market_median: 150 }, preferring);
assert.ok(best.score > other.score, 'the preferred target scores higher');

// States: numbers read from German text, "ohne ABS" is a stated no.
assert.strictEqual(stateOf(CONDITIONS[1], { mhz: '3.600 MHz' }), 'met');
assert.strictEqual(stateOf(CONDITIONS[1], { mhz: 2666 }), 'violated');
assert.strictEqual(stateOf(CONDITIONS[2], { abs: false }), 'violated');
assert.strictEqual(stateOf(CONDITIONS[2], {}), 'open');
assert.strictEqual(stateOf({ attr_id: 'farbe', op: 'in', value: ['Weiß', 'Grau'] }, { farbe: 'weiss' }), 'met');
assert.strictEqual(stateOf({ attr_id: 'farbe', op: 'in', value: ['Weiß', 'Grau'] }, { farbe: 'Schwarz' }), 'violated');
assert.strictEqual(stateOf({ attr_id: 'farbe', op: 'in', value: ['Weiß', 'Grau'] }, { farbe: 'Weiß' }), 'met');

assert.strictEqual(stateOf({ attr_id: 'breite', op: 'eq', value: 90 }, { breite: '90 cm' }), 'met');

// "ohne Defekt" is met by an offer that never mentions a defect.
assert.strictEqual(stateOf({ attr_id: 'defekt', op: 'absent', value: null }, {}), 'met');
assert.strictEqual(stateOf({ attr_id: 'defekt', op: 'absent', value: null }, { defekt: true }), 'violated');
assert.strictEqual(require('./db/verdict').asNumber('1.8'), 1.8);
assert.strictEqual(require('./db/verdict').asNumber('45.000 km'), 45000);

// The verdict on a small tree: brand > model > two generations.
const nodes = [
  { id: 1, parent_id: null, kind: 'category', name: 'Motorräder' },
  { id: 2, parent_id: 1, kind: 'brand', name: 'Honda' },
  { id: 3, parent_id: 2, kind: 'model', name: 'CBR 1000 RR' },
  { id: 4, parent_id: 3, kind: 'generation', name: 'SC57', years_from: 2004, years_to: 2007 },
  { id: 5, parent_id: 3, kind: 'generation', name: 'SC59', years_from: 2008, years_to: 2011 },
];
const byId = new Map(nodes.map(n => [n.id, n]));
const tree = {
  byId,
  ancestors: (id) => {
    const chain = [];
    for (let n = byId.get(id); n; n = n.parent_id ? byId.get(n.parent_id) : null) chain.push(n);
    return chain.reverse();
  },
};
const hunt = {
  targets: [{ node_id: 5 }],
  conditions: [{ id: 9, node_id: 5, attr_id: 'km', label: 'Kilometerstand', op: 'max', value: 5000, importance: 'must' }],
};
const p = prepare(tree, hunt);
assert.strictEqual(verdict(p, { node_id: 5, facts: { km: 4200 } }).verdict, 'fit');
assert.strictEqual(verdict(p, { node_id: 5, facts: { km: 21000 } }).verdict, 'no');
assert.strictEqual(verdict(p, { node_id: 5, facts: {} }).verdict, 'unclear');
assert.match(verdict(p, { node_id: 4, facts: {} }).reason, /Anderes Modell: Honda CBR 1000 RR SC57/);
assert.strictEqual(verdict(p, { node_id: 3, facts: {} }).reason, 'Modell nicht erkannt');
assert.strictEqual(verdict(p, { node_id: 3, method: 'rejected', facts: {} }).verdict, 'no');
assert.strictEqual(verdict(p, { node_id: 3, method: 'model', facts: {} }).verdict, 'unclear');
// On the target by name, asked: a cover, not the product.
assert.strictEqual(verdict(p, { node_id: 5, method: 'rejected', facts: { km: 100 } }).verdict, 'no');
assert.match(verdict(p, { node_id: 5, facts: { km: 100, erstzulassung: 2015 } }).reason, /Baujahr passt nicht zu SC59 \(2008–2011\): 2015/);
assert.strictEqual(verdict(p, { node_id: 5, facts: { km: 100, is_request: true } }).verdict, 'no');
assert.strictEqual(verdict(p, undefined).reason, 'Noch nicht gelesen');

{
  // A name sharing the last words above is written once.
  const { describe } = require('./db/graph');
  const nodes = new Map([
    [1, { id: 1, parent_id: null, kind: 'category', name: 'Konsolen' }],
    [2, { id: 2, parent_id: 1, kind: 'family', name: 'Sony PlayStation' }],
    [3, { id: 3, parent_id: 2, kind: 'model', name: 'PlayStation 5' }],
  ]);
  const t = {
    byId: nodes,
    ancestors: (id) => {
      const chain = [];
      for (let n = nodes.get(id); n; n = n.parent_id ? nodes.get(n.parent_id) : null) chain.push(n);
      return chain.reverse();
    },
  };
  assert.strictEqual(describe(t, 3), 'Sony PlayStation 5');
}

{
  // A kind the title names is the target under any brand; a brand beside the
  // hunted kind with no kind said is unclear, another kind is no.
  const nodes = new Map([
    [1, { id: 1, parent_id: null, kind: 'category', name: 'Fahrräder' }],
    [2, { id: 2, parent_id: 1, kind: 'class', name: 'E-Bike' }],
    [3, { id: 3, parent_id: 2, kind: 'class', name: 'Trekking' }],
    [4, { id: 4, parent_id: 2, kind: 'class', name: 'City' }],
    [5, { id: 5, parent_id: 2, kind: 'brand', name: 'Haibike' }],
  ]);
  const t = { byId: nodes, ancestors: (id) => { const c = []; for (let n = nodes.get(id); n; n = n.parent_id ? nodes.get(n.parent_id) : null) c.push(n); return c.reverse(); } };
  const h = { targets: [{ node_id: 3, kind: 'class' }], conditions: [
    { id: 1, node_id: null, attr_id: 'motor', label: 'Motor', op: 'eq', value: 'Bosch Mittelmotor', importance: 'must', by_words: true },
  ] };
  const q = prepare(t, h);
  assert.strictEqual(verdict(q, { node_id: 5, facts: { named_kinds: [3], motor: 'Bosch Mittelmotor CX' } }).verdict, 'fit');
  assert.strictEqual(verdict(q, { node_id: 5, facts: {} }).reason, 'Art nicht erkannt');
  assert.match(verdict(q, { node_id: 4, facts: {} }).reason, /Anderes Modell/);
  assert.strictEqual(verdict(q, { node_id: 3, facts: { motor: 'Bosch' } }).verdict, 'unclear');
  assert.strictEqual(verdict(q, { node_id: 3, facts: { motor: 'Brose' } }).verdict, 'no');
}

console.log('score: all assertions passed');
