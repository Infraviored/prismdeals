/**
 * Integration test for backend/knowledge_api.js endpoints (P7).
 */

const express = require('express');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { execFileSync } = require('child_process');

const TEST_DB = '/tmp/p7_test_knowledge_api.db';

async function setupDb() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  // Apply schema
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  const db = new sqlite3.Database(TEST_DB);

  await new Promise((resolve, reject) => {
    // Split and run statements
    db.serialize(() => {
      const cleanSql = schemaSql.replace(/--.*$/gm, '');
      const stmts = cleanSql.split(';').map(s => s.trim()).filter(Boolean);
      for (const s of stmts) {
        db.run(s, err => {
          if (err && !err.message.includes('already exists')) {
            console.error('Schema error:', err.message, s.slice(0, 50));
          }
        });
      }
      resolve();
    });
  });

  // Seed sample campaign and candidate listing
  const runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  await runAsync(
    `INSERT INTO campaigns (id, name, profile_key, intent_json, hunt_type)
     VALUES (1, 'Yamaha R1 RN19', 'vehicle', '{"text": "Yamaha R1 RN19"}', 'shortlist')`
  );

  await runAsync(
    `INSERT INTO searches (id, campaign_id, name, url, enabled)
     VALUES (101, 1, 'R1 Search', 'https://example.com/s-r1', 1)`
  );

  await runAsync(
    `INSERT INTO listings (id, search_id, title, price_eur)
     VALUES ('L-100', 101, 'Yamaha R1 RN19 2008 top Zustand', 7500)`
  );

  // Seed judge run with listing_ranks carrying node_key
  await runAsync(
    `INSERT INTO judge_runs (id, campaign_id, requirements_hash, status, created_at)
     VALUES (1, 1, 'h123', 'complete', '2026-09-25T08:00:00Z')`
  );

  await runAsync(
    `INSERT INTO listing_ranks (run_id, listing_id, rank, rank_of, node_key)
     VALUES (1, 'L-100', 1, 1, 'motorrad/supersport/yamaha-r1/rn19')`
  );

  return db;
}

async function test() {
  process.env.PRISMDEALS_DB = TEST_DB;
  const db = await setupDb();

  const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  const knowledgeRouter = require('./knowledge_api')(query, get, run);

  const app = express();
  app.use(express.json());
  app.use(knowledgeRouter);

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    console.log('Test 1: GET /api/campaigns/:id/brief validation');
    const badBriefRes = await fetch(`${base}/api/campaigns/0/brief`);
    assert.strictEqual(badBriefRes.status, 400, 'Expected 400 for campaign 0');

    console.log('Test 2: GET /api/campaigns/1/brief (valid campaign)');
    const briefRes = await fetch(`${base}/api/campaigns/1/brief`);
    assert.strictEqual(briefRes.status, 200, 'Expected 200 for campaign 1');
    const briefData = await briefRes.json();
    assert.ok(briefData && typeof briefData === 'object');
    assert.ok(['lohnt sich', 'nicht noetig'].includes(briefData.decision));
    assert.ok(Array.isArray(briefData.what_to_know));
    assert.ok(briefData.node_key);

    console.log('Test 3: POST /api/knowledge/classify validation (missing args)');
    const badClassifyRes = await fetch(`${base}/api/knowledge/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(badClassifyRes.status, 400, 'Expected 400 for missing args');

    console.log('Test 4: POST /api/knowledge/classify (answer parsing)');
    const classifyRes = await fetch(`${base}/api/knowledge/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        node_key: 'motorrad/supersport/yamaha-r1/rn19',
        profile_key: 'vehicle',
        answer_text: `## Bekannte Schwächen
- Drosselklappenpotentiometer neigt zu Ausfällen. https://r1-forum.de/tps
- Lima-Rotor kann zerbersten. https://motorradonline.de/r1-rotor

## Wartung und Verschleiß
- Ventilspielkontrolle alle 40.000 km. https://yamaha.de/service`,
      }),
    });
    assert.strictEqual(classifyRes.status, 200, 'Expected 200 from classify');
    const { claims } = await classifyRes.json();
    assert.ok(Array.isArray(claims), 'Expected claims array');
    assert.ok(claims.length >= 2, `Expected at least 2 claims, got ${claims.length}`);
    const claim1 = claims[0];
    assert.ok(claim1.id, 'Claim should have a DB id');
    assert.strictEqual(claim1.approved, false, 'New claim should be unapproved initially');

    console.log(`Test 5: POST /api/claims/${claim1.id}/approve`);
    const approveRes = await fetch(`${base}/api/claims/${claim1.id}/approve`, {
      method: 'POST',
    });
    assert.strictEqual(approveRes.status, 200);
    const approvedRow = await get('SELECT approved FROM claims WHERE id = ?', [claim1.id]);
    assert.strictEqual(approvedRow.approved, 1, 'Claim should now be approved');

    console.log('Test 6: GET /api/listings/L-100/claims (inherited claims)');
    const listingClaimsRes = await fetch(`${base}/api/listings/L-100/claims`);
    assert.strictEqual(listingClaimsRes.status, 200);
    const listingClaimsData = await listingClaimsRes.json();
    assert.strictEqual(listingClaimsData.listing_id, 'L-100');
    assert.strictEqual(listingClaimsData.node_key, 'motorrad/supersport/yamaha-r1/rn19');
    assert.ok(Array.isArray(listingClaimsData.claims));
    assert.ok(
      listingClaimsData.claims.some(c => c.id === claim1.id),
      'Approved claim should be in inherited listing claims'
    );

    console.log(`Test 7: POST /api/claims/${claim1.id}/reject (delete)`);
    const rejectRes = await fetch(`${base}/api/claims/${claim1.id}/reject`, {
      method: 'POST',
    });
    assert.strictEqual(rejectRes.status, 200);
    const deletedRow = await get('SELECT id FROM claims WHERE id = ?', [claim1.id]);
    assert.strictEqual(deletedRow, undefined, 'Claim should be deleted after reject');

    console.log('All knowledge_api integration tests passed successfully!');
  } finally {
    server.close();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
