/**
 * Test suite for P9: verdicts survive search edits, invalidate on must edits,
 * and remain isolated across campaigns with differing requirements.
 */
const assert = require('assert');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { requirementsHash, fitJoinOn } = require('./db/requirements_hash');
const requirementsApi = require('./requirements_api');

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function querySql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function request(server, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Testing P9 verdict survival and isolation...');

  const db = new sqlite3.Database(':memory:');

  await runSql(db, `
    CREATE TABLE campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    );
  `);
  await runSql(db, `
    CREATE TABLE knowledge_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      item_json TEXT,
      requirements_hash TEXT
    );
  `);
  await runSql(db, `
    CREATE TABLE searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      name TEXT,
      url TEXT,
      enabled INTEGER DEFAULT 1,
      knowledge_set_id INTEGER
    );
  `);
  await runSql(db, `
    CREATE TABLE search_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      name TEXT,
      knowledge_set_id INTEGER
    );
  `);
  await runSql(db, `
    CREATE TABLE route_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      name TEXT,
      knowledge_set_id INTEGER
    );
  `);
  await runSql(db, `
    CREATE TABLE search_family_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_family_id INTEGER,
      search_id INTEGER,
      active INTEGER DEFAULT 1
    );
  `);
  await runSql(db, `
    CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      search_id INTEGER,
      title TEXT,
      price_eur INTEGER
    );
  `);
  await runSql(db, `
    CREATE TABLE listing_search_hits (
      listing_id TEXT,
      search_id INTEGER,
      first_seen_at TEXT,
      PRIMARY KEY (listing_id, search_id)
    );
  `);
  await runSql(db, `
    CREATE TABLE listing_fit (
      listing_id TEXT,
      search_id INTEGER,
      verdict TEXT,
      reason TEXT,
      stage TEXT,
      requirements_hash TEXT,
      PRIMARY KEY (listing_id, search_id)
    );
  `);

  // Requirements definitions
  const req16 = {
    fields: [
      { id: 'ramGb', buyer_wants: { min: 16 } },
      { id: 'condition', buyer_wants: { match: 'good' } },
    ],
  };
  const hash16 = requirementsHash(req16.fields);

  const req32 = {
    fields: [
      { id: 'ramGb', buyer_wants: { min: 32 } },
      { id: 'condition', buyer_wants: { match: 'good' } },
    ],
  };
  const hash32 = requirementsHash(req32.fields);

  assert.notStrictEqual(hash16, hash32, 'Hashes for different requirements must differ');

  const query = (sql, p) => querySql(db, sql, p);
  const get = (sql, p) => new Promise((resolve, reject) => {
    db.get(sql, p, (err, row) => (err ? reject(err) : resolve(row)));
  });
  const run = (sql, p) => runSql(db, sql, p);

  // Setup express app with requirements API
  const app = express();
  app.use(express.json());
  app.use(requirementsApi(query, get, run));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Seed Campaign 1 with 16GB requirements
    await runSql(db, "INSERT INTO campaigns (id, name) VALUES (1, 'Corsair RAM')");
    await runSql(
      db,
      'INSERT INTO knowledge_sets (id, name, item_json, requirements_hash) VALUES (1, ?, ?, ?)',
      ['Corsair KS', JSON.stringify(req16), hash16]
    );
    // Search 1 attached to KS 1
    await runSql(
      db,
      "INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id) VALUES (1, 1, 'Corsair Search 1', 'https://...', 1)"
    );

    // Listing found by search 1
    await runSql(db, "INSERT INTO listings (id, search_id, title, price_eur) VALUES ('ram-1', 1, 'Corsair 16GB', 50)");
    await runSql(db, "INSERT INTO listing_search_hits VALUES ('ram-1', 1, '2026-09-01')");

    // Verdict recorded for search 1 with requirements_hash = hash16
    await runSql(
      db,
      "INSERT INTO listing_fit (listing_id, search_id, verdict, reason, stage, requirements_hash) VALUES ('ram-1', 1, 'fit', 'Good RAM', 'title', ?)",
      [hash16]
    );

    // Helper query resolving verdict for a given search_id using fitJoinOn
    const resolveVerdict = async (listingId, searchId) => {
      const sql = `
        SELECT l.id, fit.verdict, fit.requirements_hash
          FROM listings l
          JOIN listing_search_hits lsh ON lsh.listing_id = l.id AND lsh.search_id = ?
          LEFT JOIN listing_fit fit ON ${fitJoinOn('l.id', 'lsh.search_id', 'fit')}
         WHERE l.id = ?
      `;
      const rows = await querySql(db, sql, [searchId, listingId]);
      return rows[0] || null;
    };

    // Test A: Search 1 sees 'fit'
    const res1 = await resolveVerdict('ram-1', 1);
    assert.strictEqual(res1.verdict, 'fit', 'Search 1 must see fit verdict');
    assert.strictEqual(res1.requirements_hash, hash16);

    // Test B: Term edit simulation
    // A re-aim creates Search 2 with the same knowledge set (same requirements hash)
    await runSql(
      db,
      "INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id) VALUES (2, 1, 'Corsair Search 2', 'https://...', 1)"
    );
    await runSql(db, "INSERT INTO listing_search_hits VALUES ('ram-1', 2, '2026-09-02')");

    // Search 2 has NO row in listing_fit where search_id = 2!
    // But it shares knowledge_set_id 1 (hash16). It must resolve the verdict!
    const res2 = await resolveVerdict('ram-1', 2);
    assert.strictEqual(res2.verdict, 'fit', 'Search 2 must resolve verdict via requirements_hash');
    assert.strictEqual(res2.requirements_hash, hash16);

    // Test C: Must edit simulation
    // User updates requirements to 32GB via API PUT /api/campaigns/:id/requirements
    const putRes = await request(server, 'PUT', '/api/campaigns/1/requirements', {
      requirements: req32.fields,
    });
    assert.strictEqual(putRes.status, 200);

    // Verify knowledge_sets table was updated with hash32
    const ksRow = await querySql(db, 'SELECT requirements_hash FROM knowledge_sets WHERE id = 1');
    assert.strictEqual(ksRow[0].requirements_hash, hash32);

    // Now Search 1 and Search 2 have requirements_hash = hash32.
    // The old verdict stored under hash16 is no longer valid!
    const resAfterMustEdit = await resolveVerdict('ram-1', 1);
    assert.strictEqual(resAfterMustEdit.verdict, null, 'Verdict must be invalidated after must edit');

    // Test D: Cross-campaign isolation
    // Campaign 2 with different requirements (hash16 vs hash32)
    await runSql(db, "INSERT INTO campaigns (id, name) VALUES (2, 'Other Campaign')");
    await runSql(
      db,
      'INSERT INTO knowledge_sets (id, name, item_json, requirements_hash) VALUES (2, ?, ?, ?)',
      ['Other KS', JSON.stringify(req16), hash16]
    );
    await runSql(
      db,
      "INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id) VALUES (3, 2, 'Other Search', 'https://...', 2)"
    );
    await runSql(db, "INSERT INTO listing_search_hits VALUES ('ram-1', 3, '2026-09-03')");

    // Campaign 2 (search 3) has hash16, so it resolves the old hash16 verdict
    const resCamp2 = await resolveVerdict('ram-1', 3);
    assert.strictEqual(resCamp2.verdict, 'fit', 'Campaign 2 with hash16 sees hash16 verdict');

    // Campaign 1 (search 1) has hash32, so it still sees null
    const resCamp1 = await resolveVerdict('ram-1', 1);
    assert.strictEqual(resCamp1.verdict, null, 'Campaign 1 with hash32 does not see hash16 verdict');

    console.log('P9 verdict tests: all assertions passed');
  } finally {
    server.close();
    db.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
