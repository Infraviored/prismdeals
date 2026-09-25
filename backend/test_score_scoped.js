/**
 * A requirement for one model of a hunt scores only that model's listings.
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { attachScores } = require('./db/score');

(async () => {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) => new Promise((ok, no) => db.run(sql, p, e => (e ? no(e) : ok())));
  const query = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => (e ? no(e) : ok(r))));
  for (const sql of [
    'CREATE TABLE listing_search_hits (listing_id TEXT, search_id INTEGER)',
    'CREATE TABLE searches (id INTEGER, knowledge_set_id INTEGER)',
    'CREATE TABLE knowledge_sets (id INTEGER, item_json TEXT)',
    'CREATE TABLE search_family_searches (family_id INTEGER, term_id INTEGER, search_id INTEGER)',
  ]) await run(sql);
  const fields = [{
    id: 'own_km', label: 'Kilometerstand km', importance: 'high', own: true,
    buyer_wants: { max: 5000 }, applies_to: [2],
  }];
  await run('INSERT INTO knowledge_sets VALUES (1, ?)', [JSON.stringify({ fields })]);
  await run('INSERT INTO searches VALUES (10, 1), (20, 1)');
  await run('INSERT INTO search_family_searches VALUES (1, 1, 10), (1, 2, 20)');
  await run("INSERT INTO listing_search_hits VALUES ('r1', 10), ('cbr', 20)");

  const listings = [
    { id: 'r1', price_eur: 6000, fit: { verdict: 'fit', facts: { own_km: false } } },
    { id: 'cbr', price_eur: 6000, fit: { verdict: 'no', facts: { own_km: false } } },
  ];
  await attachScores(query, listings);
  const [r1, cbr] = listings;
  assert.deepStrictEqual(r1.score_parts.gate.violated, [], 'the CBR limit does not gate the R1');
  assert.ok(cbr.score_parts.gate.violated.length === 1, 'it gates the CBR');
  console.log('score scoped: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
