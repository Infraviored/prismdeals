const assert = require('assert');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
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

function getSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function main() {
  console.log('Testing fresh hunt requirements loading...');

  const db = new sqlite3.Database(':memory:');

  // Setup minimal schema
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
      item_json TEXT
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
      name TEXT,
      campaign_id INTEGER,
      knowledge_set_id INTEGER,
      base_url TEXT,
      enabled INTEGER DEFAULT 1,
      created_at TEXT
    );
  `);
  await runSql(db, `
    CREATE TABLE route_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      campaign_id INTEGER,
      knowledge_set_id INTEGER,
      base_url TEXT,
      origin TEXT,
      destination TEXT,
      radius_km REAL,
      half_width_km REAL,
      plan_json TEXT,
      created_at TEXT
    );
  `);
  await runSql(db, `
    CREATE TABLE search_family_searches (
      family_id INTEGER,
      term_id INTEGER,
      search_id INTEGER,
      PRIMARY KEY (family_id, term_id, search_id)
    );
  `);

  // Insert a fresh campaign and search_family with category c305 (motorcycles)
  // CRITICAL: 0 rows in searches table!
  const camp = await runSql(db, `INSERT INTO campaigns (name) VALUES ('Fresh Motorcycle Hunt')`);
  const campaignId = camp.id;

  await runSql(
    db,
    `INSERT INTO search_families (name, campaign_id, base_url, created_at)
     VALUES ('Motorrad Family', ?, 'https://www.kleinanzeigen.de/s-landsberg-am-lech/motorrad/k0c305l7091', '2026-09-24')`,
    [campaignId]
  );

  const query = (sql, p) => querySql(db, sql, p);
  const get = (sql, p) => getSql(db, sql, p);
  const run = (sql, p) => runSql(db, sql, p);

  const app = express();
  app.use(express.json());
  app.use(requirementsApi(query, get, run));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. GET requirements on fresh hunt (has family with c305, 0 searches)
    // Directly pass category hint as query param or via family resolution
    const res1 = await fetch(`http://127.0.0.1:${port}/api/campaigns/${campaignId}/requirements?category=c305`);
    assert.strictEqual(res1.status, 200, 'Fresh hunt requirements GET should return 200, not 404');
    const data1 = await res1.json();

    assert.strictEqual(data1.playbook, 'vehicles/motorcycles');
    assert(Array.isArray(data1.fields), 'fields must be an array');
    assert(data1.fields.length > 0, 'fields must not be empty');

    const fieldIds = data1.fields.map(f => f.id);
    // Taxonomy-filtered fields must NOT be present
    assert(!fieldIds.includes('mileageKm'), 'mileageKm must be excluded (handled by taxonomy filter)');
    assert(!fieldIds.includes('firstRegistrationYear'), 'firstRegistrationYear must be excluded');
    assert(!fieldIds.includes('displacementCcm'), 'displacementCcm must be excluded');
    assert(!fieldIds.includes('powerKw'), 'powerKw must be excluded');

    // Non-taxonomy fields MUST be present
    assert(fieldIds.includes('a2Compatible'), 'a2Compatible should be present');
    assert(fieldIds.includes('crashDamage'), 'crashDamage should be present');
    assert(fieldIds.includes('storageCondition'), 'storageCondition should be present');

    // 2. PUT requirements on fresh hunt (0 searches, 1 family)
    const putRes = await fetch(`http://127.0.0.1:${port}/api/campaigns/${campaignId}/requirements`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirements: [
          { id: 'a2Compatible', buyer_wants: { match: true } },
        ],
      }),
    });
    assert.strictEqual(putRes.status, 200, 'Fresh hunt requirements PUT should succeed');
    const putData = await putRes.json();
    assert.strictEqual(putData.success, true);
    assert(putData.knowledge_set_id, 'Should create knowledge_set_id');

    // Verify family was linked to knowledge set
    const fam = await get('SELECT knowledge_set_id FROM search_families WHERE id = 1');
    assert.strictEqual(fam.knowledge_set_id, putData.knowledge_set_id, 'Family must be linked to new knowledge_set_id');

    // 3. GET requirements again — stored requirements must now be returned
    const res2 = await fetch(`http://127.0.0.1:${port}/api/campaigns/${campaignId}/requirements?category=c305`);
    const data2 = await res2.json();
    assert.strictEqual(data2.requirements.length, 1);
    assert.strictEqual(data2.requirements[0].id, 'a2Compatible');
    assert.deepStrictEqual(data2.requirements[0].buyer_wants, { match: true });

    console.log('Fresh hunt requirements tests passed!');
  } finally {
    server.close();
    db.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
