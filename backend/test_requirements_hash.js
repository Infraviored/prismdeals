const assert = require('assert');
const { requirementsHash, canonicalStringify, fitJoinOn } = require('./db/requirements_hash');

function run() {
  // Empty or invalid input handling
  assert.strictEqual(requirementsHash(null), null);
  assert.strictEqual(requirementsHash([]), null);
  assert.strictEqual(requirementsHash(undefined), null);

  // Parity with Python implementation
  const case1 = [{ id: 'ramGb', buyer_wants: { min: 16 } }];
  assert.strictEqual(requirementsHash(case1), '469b044de33efef1');

  const case2 = [
    { id: 'brand', buyer_wants: { match: 'Corsair' } },
    { id: 'ramGb', buyer_wants: { min: 32 } },
  ];
  assert.strictEqual(requirementsHash(case2), '6da917dca59e6498');

  // Key sorting and order invariance
  const case2Reordered = [
    { id: 'ramGb', buyer_wants: { min: 32 } },
    { id: 'brand', buyer_wants: { match: 'Corsair' } },
  ];
  assert.strictEqual(requirementsHash(case2Reordered), '6da917dca59e6498');

  // Ignores irrelevant fields (importance, label, etc.)
  const withExtra = [
    { id: 'ramGb', buyer_wants: { min: 16 }, importance: 'high', label: 'RAM' },
  ];
  assert.strictEqual(requirementsHash(withExtra), '469b044de33efef1');

  // Scoped to models: part of the hash, same as Python's (b29ca27a7e004cba).
  assert.strictEqual(
    requirementsHash([{ id: 'own_km', buyer_wants: { max: 5000 }, applies_to: [12, 3] }]),
    'b29ca27a7e004cba'
  );
  assert.strictEqual(requirementsHash([{ id: 'own_km', buyer_wants: { max: 5000 } }]), '4632ad3d2c5a2fe2');

  // fitJoinOn SQL clause generation
  const defaultSql = fitJoinOn('l.id', 'lsh.search_id');
  assert(defaultSql.includes('fit.listing_id = l.id'));
  assert(defaultSql.includes('fit.requirements_hash IS NOT NULL'));
  assert(defaultSql.includes('fit.requirements_hash = ('));
  assert(defaultSql.includes('WHERE s_rh.id = lsh.search_id'));
  assert(defaultSql.includes('fit.requirements_hash IS NULL AND fit.search_id = lsh.search_id'));

  const customAliasSql = fitJoinOn('listings.id', 'searches.id', 'lf');
  assert(customAliasSql.includes('lf.listing_id = listings.id'));
  assert(customAliasSql.includes('lf.requirements_hash IS NOT NULL'));

  console.log('requirements_hash: all assertions passed');
}

// Searches sharing requirements each leave a verdict under the same hash; a
// listing joined through fitJoinOn is still one row.
async function oneVerdictPerListing() {
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(':memory:');
  const all = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => (e ? no(e) : ok(r))));
  for (const sql of [
    'CREATE TABLE searches (id INTEGER PRIMARY KEY, knowledge_set_id INTEGER)',
    'CREATE TABLE knowledge_sets (id INTEGER PRIMARY KEY, requirements_hash TEXT)',
    'CREATE TABLE listing_search_hits (listing_id TEXT, search_id INTEGER)',
    `CREATE TABLE listing_fit (listing_id TEXT, search_id INTEGER, verdict TEXT,
       requirements_hash TEXT, judged_at TEXT, PRIMARY KEY (listing_id, search_id))`,
    "INSERT INTO knowledge_sets VALUES (1, 'h')",
    'INSERT INTO searches VALUES (1, 1), (2, 1)',
    "INSERT INTO listing_search_hits VALUES ('a', 1), ('a', 2)",
    "INSERT INTO listing_fit VALUES ('a', 1, 'fit', 'h', '1'), ('a', 2, 'unclear', 'h', '2')",
  ]) await all(sql);
  const rows = await all(
    `SELECT lsh.search_id, fit.verdict FROM listing_search_hits lsh
       LEFT JOIN listing_fit fit ON ${fitJoinOn('lsh.listing_id', 'lsh.search_id')}
      ORDER BY lsh.search_id`
  );
  assert.deepStrictEqual(rows, [{ search_id: 1, verdict: 'fit' }, { search_id: 2, verdict: 'unclear' }]);
  db.close();
  console.log('fitJoinOn: one verdict per listing and search');
}

run();
oneVerdictPerListing().catch(err => { console.error(err); process.exit(1); });
