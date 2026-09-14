/**
 * Integration test suite for the frozen Search Families HTTP API.
 *
 * Tests all 7 endpoints against a fresh test database on an isolated port:
 * 1. POST /api/search-families/preview
 * 2. POST /api/search-families
 * 3. GET  /api/search-families?campaign_id=
 * 4. GET  /api/search-families/:id
 * 5. PUT  /api/search-families/:id
 * 6. GET  /api/search-families/:id/listings
 * 7. DELETE /api/search-families/:id
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const TEST_PORT = 3039;
const TEST_DB = '/tmp/prismdeals_test_api.db';
const JWT_SECRET = 'prismdeals_dev_secret_key_12345';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const token = jwt.sign({ userId: 1, role: 'admin' }, JWT_SECRET);
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `token=${token}`,
    ...(options.headers || {})
  };
  const res = await fetch(`http://localhost:${TEST_PORT}${path}`, {
    ...options,
    headers
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  console.log(`Starting test backend on port ${TEST_PORT} with db ${TEST_DB}...`);
  const server = spawn('node', [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      PRISMDEALS_PORT: String(TEST_PORT),
      PRISMDEALS_DB: TEST_DB,
      JWT_SECRET: JWT_SECRET,
      NODE_PATH: '/home/flo/docker-projects/prismdeals/backend/node_modules'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', d => {
    // console.log('[server]', d.toString().trim());
  });
  server.stderr.on('data', d => {
    console.error('[server error]', d.toString().trim());
  });

  // Wait for server to start
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/auth/me`, {
        headers: { Cookie: `token=${jwt.sign({ userId: 1, role: 'admin' }, JWT_SECRET)}` }
      });
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {}
  }

  if (!ready) {
    server.kill();
    throw new Error('Backend server failed to start within 9 seconds');
  }

  try {
    console.log('Running endpoint tests...');

    // 1. POST /api/search-families/preview
    console.log('Testing 1: POST /api/search-families/preview');
    const previewRes = await request('/api/search-families/preview', {
      method: 'POST',
      body: JSON.stringify({
        base_url: 'https://www.kleinanzeigen.de/s-drucker/brother/k0c278l6411r25',
        terms: ['MFC-L2740DW', 'MFC-L2750DW']
      })
    });
    assert(previewRes.status === 200, `preview status ${previewRes.status}`);
    assert(previewRes.data.terms === 2, `preview terms count: ${previewRes.data.terms}`);
    assert(previewRes.data.searches === 2, `preview searches count: ${previewRes.data.searches}`);
    assert(Array.isArray(previewRes.data.urls) && previewRes.data.urls.length === 2, 'urls array present');
    assert(Array.isArray(previewRes.data.conflicts), 'conflicts array present');

    // 2. POST /api/search-families
    console.log('Testing 2: POST /api/search-families');
    const createRes = await request('/api/search-families', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Brother Multifunktion',
        base_url: 'https://www.kleinanzeigen.de/s-drucker/brother/k0c278l6411r25',
        terms: [
          { term: 'MFC-L2740DW', label: 'Brother 2740' },
          { term: 'MFC-L2750DW', label: 'Brother 2750' }
        ]
      })
    });
    assert(createRes.status === 200, `create status ${createRes.status}`);
    assert(createRes.data.id > 0, `create id ${createRes.data.id}`);
    assert(createRes.data.searches === 2, `create searches count ${createRes.data.searches}`);
    const familyId = createRes.data.id;

    // 3. GET /api/search-families?campaign_id=
    console.log('Testing 3: GET /api/search-families');
    const listRes = await request('/api/search-families');
    assert(listRes.status === 200, `list status ${listRes.status}`);
    assert(Array.isArray(listRes.data), 'list data is array');
    const item = listRes.data.find(f => f.id === familyId);
    assert(item, 'created family present in list');
    assert(item.name === 'Brother Multifunktion', 'name matches');
    assert(item.enabled === true, 'enabled is boolean true');
    assert(item.terms === 2, `terms count is 2: got ${item.terms}`);
    assert(item.searches === 2, `searches count is 2: got ${item.searches}`);
    assert(typeof item.listings === 'number', 'listings is a number');

    // 4. GET /api/search-families/:id
    console.log('Testing 4: GET /api/search-families/:id');
    const detailRes = await request(`/api/search-families/${familyId}`);
    assert(detailRes.status === 200, `detail status ${detailRes.status}`);
    assert(detailRes.data.id === familyId, 'id matches');
    assert(detailRes.data.name === 'Brother Multifunktion', 'name matches');
    assert(detailRes.data.enabled === true, 'enabled is boolean');
    assert(Array.isArray(detailRes.data.terms) && detailRes.data.terms.length === 2, 'terms count matches');
    assert(detailRes.data.terms[0].label === 'Brother 2740', 'first term label matches');
    assert(typeof detailRes.data.terms[0].listings === 'number', 'term listings is number');

    // 5. Seed a listing and hit to verify listings retrieval and matched_terms
    console.log('Testing 5: Seed listing hit & GET /api/search-families/:id/listings');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(TEST_DB);
    await new Promise((resolve, reject) => {
      db.get('SELECT search_id FROM search_family_searches WHERE family_id = ? LIMIT 1', [familyId], (err, row) => {
        if (err || !row) return reject(err || new Error('No search_id'));
        const sid = row.search_id;
        db.run(
          `INSERT INTO listings (id, title, price, location, url, niceness_score, search_id)
           VALUES ('list-101', 'Brother MFC-L2740DW Duplex', '80 €', 'Augsburg', 'https://kleinanzeigen.de/s-101', 90, ?)`,
          [sid],
          err2 => {
            if (err2) return reject(err2);
            db.run(
              `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
               VALUES ('list-101', ?, datetime('now'))`,
              [sid],
              err3 => {
                if (err3) return reject(err3);
                db.close(resolve);
              }
            );
          }
        );
      });
    });

    const listingsRes = await request(`/api/search-families/${familyId}/listings?limit=10&offset=0`);
    assert(listingsRes.status === 200, `listings status ${listingsRes.status}`);
    assert(listingsRes.data.total === 1, `listings total is 1: got ${listingsRes.data.total}`);
    assert(listingsRes.data.listings.length === 1, 'listings length 1');
    const listing = listingsRes.data.listings[0];
    assert(listing.id === 'list-101', 'listing id matches');
    assert(Array.isArray(listing.matched_terms), 'matched_terms is array');
    assert(listing.matched_terms.length === 1, 'matched_terms has 1 item');
    assert(listing.matched_terms[0].label === 'Brother 2740', `matched term label matches: ${listing.matched_terms[0].label}`);

    // Verify per-term listing count updated in detail endpoint
    const detailAfterRes = await request(`/api/search-families/${familyId}`);
    const matchedTerm = detailAfterRes.data.terms.find(t => t.label === 'Brother 2740');
    assert(matchedTerm.listings === 1, `term listings count is 1: got ${matchedTerm.listings}`);

    // 6. PUT /api/search-families/:id
    console.log('Testing 6: PUT /api/search-families/:id');
    const updateRes = await request(`/api/search-families/${familyId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Brother Multifunktion Renamed',
        terms: [
          { id: detailRes.data.terms[0].id, term: 'MFC-L2740DW', label: 'Brother 2740 Updated', enabled: 1 },
          { term: 'MFC-L5750DW', label: 'Brother 5750', enabled: 1 }
        ]
      })
    });
    assert(updateRes.status === 200, `update status ${updateRes.status}`);
    assert(updateRes.data.id === familyId, 'update id matches');
    assert(updateRes.data.searches === 2, `searches count after update ${updateRes.data.searches}`);
    assert(updateRes.data.added === 1, `added is 1: got ${updateRes.data.added}`);
    assert(updateRes.data.removed === 1, `removed is 1: got ${updateRes.data.removed}`);

    // 7. DELETE /api/search-families/:id
    console.log('Testing 7: DELETE /api/search-families/:id');
    const deleteRes = await request(`/api/search-families/${familyId}`, {
      method: 'DELETE'
    });
    assert(deleteRes.status === 200, `delete status ${deleteRes.status}`);
    assert(deleteRes.data.success === true, 'delete success true');

    const getAfterDelete = await request(`/api/search-families/${familyId}`);
    assert(getAfterDelete.status === 404, `family 404 after delete: got ${getAfterDelete.status}`);

    console.log('ALL 7 ENDPOINT TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.kill();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
