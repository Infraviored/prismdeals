const assert = require('assert');
const { judge, referencePrices, MIN_GROUP_SIZE } = require('./db/reference_price');

// A market with a clear cheap end: a dozen listings around 150, one at 40.
const BUSY = { median: 150, cheapest: 60, count: 40 };

function run() {
  // A deal is cheap in its rank, cheap against the usual price, and saves
  // enough to be worth the drive. All three, not any one.
  let verdict = judge(45, BUSY);
  assert.strictEqual(verdict.isDeal, true, '45 against a 150 median is a deal');
  assert.strictEqual(verdict.delta, 105, 'the saving is the distance to the median');

  // Ranks in the cheap fifth but is not actually cheap: 60 <= 60, yet
  // 60 > 150 * 0.7 is false -- so this one passes. Take one just above the
  // ratio instead to prove the guard bites.
  assert.strictEqual(
    judge(110, { median: 150, cheapest: 120, count: 40 }).isDeal,
    false,
    'ranking cheap is not enough when the price is near the usual one'
  );

  // A tight market: everything costs about the same, so nothing stands out
  // however it ranks. This is the case the percentile alone gets wrong -- it
  // would always mark a twentieth of any list.
  assert.strictEqual(
    judge(98, { median: 100, cheapest: 98, count: 200 }).isDeal,
    false,
    'in a market where every price is alike, no price is a deal'
  );

  // Cheap in every relative sense, but three euros is not a reason to drive.
  assert.strictEqual(
    judge(5, { median: 18, cheapest: 6, count: 40 }).isDeal,
    false,
    'a saving under the absolute floor is not a deal'
  );

  // Too few prices to know what a thing costs.
  assert.strictEqual(
    judge(10, { median: 100, cheapest: 10, count: MIN_GROUP_SIZE - 1 }).isDeal,
    false,
    'three prices do not describe a market'
  );

  // Listings without a usable price are never deals, and never crash.
  for (const price of [null, undefined, 0, -5, 'billig']) {
    assert.strictEqual(judge(price, BUSY).isDeal, false, `no verdict for ${price}`);
  }
  assert.strictEqual(judge(45, undefined).isDeal, false, 'no reference, no verdict');

  // The query asks for nothing when there is nothing to ask about, rather than
  // building an SQL statement with an empty IN ().
  referencePrices(
    () => {
      throw new Error('should not have queried');
    },
    []
  ).then(map => {
    assert.strictEqual(map.size, 0, 'no searches, no references, no query');
    console.log('reference_price: all assertions passed');
  });
}

run();
