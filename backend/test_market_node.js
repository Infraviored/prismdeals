/**
 * Tests for P8: Market per node.
 * docs/product-core.md §7, plan-hunt-engine.md §11.
 */

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const {
  isMarketExcluded,
  nodeChain,
  medianOf,
  nodeMedians,
  resolveNode,
  normalizeNodePart,
  formatMarketBasis,
  humanNodeLabel,
  valueDrivers,
  annotateNodeMarket,
  MIN_NODE_SAMPLE,
} = require('./db/market_node');
const { scoreListing } = require('./db/score');

async function runTests() {
  console.log('--- 1. Exclusion Tests ---');
  // Zustand 'Defekt' is excluded
  assert.strictEqual(isMarketExcluded({ details: { Zustand: 'Defekt' } }), true);
  assert.strictEqual(isMarketExcluded({ details: { zustand: 'defekt' } }), true);
  assert.strictEqual(isMarketExcluded({ details: { Zustand: 'Sehr Gut' } }), false);

  // Keyword exclusions in title
  assert.strictEqual(isMarketExcluded({ title: 'MacBook Pro 15 defekt an Bastler' }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Yamaha R1 Bastlerfahrzeug ohne Motor' }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Lenovo T480 Display kaputt' }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Ersatzteil spender Laptop' }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Laptop gesucht z.B. Dell' }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Suche Yamaha R1 RN19' }), true);

  // The description does not count: "keine Defekte" is the opposite.
  assert.strictEqual(isMarketExcluded({ title: 'Corsair 2x16GB', short_description: 'Top Zustand, keine Defekte' }), false);
  // A verdict is the hunt's, not the product's.
  assert.strictEqual(isMarketExcluded({ title: 'Corsair 4x8GB', fit: { verdict: 'no' } }), false);

  // Non-positive price
  assert.strictEqual(isMarketExcluded({ title: 'Lenovo', price_eur: 0 }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Lenovo', price_eur: -5 }), true);
  assert.strictEqual(isMarketExcluded({ title: 'Lenovo', price_eur: 150 }), false);

  console.log('--- 2. Node Chain Tests ---');
  assert.deepStrictEqual(nodeChain('motorrad/yamaha/r1'), ['motorrad/yamaha/r1', 'motorrad/yamaha', 'motorrad']);
  assert.deepStrictEqual(nodeChain('ram/ddr4/2x16gb'), ['ram/ddr4/2x16gb', 'ram/ddr4', 'ram']);
  assert.deepStrictEqual(nodeChain('laptops'), ['laptops']);
  assert.deepStrictEqual(nodeChain(''), []);
  assert.deepStrictEqual(nodeChain(null), []);

  console.log('--- 3. MedianOf Tests ---');
  assert.deepStrictEqual(medianOf([100, 200, 300]), { median: 200, count: 3 });
  assert.deepStrictEqual(medianOf([100, 200, 300, 400]), { median: 250, count: 4 });
  assert.deepStrictEqual(medianOf([150]), { median: 150, count: 1 });
  assert.strictEqual(medianOf([]), null);
  assert.strictEqual(medianOf([0, -10, NaN]), null);
  assert.deepStrictEqual(medianOf([300, 100, 200]), { median: 200, count: 3 }, 'sorts automatically');

  console.log('--- 4. Node Resolution Tests ---');
  // Cars
  assert.deepStrictEqual(
    resolveNode({}, { criteria: { make: { value: 'BMW' }, model: { value: '320d' } } }, 'vehicles/cars', null, null),
    { node_key: 'auto/bmw/320d', source: 'identity' }
  );
  // Motorcycles
  assert.deepStrictEqual(
    resolveNode({}, { criteria: { make: 'Yamaha', model: 'YZF-R1' } }, 'vehicles/motorcycles', null, null),
    { node_key: 'motorrad/yamaha/yzf-r1', source: 'identity' }
  );
  // Laptops
  assert.deepStrictEqual(
    resolveNode({}, { criteria: { brand: { value: 'Lenovo' }, modelName: { value: 'ThinkPad T14' } } }, 'electronics/laptops', null, null),
    { node_key: 'laptop/lenovo/thinkpad-t14', source: 'identity' }
  );
  // RAM with nested value objects
  assert.deepStrictEqual(
    resolveNode(
      {},
      { criteria: { generation: { value: 'ddr4' }, stickCount: { value: 2 }, gbPerStick: { value: 16 } } },
      'computing/memory',
      null,
      null
    ),
    { node_key: 'ram/ddr4/2x16gb', source: 'playbook' }
  );
  // RAM with plain values
  assert.deepStrictEqual(
    resolveNode(
      {},
      { criteria: { generation: 'ddr5', stickCount: 4, gbPerStick: 8 } },
      'computing/memory',
      null,
      null
    ),
    { node_key: 'ram/ddr5/4x8gb', source: 'playbook' }
  );
  // Rank node overrides identity/playbook
  assert.deepStrictEqual(
    resolveNode(
      {},
      { criteria: { brand: 'Lenovo', modelName: 'ThinkPad' } },
      'electronics/laptops',
      'laptop/lenovo/thinkpad-x1-carbon-gen-9',
      null
    ),
    { node_key: 'laptop/lenovo/thinkpad-x1-carbon-gen-9', source: 'rank' }
  );
  // A comparison node in other words than the model term is not used:
  // "motorcycle/..." left the CBR market for every motorcycle's.
  assert.deepStrictEqual(
    resolveNode({}, null, null, 'motorcycle/honda/cbr1000rr', 'modell/honda-cbr-1000-rr'),
    { node_key: 'modell/honda-cbr-1000-rr', source: 'hunt' }
  );
  // It stands in for a bare hunt name.
  assert.deepStrictEqual(
    resolveNode({}, null, null, 'ventilator/honeywell', 'ventilator-hunt'),
    { node_key: 'ventilator/honeywell', source: 'rank' }
  );
  // Hunt fallback
  assert.deepStrictEqual(
    resolveNode({}, null, null, null, 'laptops-muc'),
    { node_key: 'laptops-muc', source: 'hunt' }
  );

  console.log('--- 5. Human Labels and German Breakdown Text ---');
  assert.strictEqual(humanNodeLabel('motorrad/yamaha/r1'), 'eine Yamaha R1');
  assert.strictEqual(humanNodeLabel('auto/bmw/320d'), 'ein Bmw 320d');
  assert.strictEqual(humanNodeLabel('laptop/asus/zenbook-14-oled'), 'ein Asus Zenbook 14 Oled');
  assert.strictEqual(humanNodeLabel('ram/ddr4/2x16gb'), 'DDR4 2X16GB RAM');
  assert.strictEqual(humanNodeLabel('scope'), '');

  // Exact phrase from task specification:
  const specText = formatMarketBasis(12, { median: 5500, count: 23, basis: 'motorrad/yamaha/r1' });
  assert.strictEqual(specText, '12 % unter dem üblichen Preis für eine Yamaha R1 (23 Angebote)');

  const aboveText = formatMarketBasis(-5, { median: 100, count: 18, basis: 'ram/ddr4/2x16gb' });
  assert.strictEqual(aboveText, '5 % über dem üblichen Preis für DDR4 2X16GB RAM (18 Angebote)');

  const scopeText = formatMarketBasis(10, { median: 150, count: 50, basis: 'scope' });
  assert.strictEqual(scopeText, '10 % unter dem üblichen Preis (50 Angebote)');

  console.log('--- 6. SQLite Fallback Chain and Exclusion Tests ---');
  const db = new sqlite3.Database(':memory:');
  const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });

    const exec = sql =>
      new Promise((resolve, reject) => {
        db.exec(sql, err => (err ? reject(err) : resolve()));
      });

    await exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        title TEXT,
        short_description TEXT,
        details TEXT,
        price_eur REAL
      );
      CREATE TABLE listing_nodes (
        listing_id TEXT PRIMARY KEY,
        node_key TEXT,
        source TEXT,
        computed_at TEXT
      );
      CREATE TABLE listing_fit (
        listing_id TEXT,
        search_id INTEGER,
        verdict TEXT,
        requirements_hash TEXT
      );
      CREATE TABLE listing_search_hits (
        listing_id TEXT,
        search_id INTEGER
      );
      CREATE TABLE searches (
        id INTEGER PRIMARY KEY,
        knowledge_set_id INTEGER
      );
      CREATE TABLE knowledge_sets (
        id INTEGER PRIMARY KEY,
        requirements_hash TEXT
      );
      CREATE TABLE fact_sheets (
        listing_id TEXT PRIMARY KEY,
        facts_json TEXT
      );
    `);
    await run(`INSERT INTO searches VALUES (100, 1)`);
    await run(`INSERT INTO knowledge_sets VALUES (1, 'hash1')`);

  // Insert 6 clean listings for ram/ddr4/2x16gb (prices: 100, 110, 120, 130, 140, 150)
  for (let i = 1; i <= 6; i++) {
    await run(`INSERT INTO listings VALUES (?, ?, '', '{}', ?)`, [`ram1_${i}`, `RAM ${i}`, 90 + i * 10]);
    await run(`INSERT INTO listing_nodes VALUES (?, 'ram/ddr4/2x16gb', 'playbook', '2026-09-25')`, [`ram1_${i}`]);
    await run(`INSERT INTO listing_search_hits VALUES (?, 100)`, [`ram1_${i}`]);
  }

  // Insert 1 defect listing with price 20 € (must be excluded from median!)
  await run(`INSERT INTO listings VALUES ('ram_def', 'RAM defekt fuer Bastler', '', '{"Zustand":"Defekt"}', 20)`);
  await run(`INSERT INTO listing_nodes VALUES ('ram_def', 'ram/ddr4/2x16gb', 'playbook', '2026-09-25')`);
  await run(`INSERT INTO listing_search_hits VALUES ('ram_def', 100)`);

  // Insert 2 clean listings for ram/ddr4/4x8gb (prices: 80, 90) -> count 2 < MIN_NODE_SAMPLE (5)
  for (let i = 1; i <= 2; i++) {
    await run(`INSERT INTO listings VALUES (?, ?, '', '{}', ?)`, [`ram2_${i}`, `RAM 4x8 ${i}`, 70 + i * 10]);
    await run(`INSERT INTO listing_nodes VALUES (?, 'ram/ddr4/4x8gb', 'playbook', '2026-09-25')`, [`ram2_${i}`]);
    await run(`INSERT INTO listing_search_hits VALUES (?, 100)`, [`ram2_${i}`]);
  }

  // Query medians
  const medians = await nodeMedians(query, ['ram/ddr4/2x16gb', 'ram/ddr4/4x8gb'], [100]);

  // Exact node ram/ddr4/2x16gb: has 6 clean listings (>= 5), median of [100, 110, 120, 130, 140, 150] is (120+130)/2 = 125
  const m1 = medians.get('ram/ddr4/2x16gb');
  assert.ok(m1, 'found median for 2x16gb');
  assert.strictEqual(m1.median, 125, 'defect 20 EUR was excluded');
  assert.strictEqual(m1.count, 6);
  assert.strictEqual(m1.basis_type, 'node');

  // ram/ddr4/4x8gb has 2 listings, falls back to parent 'ram/ddr4' which has 6 + 2 = 8 listings!
  const m2 = medians.get('ram/ddr4/4x8gb');
  assert.ok(m2, 'found median for 4x8gb via fallback');
  assert.strictEqual(m2.basis, 'ram/ddr4');
  assert.strictEqual(m2.basis_type, 'parent');
  assert.strictEqual(m2.count, 8);

  // An unknown node with no parent should fall back to scope median
  const mScope = await nodeMedians(query, ['unknown/rare/thing'], [100]);
  const m3 = mScope.get('unknown/rare/thing');
  assert.ok(m3, 'found scope fallback');
  assert.strictEqual(m3.basis, 'scope');
  assert.strictEqual(m3.basis_type, 'scope');
  assert.strictEqual(m3.count, 8);

  console.log('--- 7. Score Integration with Node Median ---');
  const listing = {
    id: 'l1',
    url: 'https://www.kleinanzeigen.de/s-anzeige/yamaha-r1/123-305-1',
    price_eur: 4840, // 12% below 5500
    images: [1, 2, 3, 4],
    details: { Zustand: 'Sehr Gut' },
    fit: { facts: {} },
    market_median: 5500,
    market_basis: { median: 5500, count: 23, basis: 'motorrad/yamaha/r1', basis_type: 'node' },
  };

  const scored = scoreListing(listing, []);
  assert.ok(scored.score > 0);
  assert.ok(scored.axes.value > 0.5, 'price below node median yields value grade > 0.5');
  assert.ok(scored.market_basis, 'scoreListing returns market_basis');
  assert.strictEqual(scored.market_basis.basis, 'motorrad/yamaha/r1');

  console.log('--- 8. Value Drivers ---');
  // With 0 rows, valueDrivers returns null (< 30)
  const vdNull = await valueDrivers(query, 'motorrad/yamaha/r1');
  assert.strictEqual(vdNull, null);

  // Insert 30 listings with years: 15 for 2015, 15 for 2020
  for (let i = 1; i <= 15; i++) {
    const id = `moto_2015_${i}`;
    await run(`INSERT INTO listings VALUES (?, 'Yamaha R1 2015', '', '{}', 6000)`, [id]);
    await run(`INSERT INTO listing_nodes VALUES (?, 'motorrad/yamaha/r1', 'identity', '2026-09-25')`, [id]);
    await run(`INSERT INTO fact_sheets VALUES (?, '{"criteria":{"firstRegistrationYear":{"value":2015}}}')`, [id]);
  }
  for (let i = 1; i <= 15; i++) {
    const id = `moto_2020_${i}`;
    await run(`INSERT INTO listings VALUES (?, 'Yamaha R1 2020', '', '{}', 9000)`, [id]);
    await run(`INSERT INTO listing_nodes VALUES (?, 'motorrad/yamaha/r1', 'identity', '2026-09-25')`, [id]);
    await run(`INSERT INTO fact_sheets VALUES (?, '{"criteria":{"firstRegistrationYear":{"value":2020}}}')`, [id]);
  }

  const vdResult = await valueDrivers(query, 'motorrad/yamaha/r1');
  assert.ok(Array.isArray(vdResult), 'valueDrivers returns array when >= 30 listings');
  assert.strictEqual(vdResult.length, 2);
  assert.deepStrictEqual(vdResult[0], { year: 2015, median_price: 6000, count: 15 });
  assert.deepStrictEqual(vdResult[1], { year: 2020, median_price: 9000, count: 15 });

  db.close();
  console.log('All P8 market_node tests passed!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
