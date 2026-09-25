const assert = require('assert');
const { listingOrder } = require('./listing_order');

const rows = [
  { id: 'a', price_eur: 20, score: 50, distance_km: 5, detour_min: 12, fit: { verdict: 'unclear' } },
  { id: 'b', price_eur: 5, score: 80, distance_km: null, detour_min: 3, fit: { verdict: 'fit' } },
  { id: 'c', price_eur: null, score: null, distance_km: 2, detour_min: null, fit: { verdict: 'fit' } },
];
const ids = (sort, onRoute = false) => {
  const order = listingOrder(sort, onRoute);
  return (order ? [...rows].sort(order) : rows).map(r => r.id).join('');
};

assert.strictEqual(ids('price_asc'), 'bac', 'no price last');
assert.strictEqual(ids('price_desc'), 'abc');
assert.strictEqual(ids('score'), 'bac', 'unscored last');
assert.strictEqual(ids('near'), 'cab', 'town distance, unplaced last');
assert.strictEqual(ids('near', true), 'bac', 'detour on a corridor');
assert.strictEqual(ids(undefined), 'abc', 'base order kept');
assert.strictEqual(ids(undefined, true), 'bca', 'corridor default: fit first, then detour');
console.log('test_listing_order: all passed');
