/**
 * Chips: values first, then yes/no by weight; only what the offer states.
 */
const assert = require('assert');
const { chipsFor, valuePlan } = require('./db/chips');

const attrs = new Map([[5, new Map([
  ['abs', { id: 'abs', label: 'ABS', type: 'boolean' }],
  ['unfall', { id: 'unfall', label: 'Unfallschaden', type: 'boolean' }],
  ['farbe', { id: 'farbe', label: 'Farbe', type: 'boolean' }],
  ['km', { id: 'km', label: 'Kilometerstand', type: 'number', unit: null }],
  ['ram', { id: 'ram', label: 'Arbeitsspeicher', type: 'number', unit: 'GB' }],
])]]);
const hunt = {
  targets: [{ node_id: 5 }],
  conditions: [
    { id: 1, node_id: null, attr_id: 'abs', label: 'ABS', op: 'present', importance: 'wish', weight: 2 },
    { id: 2, node_id: null, attr_id: 'unfall', label: 'Unfallschaden', op: 'present', importance: 'wish', weight: -3 },
    { id: 3, node_id: 5, attr_id: 'km', label: 'Kilometerstand', op: 'max', value: 30000, importance: 'must', weight: 0 },
    { id: 4, node_id: null, attr_id: 'farbe', label: 'Farbe', op: 'present', importance: 'wish', weight: 1 },
  ],
};
const plan = valuePlan(hunt, attrs, new Map([[5, ['ram']]]), []);
assert.deepStrictEqual(plan.get(5), ['km', 'ram'], 'condition attributes first, then pricing facts; no booleans');

const listing = {
  details: { Kilometerstand: '21.800 km' },
  facts: { km: 21800, ram: 16, abs: true, unfall: true },
  fit: { verdict: 'no', target_id: 5, states: { 1: 'met', 2: 'met', 3: 'met', 4: 'open' } },
};
assert.deepStrictEqual(chipsFor(listing, hunt, attrs, plan), [
  { text: '21.800 km', tone: 'good', kind: 'value' },
  { text: '16 GB', tone: 'value', kind: 'value' },
  { text: 'Unfallschaden', tone: 'bad', kind: 'yesno' },
  { text: 'ABS', tone: 'good', kind: 'yesno' },
]);
// A denied plus reads "ohne ABS"; a denied minus is good news.
listing.fit.states = { 1: 'violated', 2: 'violated', 3: 'met', 4: 'open' };
const denied = chipsFor(listing, hunt, attrs, plan).slice(2);
assert.deepStrictEqual(denied, [{ text: 'ohne Unfallschaden', tone: 'good', kind: 'yesno' }, { text: 'ohne ABS', tone: 'bad', kind: 'yesno' }]);
// No target, no chips.
assert.deepStrictEqual(chipsFor({ fit: { target_id: null } }, hunt, attrs, plan), []);
console.log('chips: all assertions passed');
// A site-filtered must ("Art: Speicher") holds for every offer: no chip.
const art = new Map([[5, new Map([...attrs.get(5), ['art', { id: 'art', label: 'Art', type: 'enum', site_filter: 'x.art_s' }]])]]);
const withArt = { ...hunt, conditions: [...hunt.conditions, { id: 9, node_id: null, attr_id: 'art', label: 'Art', op: 'eq', value: 'Speicher', importance: 'must', weight: 0 }] };
assert.ok(!valuePlan(withArt, art, new Map(), []).get(5).includes('art'));
// A value without a unit says what it is.
const ez = new Map([[5, new Map([['ez', { id: 'ez', label: 'Erstzulassung', type: 'number' }]])]]);
const ezHunt = { targets: [{ node_id: 5 }], conditions: [] };
assert.deepStrictEqual(
  chipsFor({ details: { Erstzulassung: 'April 2009' }, facts: { ez: 2009 }, fit: { target_id: 5, states: {} } }, ezHunt, ez, new Map([[5, ['ez']]])),
  [{ text: 'Erstzulas. April 2009', tone: 'value', kind: 'value' }]
);
console.log('chips: extra assertions passed');
