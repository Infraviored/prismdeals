/**
 * The market of a node: the median, and where offers state what moves the
 * price, a model of it -- so a cheap offer with high mileage is not a deal.
 */
const assert = require('assert');
const { marketOf, judge } = require('./db/market');

// Thirty SC59s: 9,000 € at 0 km, falling with mileage; the same mileage also
// under a second name, and a fact that says nothing about the price.
const observations = [];
for (let i = 0; i < 30; i++) {
  const km = 5000 + i * 2000;
  const noise = 1 + ((i * 7) % 5 - 2) / 100;
  observations.push({
    price: Math.round(9000 * Math.exp(-km / 80000) * noise),
    facts: { km, kilometerstand: km, farbe_code: (i * 13) % 7 },
  });
}
const market = marketOf(observations);
assert.ok(market.model, 'enough offers stating mileage give a price model');
assert.deepStrictEqual(market.model.attrs, ['km'], 'one fact under two names is one factor; noise is none');

// 5,000 € is a deal for a bike with 10,000 km, not for one with 60,000 km.
const low = judge({ price_eur: 5000, facts: { km: 10000 } }, market);
const high = judge({ price_eur: 5000, facts: { km: 60000 } }, market);
assert.ok(low.isDeal && low.usual.by.km === 10000, JSON.stringify(low));
assert.ok(!high.isDeal, JSON.stringify(high));
// An offer that does not state the mileage is judged against the median.
assert.strictEqual(judge({ price_eur: 5000, facts: {} }, market).usual.by, null);

// Few offers: no model, the median decides.
const small = marketOf(observations.slice(0, 8));
assert.strictEqual(small.model, null);
assert.strictEqual(small.count, 8);

console.log('market: all assertions passed');
