/**
 * The hunt endpoints against a real server and a fresh database: a hunt saved
 * through the graph (no model: its target is placed by node id), listings read
 * by the graph, verdicts computed on read -- and changed by a condition edit
 * without any re-judging.
 */
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { findPython } = require('./python');

const PORT = 3052;
const DB = path.join(os.tmpdir(), `prismdeals_test_hunts_${process.pid}.db`);
const SCRAPER = path.join(__dirname, '..', 'scraper');

// Taxonomy, a CBR with two generations, a hunt for the SC59 and five listings.
const FIXTURE = `
import json, sys
import db_schema
from graph import hunts, store, taxonomy, facts
conn = db_schema.connect(sys.argv[1])
taxonomy.seed(conn)
moto = taxonomy.category_node_id(conn, "305")
honda = store.create_node(conn, moto, "brand", "Honda", "test")
store.add_alias(conn, honda, "Honda", "name", "test")
cbr = store.create_node(conn, honda, "model", "CBR 1000 RR", "test")
store.add_alias(conn, cbr, "CBR 1000 RR", "name", "test")
for name, years in (("SC57", (2004, 2007)), ("SC59", (2008, 2011))):
    g = store.create_node(conn, cbr, "generation", name, "test", years_from=years[0], years_to=years[1])
    store.add_alias(conn, g, name, "code", "test")
sc59 = store.by_key(conn, store.node(conn, cbr)["key"] + "/sc59")["id"]
conn.execute("INSERT INTO users (email, password_hash, role) VALUES ('t@t', 'x', 'admin')")
cid = hunts.save(conn, {
    "name": "Fireblade", "category_code": "305",
    "frame": {"max_price": 9000, "location_id": 7074, "radius_km": 200},
    "targets": [{"typed": "CBR SC59", "node_id": sc59, "conditions": [
        {"label": "Kilometerstand", "op": "max", "value": 30000, "importance": "must"}]}],
    "conditions": [],
})
(sid,) = conn.execute("SELECT id FROM searches WHERE campaign_id = ?", (cid,)).fetchone()
rows = [
    ("1", "Honda CBR 1000 RR SC59", 7000, {"Kilometerstand": "12.000 km"}),
    ("2", "Honda CBR 1000 RR SC59 Repsol", 7500, {"Kilometerstand": "45.000 km"}),
    ("3", "Honda CBR 1000 RR SC57", 5000, {"Kilometerstand": "20.000 km"}),
    ("4", "Honda CBR 1000 RR", 6000, {"Erstzulassung": "Mai 2009", "Kilometerstand": "8.000 km"}),
    ("5", "Suche Honda CBR 1000 RR SC59", 1, {}),
]
for lid, title, price, details in rows:
    conn.execute(
        "INSERT INTO listings (id, title, price, price_eur, url, details, images) VALUES (?, ?, ?, ?, ?, ?, '[]')",
        (lid, title, f"{price} €", price, f"https://www.kleinanzeigen.de/s-anzeige/x/{lid}000-305-1", json.dumps(details)),
    )
    conn.execute("INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, '2026-09-01')", (lid, sid))
    facts.process(conn, lid)
conn.commit()
print(json.dumps({"id": cid, "sc59": sc59}))
`;

async function request(url, options = {}) {
  const token = jwt.sign({ userId: 1, role: 'admin' }, 'prismdeals_dev_secret_key_12345');
  const res = await fetch(`http://localhost:${PORT}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` },
  });
  return { status: res.status, data: await res.json() };
}

async function main() {
  if (fs.existsSync(DB)) fs.unlinkSync(DB);
  const { id, sc59 } = JSON.parse(
    execFileSync(findPython(), ['-c', FIXTURE, DB], { cwd: SCRAPER, env: { ...process.env, PYTHONPATH: SCRAPER } })
      .toString().trim().split('\n').pop()
  );
  const server = spawn('node', [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PRISMDEALS_DB: DB, PRISMDEALS_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { await request('/api/hunts'); break; } catch { await new Promise(r => setTimeout(r, 250)); }
    }

    const list = await request('/api/hunts');
    assert.strictEqual(list.status, 200);
    assert.deepStrictEqual(list.data.map(h => h.name), ['Fireblade']);
    assert.deepStrictEqual(list.data[0].counts, { all: 5, fit: 2, unclear: 0, no: 3 });

    const doc = (await request(`/api/hunts/${id}`)).data;
    assert.strictEqual(doc.targets[0].node_id, sc59);
    assert.strictEqual(doc.targets[0].name, 'Honda CBR 1000 RR SC59');
    assert.strictEqual(doc.targets[0].conditions[0].text, 'Kilometerstand bis 30000');
    assert.ok(doc.targets[0].attributes.some(a => a.id === 'km'), 'the site attribute is offered');
    assert.deepStrictEqual(doc.crawl.map(c => c.label), ['Honda CBR 1000 RR']);

    const listings = (await request(`/api/hunts/${id}/listings?sort=price_asc`)).data;
    const byId = Object.fromEntries(listings.listings.map(l => [l.id, l.fit]));
    assert.strictEqual(byId['1'].verdict, 'fit');
    assert.match(byId['2'].reason, /Kilometerstand bis 30000/);
    assert.match(byId['3'].reason, /Anderes Modell: Honda CBR 1000 RR SC57/);
    assert.strictEqual(byId['4'].verdict, 'fit', 'no code in the title, the year names the SC59');
    assert.strictEqual(byId['5'].reason, 'Gesuch, kein Angebot');
    assert.deepStrictEqual(listings.listings.map(l => l.price_eur), [1, 5000, 6000, 7000, 7500]);

    const fits = (await request(`/api/hunts/${id}/listings?verdict=fit&limit=1`)).data;
    assert.strictEqual(fits.total, 2);
    assert.strictEqual(fits.listings.length, 1);
    assert.strictEqual(fits.listings[0].target.name, 'Honda CBR 1000 RR SC59');

    // A stricter must changes the verdicts on the next read.
    const changed = {
      ...doc,
      targets: [{ ...doc.targets[0], conditions: [{ label: 'Kilometerstand', op: 'max', value: 10000, importance: 'must' }] }],
    };
    const saved = await request(`/api/hunts/${id}`, { method: 'PUT', body: JSON.stringify(changed) });
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.data));
    const after = (await request(`/api/hunts/${id}/listings?verdict=fit`)).data;
    assert.deepStrictEqual(after.listings.map(l => l.id), ['4']);

    const overview = (await request(`/api/hunts/${id}/overview`)).data;
    assert.deepStrictEqual(overview.pots, { all: 5, fit: 1, unclear: 0, no: 4 });
    assert.strictEqual(overview.rejections[0].reason, 'Kilometerstand bis 10000');
    assert.deepStrictEqual(
      overview.conditions.map(c => [c.text, c.met, c.violated]),
      [['Kilometerstand bis 10000', 1, 2]]
    );

    const one = (await request(`/api/listings/4?campaign_id=${id}`)).data;
    assert.strictEqual(one.fit.verdict, 'fit');
    assert.strictEqual(one.campaign_name, 'Fireblade');

    const bad = await request('/api/hunts', { method: 'POST', body: JSON.stringify({ ...changed, id: undefined }) });
    assert.strictEqual(bad.status, 400, 'the name is taken');
    console.log('hunts api: all assertions passed');
  } finally {
    server.kill();
    fs.rmSync(DB, { force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
