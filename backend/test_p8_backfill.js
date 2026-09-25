/**
 * Node assignment reads what exists: the verdict's facts and the listing URL's
 * category, and in a model list the search term (P8 review).
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { backfillP8Nodes, playbookFromUrl } = require('./migrations/p8_backfill_nodes');

assert.strictEqual(playbookFromUrl('https://www.kleinanzeigen.de/s-anzeige/kit/3507841883-225-1234'), 'computing/memory');
assert.strictEqual(playbookFromUrl('https://www.kleinanzeigen.de/s-anzeige/x/1-81-2'), null);

const db = new sqlite3.Database(':memory:');
const query = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => (e ? no(e) : ok(r))));
const run = (sql, p = []) => new Promise((ok, no) => db.run(sql, p, e => (e ? no(e) : ok())));

(async () => {
  for (const sql of [
    'CREATE TABLE listings (id TEXT, url TEXT, title TEXT, details TEXT, price_eur INTEGER)',
    'CREATE TABLE fact_sheets (listing_id TEXT, facts_json TEXT, playbook_key TEXT)',
    'CREATE TABLE listing_search_hits (listing_id TEXT, search_id INTEGER, first_seen_at TEXT)',
    'CREATE TABLE searches (id INTEGER, name TEXT, campaign_id INTEGER)',
    'CREATE TABLE campaigns (id INTEGER, name TEXT, hunt_type TEXT)',
    'CREATE TABLE listing_ranks (listing_id TEXT, node TEXT, node_key TEXT, run_id INTEGER)',
    'CREATE TABLE judge_runs (id INTEGER, created_at TEXT)',
    'CREATE TABLE listing_fit (listing_id TEXT, facts_json TEXT, judged_at TEXT)',
    'CREATE TABLE search_family_searches (family_id INTEGER, term_id INTEGER, search_id INTEGER)',
    'CREATE TABLE search_family_terms (id INTEGER, family_id INTEGER, term TEXT, label TEXT)',
    'CREATE TABLE search_families (id INTEGER, campaign_id INTEGER)',
  ]) await run(sql);
  await run("INSERT INTO campaigns VALUES (7, 'Corsair', 'exact'), (9, 'R1 / CBR', 'shortlist')");
  await run("INSERT INTO searches VALUES (45, 's', 7), (48, 's', 9)");
  await run("INSERT INTO listings VALUES ('ram', 'https://www.kleinanzeigen.de/s-anzeige/k/1-225-2', 'Corsair', '{}', 140)");
  await run("INSERT INTO listing_fit VALUES ('ram', '{\"generation\":\"ddr4\",\"stickCount\":2,\"gbPerStick\":16}', '2026-09-25')");
  await run("INSERT INTO listing_search_hits VALUES ('ram', 45, '2026-09-25'), ('r1', 48, '2026-09-25')");
  await run("INSERT INTO listings VALUES ('r1', 'https://www.kleinanzeigen.de/s-anzeige/r/3-305-4', 'R1 2008', '{}', 6000)");
  await run("INSERT INTO search_families VALUES (6, 9)");
  await run("INSERT INTO search_family_terms VALUES (1, 6, 'yamaha-r1', 'Yamaha R1')");
  await run("INSERT INTO search_family_searches VALUES (6, 1, 48)");
  // The comparison names the product in node_key (compare.py).
  await run("INSERT INTO listings VALUES ('cbr', 'https://www.kleinanzeigen.de/s-anzeige/c/5-305-4', 'CBR', '{}', 9000)");
  await run("INSERT INTO listing_search_hits VALUES ('cbr', 45, '2026-09-25')");
  await run("INSERT INTO judge_runs VALUES (1, '2026-09-25')");
  await run("INSERT INTO listing_ranks VALUES ('cbr', NULL, 'motorrad/honda/cbr1000rr', 1)");

  await backfillP8Nodes(query, run);
  const nodes = Object.fromEntries((await query('SELECT listing_id, node_key FROM listing_nodes')).map(r => [r.listing_id, r.node_key]));
  assert.strictEqual(nodes.ram, 'ram/ddr4/2x16gb', 'the verdict facts name the kit');
  assert.strictEqual(nodes.r1, 'modell/yamaha-r1', 'the model list term names the motorcycle');
  assert.strictEqual(nodes.cbr, 'motorrad/honda/cbr1000rr', 'the comparison names the product where only the hunt name would');

  // Two runs at once (startup and a crawl's end) wait for each other.
  const both = await Promise.all([backfillP8Nodes(query, run), backfillP8Nodes(query, run)]);
  assert.strictEqual(both[0].total, both[1].total);
  console.log('p8 backfill: all assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
