/**
 * Test suite for P1b: server-side filtering, sorting, pagination, and unified listing fields.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const TEST_PORT = 3041;
const TEST_DB = '/tmp/prismdeals_test_p1b.db';
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

async function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
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

  server.stdout.on('data', d => {});
  server.stderr.on('data', d => console.error('[server error]', d.toString().trim()));

  // Wait for server ready
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
    console.log('Seeding test data for search families and route corridors...');
    const db = new sqlite3.Database(TEST_DB);

    // Create Campaign
    // The shortlist is per user, so there has to be one.
    await runDb(db, `INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES (1, 'test@localhost', 'x', 'admin')`);

    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (1, 'Matratzen Jagd')`);

    // Create Search Family & Terms
    await runDb(db, `INSERT INTO search_families (id, campaign_id, name, base_url, enabled, created_at)
                     VALUES (1, 1, 'Matratzen', 'https://kleinanzeigen.de/s-matratze/k0', 1, datetime('now'))`);
    await runDb(db, `INSERT INTO search_family_terms (id, family_id, term, label, enabled, position)
                     VALUES (10, 1, 'Federkern', 'Ikea Federkern', 1, 0),
                            (20, 1, 'Topper', 'Matratzen Topper', 1, 1)`);

    // Create Searches
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled)
                     VALUES (101, 1, 'Federkern Search 1', 'https://kleinanzeigen.de/s-1', 1),
                            (102, 1, 'Topper Search 2', 'https://kleinanzeigen.de/s-2', 1)`);

    // Link Family to Searches
    await runDb(db, `INSERT INTO search_family_searches (family_id, term_id, search_id)
                     VALUES (1, 10, 101),
                            (1, 20, 102)`);

    // Create Route Search
    await runDb(db, `INSERT INTO route_searches (id, campaign_id, family_id, name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at)
                     VALUES (50, 1, 1, 'Landsberg nach Konstanz', 'https://kleinanzeigen.de/s-matratze/k0', 'Landsberg', 'Konstanz', 30, 20, '{"distance_km":180,"duration_min":120,"polyline":[],"circles":[]}', datetime('now'))`);
    await runDb(db, `INSERT INTO route_search_circles (route_search_id, search_id, radius_km, label)
                     VALUES (50, 101, 30, 'Landsberg'),
                            (50, 102, 30, 'Konstanz')`);

    // Seed 60 Listings to test pagination (default limit 50) and filters
    const now = new Date('2026-09-16T12:00:00Z');
    for (let i = 1; i <= 60; i++) {
      const id = `listing-${i}`;
      const searchId = i <= 40 ? 101 : 102; // 40 Federkern, 20 Topper
      const priceEur = i * 10;
      const title = i % 2 === 0 ? `Ikea Federkern Matratze Nr ${i}` : `Novilla Topper Modell ${i}`;
      const location = i % 3 === 0 ? 'Landsberg' : (i % 3 === 1 ? 'Augsburg' : 'Memmingen');
      const niceness = 100 - i;
      const seenTime = new Date(now.getTime() - i * 3600 * 1000).toISOString();

      await runDb(db, `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id, images, extracted_facts)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '["https://example.com/img.jpg"]', '{"quality":"good"}')`,
        [id, title, `${priceEur} €`, priceEur, location, `https://kleinanzeigen.de/${id}`, niceness, searchId]);

      await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
                       VALUES (?, ?, ?)`,
        [id, searchId, seenTime]);

      // Route geo: detour_min
      const detourMin = i <= 20 ? (i - 1) * 2 : (i <= 40 ? 40 + i : null);
      await runDb(db, `INSERT INTO listing_route_geo (listing_id, route_search_id, lat, lon, offroute_km, detour_min, computed_at, status)
                       VALUES (?, 50, 48.0, 10.5, 5.0, ?, datetime('now'), 'routed')`,
        [id, detourMin]);
    }

    db.close();

    console.log('--- TEST 1: Default Pagination (limit=50) for search-families/:id/listings ---');
    const famListRes = await request('/api/search-families/1/listings');
    assert(famListRes.status === 200, `status ${famListRes.status}`);
    assert(famListRes.data.total === 60, `total should be 60, got ${famListRes.data.total}`);
    assert(famListRes.data.limit === 50, `limit should be 50, got ${famListRes.data.limit}`);
    assert(famListRes.data.offset === 0, `offset should be 0, got ${famListRes.data.offset}`);
    assert(famListRes.data.listings.length === 50, `listings length should be 50, got ${famListRes.data.listings.length}`);

    console.log('--- TEST 2: Pagination with limit=10 and offset=50 ---');
    const page2Res = await request('/api/search-families/1/listings?limit=10&offset=50');
    assert(page2Res.status === 200, `status ${page2Res.status}`);
    assert(page2Res.data.total === 60, `total should be 60, got ${page2Res.data.total}`);
    assert(page2Res.data.listings.length === 10, `page 2 length should be 10, got ${page2Res.data.listings.length}`);

    console.log('--- TEST 3: Filtering by q (title / location) ---');
    const qRes = await request('/api/search-families/1/listings?q=Landsberg');
    assert(qRes.status === 200, `status ${qRes.status}`);
    assert(qRes.data.total === 20, `Landsberg total should be 20, got ${qRes.data.total}`);
    assert(qRes.data.listings.every(l => l.location === 'Landsberg' || l.title.includes('Landsberg')), 'all match Landsberg');

    console.log('--- TEST 4: Filtering by maxDetour (detour <= 10 min) ---');
    const detourRes = await request('/api/search-families/1/listings?maxDetour=10');
    assert(detourRes.status === 200, `status ${detourRes.status}`);
    assert(detourRes.data.total === 6, `maxDetour 10 total should be 6 (0, 2, 4, 6, 8, 10 min), got ${detourRes.data.total}`);
    assert(detourRes.data.listings.every(l => l.detour_min !== null && l.detour_min <= 10), 'all within 10 min detour');

    console.log('--- TEST 5: Filtering by term ---');
    const termRes = await request('/api/search-families/1/listings?term=10');
    assert(termRes.status === 200, `status ${termRes.status}`);
    assert(termRes.data.total === 40, `term 10 total should be 40, got ${termRes.data.total}`);

    console.log('--- TEST 6: Sorting by price_asc and price_desc ---');
    const sortAscRes = await request('/api/search-families/1/listings?sort=price_asc&limit=5');
    assert(sortAscRes.data.listings[0].price_eur === 10, `lowest price should be 10, got ${sortAscRes.data.listings[0].price_eur}`);

    const sortDescRes = await request('/api/search-families/1/listings?sort=price_desc&limit=5');
    assert(sortDescRes.data.listings[0].price_eur === 600, `highest price should be 600, got ${sortDescRes.data.listings[0].price_eur}`);

    console.log('--- TEST 7: first_seen_at populated from listing_search_hits ---');
    const firstItem = famListRes.data.listings[0];
    assert(typeof firstItem.first_seen_at === 'string' && firstItem.first_seen_at.length > 0, `first_seen_at present: ${firstItem.first_seen_at}`);

    console.log('--- TEST 8: GET /api/campaigns/:id/route pagination and filtering ---');
    const routeRes = await request('/api/campaigns/1/route?maxDetour=10');
    assert(routeRes.status === 200, `status ${routeRes.status}`);
    assert(routeRes.data.total === 6, `route filtered total should be 6, got ${routeRes.data.total}`);
    assert(routeRes.data.listings.length === 6, `route listings length 6`);

    console.log('--- TEST 8b: counts.routed reflects total result when limit is small (limit=5) ---');
    const routeLimitRes = await request('/api/campaigns/1/route?limit=5');
    assert(routeLimitRes.status === 200, `status ${routeLimitRes.status}`);
    assert(routeLimitRes.data.listings.length === 5, `page listings length should be 5, got ${routeLimitRes.data.listings.length}`);
    assert(routeLimitRes.data.counts.total === 60, `total should be 60, got ${routeLimitRes.data.counts.total}`);
    // 40 listings have detour_min (i <= 20 has detour, i <= 40 has detour)
    assert(routeLimitRes.data.counts.routed === 40, `counts.routed should be 40, got ${routeLimitRes.data.counts.routed}`);

    console.log('--- TEST 9: Field set parity check between both endpoints ---');
    const famListingSample = famListRes.data.listings[0];
    const routeListingSample = routeRes.data.listings[0];

    const requiredFields = [
      'id', 'title', 'price', 'price_eur', 'location', 'url', 'images',
      'extracted_facts', 'niceness_score', 'llm_processed', 'full_info_obtained',
      'search_id', 'search_name', 'first_seen_at', 'lat', 'lon', 'offroute_km',
      'detour_min', 'geo_status', 'matched_terms'
    ];

    for (const f of requiredFields) {
      assert(f in famListingSample, `search-families listing missing field: ${f}`);
      assert(f in routeListingSample, `route listing missing field: ${f}`);
    }

    console.log('--- TEST 10: /api/listings honours its parameters on every scope ---');
    // It used to honour them on one of three. ?search_id=X&limit=2 returned
    // every row of that search ordered by score, and ?limit=2 with no scope
    // returned the whole table -- as a bare array, so a paginating client could
    // not even tell it had been ignored.
    const bySearch = await request('/api/listings?search_id=101&limit=2&sort=price_asc');
    assert(bySearch.status === 200, `status ${bySearch.status}`);
    assert(!Array.isArray(bySearch.data), 'a paginated request answers with an object, not a bare array');
    assert(bySearch.data.listings.length === 2, `limit honoured on search_id scope, got ${bySearch.data.listings.length}`);
    assert(
      bySearch.data.listings[0].price_eur <= bySearch.data.listings[1].price_eur,
      'sort honoured on search_id scope'
    );
    assert(bySearch.data.total > 2, `total is the search, not the page: ${bySearch.data.total}`);

    const scoped = bySearch.data.listings.every(l => l.search_id === 101);
    assert(scoped, 'search_id actually scopes the result');

    const unscoped = await request('/api/listings?limit=3');
    assert(unscoped.status === 200, `status ${unscoped.status}`);
    assert(unscoped.data.listings.length === 3, `limit honoured with no scope, got ${unscoped.data.listings.length}`);

    const offsetPage = await request('/api/listings?search_id=101&limit=2&offset=2&sort=price_asc');
    const firstIds = bySearch.data.listings.map(l => l.id).join(',');
    const secondIds = offsetPage.data.listings.map(l => l.id).join(',');
    assert(firstIds !== secondIds, `offset moves the window: ${firstIds} vs ${secondIds}`);

    // No parameters at all still answers the old way, because callers depend on it.
    const plain = await request('/api/listings?search_id=101');
    assert(Array.isArray(plain.data), 'an unparameterised request still answers with an array');

    console.log('--- TEST 11: keeping a find ---');
    // Browsing a thousand laptops turns up three worth a second look, and
    // until now there was nowhere to put them.
    const empty = await request('/api/kept');
    assert(empty.status === 200, `status ${empty.status}`);
    assert(empty.data.kept.length === 0, 'nothing kept to begin with');

    const keepId = famListRes.data.listings[0].id;
    const kept = await request(`/api/kept/${keepId}`, { method: 'PUT', body: JSON.stringify({ note: 'zweiter Blick' }) });
    assert(kept.status === 200, `keep status ${kept.status}`);

    const afterKeep = await request('/api/kept');
    assert(afterKeep.data.kept.length === 1, `one kept, got ${afterKeep.data.kept.length}`);
    assert(afterKeep.data.kept[0].listing_id === String(keepId), 'the right one');
    assert(afterKeep.data.kept[0].note === 'zweiter Blick', 'the note survives');

    // Keeping twice is keeping once. A double tap must not produce two rows or
    // an error the buyer cannot act on.
    const again = await request(`/api/kept/${keepId}`, { method: 'PUT', body: JSON.stringify({ note: 'doch nicht' }) });
    assert(again.status === 200, `second keep status ${again.status}`);
    const afterTwice = await request('/api/kept');
    assert(afterTwice.data.kept.length === 1, 'still one row');
    assert(afterTwice.data.kept[0].note === 'doch nicht', 'the note is updated');

    // An id that names nothing is refused rather than stored as a row nobody
    // can explain later.
    const ghost = await request('/api/kept/does-not-exist', { method: 'PUT', body: '{}' });
    assert(ghost.status === 404, `unknown listing should 404, got ${ghost.status}`);

    const released = await request(`/api/kept/${keepId}`, { method: 'DELETE' });
    assert(released.status === 200, `release status ${released.status}`);
    assert((await request('/api/kept')).data.kept.length === 0, 'released');

    console.log('--- TEST 12: what the buyer wants, beyond what the site can filter ---');
    // Kleinanzeigen can narrow to "PC accessories, memory, up to 150 EUR". It
    // cannot say "two sticks of sixteen gigabytes at 3200 CL16", and that is
    // the difference between 84 offers and the nine worth opening.
    const none = await request('/api/searches/101/requirements');
    assert(none.status === 200, `status ${none.status}`);
    assert(none.data.requirements.length === 0, 'nothing required to begin with');

    const wants = [
      { id: 'stickCount', importance: 'high', buyer_wants: { min: 2, max: 2 } },
      { id: 'speedMhz', importance: 'high', buyer_wants: { min: 3200 } },
      { id: 'generation', importance: 'high', buyer_wants: { preferred: ['ddr4'] } },
    ];
    const saved = await request('/api/searches/101/requirements', {
      method: 'PUT', body: JSON.stringify({ requirements: wants }),
    });
    assert(saved.status === 200, `save status ${saved.status}`);
    assert(saved.data.knowledge_set_id, 'a knowledge set was created to hold them');

    const back = await request('/api/searches/101/requirements');
    assert(back.data.requirements.length === 3, `three requirements, got ${back.data.requirements.length}`);
    assert(back.data.requirements[1].buyer_wants.min === 3200, 'values survive the round trip');

    // The pipeline reads these as its intent, so they have to be in the shape
    // scoring.py understands. An operator it does not know is ignored in
    // silence -- a requirement that looks set and does nothing.
    const nonsense = await request('/api/searches/101/requirements', {
      method: 'PUT',
      body: JSON.stringify({ requirements: [{ id: 'speedMhz', buyer_wants: { faster_than: 3200 } }] }),
    });
    assert(nonsense.status === 400, `an unknown operator must be refused, got ${nonsense.status}`);
    assert(/faster_than/.test(nonsense.data.error), `and named: ${nonsense.data.error}`);

    const unchanged = await request('/api/searches/101/requirements');
    assert(unchanged.data.requirements.length === 3, 'a refused write changes nothing');

    const ghostSearch = await request('/api/searches/99999/requirements', {
      method: 'PUT', body: JSON.stringify({ requirements: wants }),
    });
    assert(ghostSearch.status === 404, `unknown search should 404, got ${ghostSearch.status}`);

    console.log('ALL P1B ENDPOINT TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.kill();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  }
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
