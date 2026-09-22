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
  )
    .then(map => {
      assert.strictEqual(map.size, 0, 'no searches, no references, no query');
      return rejectedListingsStayOutOfTheMedian();
    })
    .then(() => console.log('reference_price: all assertions passed'));
}

// A search for 2x16 GB kits also finds 4x8 GB kits, which the judge rejects.
// They are a different thing at a different price; letting them into the
// median made a matching kit at the usual price look expensive and an ordinary
// one look like a deal.
async function rejectedListingsStayOutOfTheMedian() {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => db.run(sql, params, err => (err ? reject(err) : resolve())));
  const query = (sql, params) =>
    new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

  await run('CREATE TABLE listings (id TEXT PRIMARY KEY, price_eur INTEGER)');
  await run('CREATE TABLE listing_search_hits (listing_id TEXT, search_id INTEGER, first_seen_at TEXT)');
  await run('CREATE TABLE listing_fit (listing_id TEXT, search_id INTEGER, verdict TEXT)');

  // Five matching kits at 150, five rejected four-stick kits at 60.
  const rows = [
    ...[1, 2, 3, 4, 5].map(i => [`fit-${i}`, 150, 'fit']),
    ...[1, 2, 3, 4, 5].map(i => [`four-${i}`, 60, 'no']),
    ['unjudged', 150, null],
  ];
  for (const [id, price, verdict] of rows) {
    await run('INSERT INTO listings VALUES (?, ?)', [id, price]);
    await run("INSERT INTO listing_search_hits VALUES (?, 7, '2026-09-22')", [id]);
    if (verdict) await run('INSERT INTO listing_fit VALUES (?, 7, ?)', [id, verdict]);
  }

  const ref = (await referencePrices(query, [7])).get(7);
  assert.strictEqual(ref.count, 6, 'rejected listings are not counted; unjudged ones are');
  assert.strictEqual(ref.median, 150, 'the median is the price of what is actually hunted');
  db.close();
}

run();
