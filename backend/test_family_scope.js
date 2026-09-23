/**
 * A changed search must not hide what the old one found (Corsair, 2026-09-23).
 *
 * Saving the setup screen with one filter changed re-aims a family: the old
 * search goes inactive, a new one takes its term. The campaign view kept only
 * active searches, so 50 listings and 50 verdicts vanished until somebody
 * crawled again -- which nothing did. The old search now stays in view until
 * its successor has run once, in the overview and the list alike.
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { applySchema } = require('./db/schema');
const { resolveCampaignScope } = require('./overview/scope');

async function main() {
  const db = new sqlite3.Database(':memory:');
  const run = (sql, p = []) => new Promise((ok, no) => db.run(sql, p, e => (e ? no(e) : ok())));
  const query = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => (e ? no(e) : ok(r))));
  const get = (sql, p = []) => new Promise((ok, no) => db.get(sql, p, (e, r) => (e ? no(e) : ok(r))));

  await applySchema(db);
  await run("INSERT INTO campaigns (id, name) VALUES (7, 'Corsair')");
  await run("INSERT INTO searches (id, campaign_id, name, url, enabled, last_scraped_at) VALUES (45, 7, 'alt', 'https://www.kleinanzeigen.de/s-a/k0c225', 0, '2026-09-22T17:00:00Z')");
  await run("INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (46, 7, 'neu', 'https://www.kleinanzeigen.de/s-a/k0c225+x:ja', 1)");
  await run("INSERT INTO search_families (id, name, campaign_id, base_url, enabled, created_at) VALUES (4, 'Corsair', 7, 'https://www.kleinanzeigen.de/s-a/k0c225+x:ja', 1, '2026-09-23')");
  await run("INSERT INTO search_family_terms (id, family_id, term, label, enabled, position) VALUES (16, 4, 'corsair-vengeance-32gb', 'corsair vengeance 32gb', 1, 0)");
  await run('INSERT INTO search_family_searches (family_id, term_id, search_id, active) VALUES (4, 16, 45, 0)');
  await run('INSERT INTO search_family_searches (family_id, term_id, search_id, active) VALUES (4, 16, 46, 1)');

  let scope = await resolveCampaignScope(7, null, { query, get });
  assert.deepStrictEqual(
    scope.searchIds.sort(),
    [45, 46],
    'before the new search has run, the old one stays in view'
  );

  await run("UPDATE searches SET last_scraped_at = '2026-09-23T12:00:00Z' WHERE id = 46");
  scope = await resolveCampaignScope(7, null, { query, get });
  assert.deepStrictEqual(scope.searchIds, [46], 'once it has run, the old search drops out');

  db.close();
  console.log('family scope: all assertions passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
