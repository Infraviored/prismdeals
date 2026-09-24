const assert = require('assert');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const campaignHuntApi = require('./campaign_hunt_api');
const { backfillHuntTypes } = require('./migrations/p1_backfill');

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
  console.log('Testing campaign hunt model endpoints and backfill...');

  const db = new sqlite3.Database(':memory:');

  // Schema with P1 columns
  await runSql(db, `
    CREATE TABLE campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      hunt_type TEXT,
      profile_key TEXT,
      intent_json TEXT
    );
  `);
  await runSql(db, `
    CREATE TABLE search_families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      campaign_id INTEGER,
      knowledge_set_id INTEGER,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);
  await runSql(db, `
    CREATE TABLE route_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER
    );
  `);

  const query = (sql, p) => querySql(db, sql, p);
  const get = (sql, p) => getSql(db, sql, p);
  const run = (sql, p) => runSql(db, sql, p);

  const app = express();
  app.use(express.json());
  app.use(campaignHuntApi(query, get, run));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // 1. Seed campaigns
    // Campaign 1: fresh, no hunt_type
    await runSql(db, `INSERT INTO campaigns (id, name) VALUES (1, 'Memory Hunt')`);
    // Search family with c225
    await runSql(db, `
      INSERT INTO search_families (name, campaign_id, base_url, created_at)
      VALUES ('DDR4', 1, 'https://www.kleinanzeigen.de/s-speicher/k0c225', '2026-09-24')
    `);

    // Campaign 2: motorcycle hunt, no hunt_type
    await runSql(db, `INSERT INTO campaigns (id, name) VALUES (2, 'Moto Hunt')`);
    await runSql(db, `
      INSERT INTO search_families (name, campaign_id, base_url, created_at)
      VALUES ('Yamaha', 2, 'https://www.kleinanzeigen.de/s-motorraeder-roller/k0c305', '2026-09-24')
    `);

    // Campaign 3: pre-configured hunt_type 'class'
    await runSql(db, `INSERT INTO campaigns (id, name, hunt_type) VALUES (3, 'Pre-set Hunt', 'class')`);
    await runSql(db, `
      INSERT INTO search_families (name, campaign_id, base_url, created_at)
      VALUES ('Memory Pre-set', 3, 'https://www.kleinanzeigen.de/s-speicher/k0c225', '2026-09-24')
    `);

    // 2. Test backfill
    const backfillRes = await backfillHuntTypes(query, run);
    assert.strictEqual(backfillRes.updated, 1, 'Only memory hunt without hunt_type should be updated');
    assert.deepStrictEqual(backfillRes.campaign_ids, [1]);

    const camp1 = await getSql(db, 'SELECT * FROM campaigns WHERE id = 1');
    assert.strictEqual(camp1.hunt_type, 'exact', 'Campaign 1 must be backfilled to exact');

    const camp2 = await getSql(db, 'SELECT * FROM campaigns WHERE id = 2');
    assert.strictEqual(camp2.hunt_type, null, 'Campaign 2 must remain null');

    const camp3 = await getSql(db, 'SELECT * FROM campaigns WHERE id = 3');
    assert.strictEqual(camp3.hunt_type, 'class', 'Campaign 3 must not be overwritten');

    // 3. Test GET /api/campaigns/:id
    const getRes = await fetch(`http://127.0.0.1:${port}/api/campaigns/1`);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.id, 1);
    assert.strictEqual(getData.hunt_type, 'exact');
    assert.strictEqual(getData.intent, null);

    // 4. Test PATCH /api/campaigns/:id with intent_json and profile_key
    const patchRes = await fetch(`http://127.0.0.1:${port}/api/campaigns/2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hunt_type: 'shortlist',
        profile_key: 'vehicle',
        intent_json: {
          text: 'Yamaha R1 or CBR1000RR',
          models: ['Yamaha R1', 'Honda CBR1000RR'],
          budget: { max: 9000 },
        },
      }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.strictEqual(patchData.success, true);
    assert.strictEqual(patchData.campaign.hunt_type, 'shortlist');
    assert.strictEqual(patchData.campaign.profile_key, 'vehicle');
    assert.strictEqual(patchData.campaign.intent.budget.max, 9000);

    // 5. Test validation: invalid hunt_type
    const invalidRes = await fetch(`http://127.0.0.1:${port}/api/campaigns/2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hunt_type: 'invalid_type' }),
    });
    assert.strictEqual(invalidRes.status, 400);

    console.log('Campaign hunt model tests passed!');
  } finally {
    server.close();
    db.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
