/**
 * The score: a gate from the must-haves, five graded axes weighed by profile.
 * docs/product-core.md, section 10.
 */
const assert = require('assert');
const { scoreListing } = require('./db/score');

const RAM = 'https://www.kleinanzeigen.de/s-anzeige/kit/3507841883-225-1';
const MOTO = 'https://www.kleinanzeigen.de/s-anzeige/r1/1234567890-305-1';
const FIELDS = [
  { id: 'stickCount', importance: 'high', buyer_wants: { min: 2, max: 2 } },
  { id: 'speedMhz', importance: 'high', buyer_wants: { min: 3200 } },
  { id: 'productLine', importance: 'medium', buyer_wants: { present: true } },
];
const FULL = { stickCount: 2, speedMhz: 3200, productLine: 'vengeance lpx' };

function score(listing, fields = FIELDS) {
  return scoreListing({ url: RAM, images: [1, 2, 3, 4], details: { Zustand: 'Sehr Gut' }, ...listing }, fields);
}

// A stated violation of a must-have is 0, however cheap.
assert.strictEqual(score({ fit: { facts: { ...FULL, stickCount: 4 } }, price_eur: 10, market_median: 150 }).score, 0);

// An open must-have caps the score; it does not zero it.
const full = score({ fit: { facts: FULL }, price_eur: 150, market_median: 150 });
const open = score({ fit: { facts: { stickCount: 2, productLine: 'x' } }, price_eur: 150, market_median: 150 });
assert.ok(open.score > 0, 'open is not rejected');
assert.ok(open.score < full.score, 'open ranks below confirmed at the same price');
assert.deepStrictEqual(open.gate.open.length, 1);
assert.ok(Math.abs(open.gate.factor - 0.75) < 1e-9, 'one open must-have caps at 75 %');
assert.ok(open.score <= Math.round(full.score * 0.75) + 1, 'the cap shows in the score');

// Cheaper against the market is better, other things equal.
const cheap = score({ fit: { facts: FULL }, price_eur: 100, market_median: 150 });
assert.ok(cheap.score > full.score, 'below the median scores higher');

// No market, no invented value grade: the axis drops out.
const nomarket = score({ fit: { facts: FULL }, price_eur: 100, market_median: null });
assert.strictEqual(nomarket.axes.value, null);
assert.ok(nomarket.score > 0);

// A defect stated on the detail page pulls condition down.
const defect = score({ fit: { facts: FULL }, price_eur: 150, market_median: 150, details: { Zustand: 'Defekt' } });
assert.ok(defect.score < full.score);

// The profile decides the weights: for a vehicle, condition outweighs identity.
const motoGood = scoreListing({ url: MOTO, fit: { facts: FULL }, price_eur: 150, market_median: 150, details: { Zustand: 'Sehr Gut' }, images: [1, 2, 3, 4] }, FIELDS);
const motoWorn = scoreListing({ url: MOTO, fit: { facts: FULL }, price_eur: 150, market_median: 150, details: { Zustand: 'In Ordnung' }, images: [1] }, FIELDS);
const ramGood = score({ fit: { facts: FULL }, price_eur: 150, market_median: 150 });
const ramWorn = score({ fit: { facts: FULL }, price_eur: 150, market_median: 150, details: { Zustand: 'In Ordnung' }, images: [1] });
assert.ok(motoGood.score - motoWorn.score > ramGood.score - ramWorn.score, 'condition weighs more for a vehicle than for RAM');

// Without requirements there is no gate and no identity grade, but still a score.
const bare = score({ fit: null, price_eur: 100, market_median: 150 }, []);
assert.ok(bare.score > 0 && bare.axes.identity === null);

// Score reads musts states from latest judge run when present (§9.6)
const fromJudge = score({
  fit: { facts: { stickCount: 2, productLine: 'vengeance lpx' } }, // speedMhz missing in the text
  rank_musts: { stickCount: 'met', speedMhz: 'met' }, // confirmed met by comparative judge run
  price_eur: 150,
  market_median: 150,
});
assert.strictEqual(fromJudge.gate.open.length, 0);
assert.strictEqual(fromJudge.score, full.score);
// A judged violation zeroes like a stated one; "retrofittable" stays open.
assert.strictEqual(score({ fit: { facts: FULL }, rank_musts: { speedMhz: 'violated' }, price_eur: 150, market_median: 150 }).score, 0);
assert.strictEqual(score({ fit: { facts: FULL }, rank_musts: { speedMhz: 'retrofittable' }, price_eur: 150, market_median: 150 }).gate.open.length, 1);

console.log('score: all assertions passed');

