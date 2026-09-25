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
    await runDb(db, `ALTER TABLE searches ADD COLUMN item_json TEXT`);

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

    // A second campaign, so that the precedence in /api/campaigns is actually
    // exercised. Campaign 1 has a route and a family that see the same sixty
    // listings, so picking either one reads the same and a wrong precedence
    // passes unnoticed. Here the three counts are deliberately different:
    // route 3, family 8, campaign 26.
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (2, 'Werkbank Jagd')`);
    await runDb(db, `INSERT INTO search_families (id, campaign_id, name, base_url, enabled, created_at)
                     VALUES (2, 2, 'Werkbank', 'https://kleinanzeigen.de/s-werkbank/k0', 1, datetime('now'))`);
    await runDb(db, `INSERT INTO search_family_terms (id, family_id, term, label, enabled, position)
                     VALUES (30, 2, 'Werkbank', 'Werkbank', 1, 0),
                            (40, 2, 'Schraubstock', 'Schraubstock', 1, 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled, last_scraped_at)
                     VALUES (201, 2, 'Werkbank Augsburg', 'https://kleinanzeigen.de/s-201', 1, datetime('now')),
                            (202, 2, 'Schraubstock Augsburg', 'https://kleinanzeigen.de/s-202', 1, datetime('now')),
                            (203, 2, 'Schraubstock alt', 'https://kleinanzeigen.de/s-203', 1, datetime('now')),
                            (204, 2, 'Ohne Familie', 'https://kleinanzeigen.de/s-204', 1, datetime('now'))`);
    // 203 is a search the family was re-aimed away from: kept, not shown. The
    // results screen filters it out, so the number on the list must too.
    await runDb(db, `INSERT INTO search_family_searches (family_id, term_id, search_id, active)
                     VALUES (2, 30, 201, 1),
                            (2, 40, 202, 1),
                            (2, 40, 203, 0)`);
    // The route sees one of the family's searches, not all of them.
    await runDb(db, `INSERT INTO route_searches (id, campaign_id, family_id, name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at)
                     VALUES (60, 2, 2, 'Augsburg nach Ulm', 'https://kleinanzeigen.de/s-werkbank/k0', 'Augsburg', 'Ulm', 30, 20, '{"distance_km":80,"duration_min":60,"polyline":[],"circles":[]}', datetime('now'))`);
    await runDb(db, `INSERT INTO route_search_circles (route_search_id, search_id, radius_km, label)
                     VALUES (60, 201, 30, 'Augsburg')`);

    for (const [searchId, count] of [[201, 3], [202, 5], [203, 7], [204, 11]]) {
      for (let i = 1; i <= count; i++) {
        const id = `werkbank-${searchId}-${i}`;
        await runDb(db, `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
                         VALUES (?, ?, ?, ?, 'Augsburg', ?, 50, ?)`,
          [id, `Werkbank ${searchId} Nr ${i}`, `${i * 20} €`, i * 20, `https://kleinanzeigen.de/${id}`, searchId]);
        await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
                         VALUES (?, ?, ?)`, [id, searchId, now.toISOString()]);
      }
    }

    // And a campaign with neither, so the plain branch is covered too: a
    // search of its own, four listings, nothing else.
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (3, 'Drucker Jagd')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled)
                     VALUES (301, 3, 'Drucker', 'https://kleinanzeigen.de/s-301', 1)`);
    for (let i = 1; i <= 4; i++) {
      const id = `drucker-${i}`;
      await runDb(db, `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
                       VALUES (?, ?, ?, ?, 'Ulm', ?, 50, 301)`,
        [id, `Drucker Nr ${i}`, `${i * 30} €`, i * 30, `https://kleinanzeigen.de/${id}`]);
      await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
                       VALUES (?, 301, ?)`, [id, now.toISOString()]);
    }

    // A listing two searches found, in two different campaigns. l.search_id is
    // the first finder and never changes, so a scope built on it alone hides
    // this row from the search that found it second.
    await runDb(db, `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
                     VALUES ('shared-1', 'Werkbank geteilt', '90 €', 90, 'Ulm', 'https://kleinanzeigen.de/shared-1', 50, 301)`);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
                     VALUES ('shared-1', 301, '2026-09-01T00:00:00.000Z'),
                            ('shared-1', 202, '2026-09-10T00:00:00.000Z')`);

    // Campaign 4: Memory hunt for overview endpoint testing
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (4, 'Corsair Jagd')`);
    await runDb(
      db,
      `INSERT INTO knowledge_sets (id, name, item_json) VALUES (4, 'Corsair Knowledge', ?)`,
      [
        JSON.stringify({
          fields: [
            { id: 'stickCount', buyer_wants: { min: 2, max: 2 } },
            { id: 'speedMhz', buyer_wants: { min: 3200 } },
            { id: 'generation', buyer_wants: { preferred: ['ddr4'] } },
          ],
        }),
      ]
    );
    await runDb(
      db,
      `INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id, enabled)
       VALUES (401, 4, 'Corsair Vengeance', 'https://kleinanzeigen.de/s-corsair', 4, 1)`
    );

    const memListings = [
      { id: 'mem-1', price: 20, verdict: 'fit', reason: null, facts: { stickCount: 2, speedMhz: 3200, generation: 'ddr4' }, title: 'Corsair Vengeance RGB 16GB' },
      { id: 'mem-2', price: 30, verdict: 'fit', reason: null, facts: { stickCount: 2, speedMhz: 3600, generation: 'ddr4' }, title: 'Corsair Vengeance LPX 16GB' },
      { id: 'mem-3', price: 40, verdict: 'fit', reason: null, facts: { stickCount: 2, speedMhz: 3200, generation: 'ddr4' }, title: 'Corsair Vengeance Pro' },
      { id: 'mem-4', price: 50, verdict: 'unclear', reason: null, facts: { stickCount: 2, generation: 'ddr4' }, title: 'Corsair RAM DDR4' },
      { id: 'mem-5', price: 100, verdict: 'unclear', reason: null, facts: { speedMhz: 3200, generation: 'ddr4' }, title: 'Corsair Vengeance' },
      { id: 'mem-6', price: 110, verdict: 'no', reason: 'Anzahl Module 4 statt 2', facts: { stickCount: 4, speedMhz: 3200, generation: 'ddr4' }, title: 'Corsair Quad Kit' },
      { id: 'mem-7', price: 120, verdict: 'no', reason: 'Anzahl Module 4 statt 2', facts: { stickCount: 4, speedMhz: 3000, generation: 'ddr4' }, title: 'Corsair 4x8GB' },
      { id: 'mem-8', price: 130, verdict: 'no', reason: 'Anzahl Module 4 statt 2', facts: { stickCount: 4, speedMhz: 3200, generation: 'ddr4' }, title: 'Corsair 4 Riegel' },
      { id: 'mem-9', price: 140, verdict: 'no', reason: 'Taktung 3000 MHz statt mind. 3200 MHz', facts: { stickCount: 2, speedMhz: 3000, generation: 'ddr4' }, title: 'Corsair 3000MHz' },
      { id: 'mem-10', price: 150, verdict: 'no', reason: 'Taktung 2666 MHz statt mind. 3200 MHz', facts: { stickCount: 2, speedMhz: 2666, generation: 'ddr4' }, title: 'Corsair 2666MHz' },
    ];

    for (const m of memListings) {
      await runDb(
        db,
        `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
         VALUES (?, ?, ?, ?, 'München', ?, 50, 401)`,
        [m.id, m.title, `${m.price} €`, m.price, `https://kleinanzeigen.de/${m.id}`]
      );
      await runDb(
        db,
        `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, 401, ?)`,
        [m.id, now.toISOString()]
      );
      await runDb(
        db,
        `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
         VALUES (?, 401, ?, ?, ?, 'title', ?)`,
        [m.id, m.verdict, m.reason, JSON.stringify(m.facts), now.toISOString()]
      );
    }


    // Campaign 5: Käufersprache and wants.match contradicts evaluation
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (5, 'Käufersprache Jagd')`);
    await runDb(
      db,
      `INSERT INTO knowledge_sets (id, name, item_json) VALUES (5, 'Käufersprache Knowledge', ?)`,
      [
        JSON.stringify({
          fields: [
            { id: 'stickCount', buyer_wants: { match: 2 } },
            { id: 'gbPerStick', buyer_wants: { match: 16 } },
            { id: 'generation', buyer_wants: { match: 'ddr4' } },
            { id: 'speedMhz', buyer_wants: { match: 3200 } },
            { id: 'casLatency', buyer_wants: { max: 16 } },
            { id: 'formFactor', buyer_wants: { match: 'dimm' } },
          ],
        }),
      ]
    );
    await runDb(
      db,
      `INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id, enabled)
       VALUES (501, 5, 'Käufersprache Search', 'https://kleinanzeigen.de/s-kaeufer', 5, 1)`
    );

    const buyerListings = [
      { id: 'b-1', price: 100, verdict: 'fit', reason: null, facts: { stickCount: 2, gbPerStick: 16, generation: 'ddr4', speedMhz: 3200, casLatency: 16, formFactor: 'dimm' }, title: 'Perfekter RAM' },
      { id: 'b-2', price: 90, verdict: 'no', reason: 'SODIMM statt DIMM', facts: { stickCount: 4, gbPerStick: 8, generation: 'ddr4', speedMhz: 3200, casLatency: 18, formFactor: 'sodimm' }, title: 'Falscher RAM' },
    ];

    for (const b of buyerListings) {
      await runDb(
        db,
        `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
         VALUES (?, ?, ?, ?, 'Berlin', ?, 50, 501)`,
        [b.id, b.title, `${b.price} €`, b.price, `https://kleinanzeigen.de/${b.id}`]
      );
      await runDb(
        db,
        `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, 501, ?)`,
        [b.id, now.toISOString()]
      );
      await runDb(
        db,
        `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
         VALUES (?, 501, ?, ?, ?, 'title', ?)`,
        [b.id, b.verdict, b.reason, JSON.stringify(b.facts), now.toISOString()]
      );
    }

    // --- Campaign 6 & 7 for #3: Cross-campaign fit isolation ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (6, 'Kampagne A')`);
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (7, 'Kampagne B')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (601, 6, 'Suche A', 'https://example.com/a', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (701, 7, 'Suche B', 'https://example.com/b', 1)`);

    // Listing found first by Campaign A (search 601), rejected in A ('no')
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('cross-camp-1', 'Cross-Campaign Listing', '100 €', 100, 'Berlin', 'https://example.com/cc1', 50, 601)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('cross-camp-1', 601, ?)`, [now.toISOString()]);
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('cross-camp-1', 601, 'no', 'Falsche Farbe', '{}', 'title', ?)`,
      [now.toISOString()]
    );

    // Later, Campaign B also finds cross-camp-1, but has NO verdict for it in search 701
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('cross-camp-1', 701, ?)`, [now.toISOString()]);

    // --- Campaign 8 for #4: Best verdict wins (fit > unclear > no) & exact row consistency ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (8, 'Multi Verdict Campaign')`);
    await runDb(
      db,
      `INSERT INTO knowledge_sets (id, name, item_json) VALUES (8, 'Multi Knowledge', ?)`,
      [
        JSON.stringify({
          fields: [
            { id: 'gbPerStick', buyer_wants: { match: 16 } },
          ],
        }),
      ]
    );
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id, enabled) VALUES (801, 8, 'Suche 801', 'https://example.com/801', 8, 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, knowledge_set_id, enabled) VALUES (802, 8, 'Suche 802', 'https://example.com/802', 8, 1)`);

    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('multi-verdict-1', 'Multi Verdict Item', '80 €', 80, 'Hamburg', 'https://example.com/mv1', 50, 801)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('multi-verdict-1', 801, ?)`, [now.toISOString()]);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('multi-verdict-1', 802, ?)`, [now.toISOString()]);

    // In Search 801: verdict 'fit', reason 'matched 16GB', facts { gbPerStick: 16 }
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('multi-verdict-1', 801, 'fit', 'Passend 16GB', '{"gbPerStick": 16}', 'title', ?)`,
      [now.toISOString()]
    );
    // In Search 802: verdict 'unclear', reason 'unclear speed', facts { gbPerStick: null }
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('multi-verdict-1', 802, 'unclear', 'Taktung unklar', '{"gbPerStick": null}', 'title', ?)`,
      [now.toISOString()]
    );

    // --- Finding 3 Fixture: Route listing count over listing_search_hits ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (9, 'Route Count Campaign')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (901, 9, 'Circle 901', 'https://example.com/901', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (999, 9, 'Foreign Finder 999', 'https://example.com/999', 1)`);
    await runDb(db, `INSERT INTO route_searches (id, campaign_id, name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at)
                     VALUES (90, 9, 'Route 90', 'https://example.com/r90', 'A', 'B', 10, 10, '{}', datetime('now'))`);
    await runDb(db, `INSERT INTO route_search_circles (route_search_id, search_id, radius_km, label) VALUES (90, 901, 10, 'Circle 901')`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('foreign-route-1', 'Foreign Finder Listing', '50 €', 50, 'Ulm', 'https://example.com/fr1', 50, 999)`
    );
    // Listing found first by 999, then found by route circle 901:
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('foreign-route-1', 999, ?)`, [now.toISOString()]);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('foreign-route-1', 901, ?)`, [now.toISOString()]);

    // --- Finding 4 Fixture: Route corridor with deleted first finder ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (12, 'Deleted First Finder Campaign')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1201, 12, 'Kreis 1201', 'https://example.com/1201', 1)`);
    await runDb(db, `INSERT INTO route_searches (id, campaign_id, name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at)
                     VALUES (120, 12, 'Route 120', 'https://example.com/r120', 'A', 'B', 10, 10, '{}', datetime('now'))`);
    await runDb(db, `INSERT INTO route_search_circles (route_search_id, search_id, radius_km, label) VALUES (120, 1201, 10, 'Kreis 1201')`);
    // First finder 998 is NOT in searches table (simulates deleted search):
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('deleted-finder-1', 'Deleted Finder Listing', '60 €', 60, 'Kempten', 'https://example.com/df1', 50, 998)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('deleted-finder-1', 1201, ?)`, [now.toISOString()]);
    await runDb(
      db,
      `INSERT INTO listing_route_geo (listing_id, route_search_id, lat, lon, offroute_km, detour_min, computed_at, status)
       VALUES ('deleted-finder-1', 120, 47.7, 10.3, 1.0, 3.0, datetime('now'), 'routed')`
    );

    // --- Finding 1 within-campaign Fixture: Campaign 11 (Term 1 'unclear', Term 2 'fit') ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (11, 'Campaign 11 Multi Verdict')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1101, 11, 'Suche 1101', 'https://example.com/1101', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1102, 11, 'Suche 1102', 'https://example.com/1102', 1)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('c11-item-1', 'Campaign 11 Item', '70 €', 70, 'Augsburg', 'https://example.com/c11', 50, 1101)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('c11-item-1', 1101, ?)`, [now.toISOString()]);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('c11-item-1', 1102, ?)`, [now.toISOString()]);
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('c11-item-1', 1101, 'unclear', 'Taktung unklar', '{"speedMhz": null}', 'title', ?)`,
      [now.toISOString()]
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('c11-item-1', 1102, 'fit', 'Passend 16GB', '{"speedMhz": 3200}', 'title', ?)`,
      [now.toISOString()]
    );

    // --- Finding 5 Fixture: Search family listings naked column / best verdict ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (13, 'Family 13 Campaign')`);
    await runDb(db, `INSERT INTO search_families (id, campaign_id, name, base_url, enabled, created_at)
                     VALUES (13, 13, 'Family 13', 'https://example.com/fam13', 1, datetime('now'))`);
    await runDb(db, `INSERT INTO search_family_terms (id, family_id, term, label, enabled, position)
                     VALUES (1301, 13, 'term-a', 'Term A', 1, 0),
                            (1302, 13, 'term-b', 'Term B', 1, 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1311, 13, 'Suche 1311', 'https://example.com/1311', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1312, 13, 'Suche 1312', 'https://example.com/1312', 1)`);
    await runDb(db, `INSERT INTO search_family_searches (family_id, term_id, search_id) VALUES (13, 1301, 1311), (13, 1302, 1312)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('fam-mv-1', 'Family Multi Verdict Item', '95 €', 95, 'Nürnberg', 'https://example.com/fmv1', 50, 1311)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('fam-mv-1', 1311, ?)`, [now.toISOString()]);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('fam-mv-1', 1312, ?)`, [now.toISOString()]);
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('fam-mv-1', 1311, 'unclear', 'Unklar 1311', '{"spec": "unknown"}', 'title', ?)`,
      [now.toISOString()]
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('fam-mv-1', 1312, 'fit', 'Perfekt 1312', '{"spec": "gold"}', 'title', ?)`,
      [now.toISOString()]
    );

    // --- Finding 1 Fixture: Route corridor best verdict (older fit vs newer unclear) ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (14, 'Route Multi-Circle Fit Campaign')`);
    await runDb(
      db,
      `INSERT INTO route_searches (id, campaign_id, name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at)
       VALUES (14, 14, 'Route 14 Corridor', 'https://example.com/route14', 'Nürnberg', 'Fürth', 25, 10, '{"polyline":[],"circles":[]}', datetime('now'))`
    );
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1401, 14, 'Kreis 1401', 'https://example.com/1401', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1402, 14, 'Kreis 1402', 'https://example.com/1402', 1)`);
    await runDb(
      db,
      `INSERT INTO route_search_circles (route_search_id, search_id, radius_km, label, location_id)
       VALUES (14, 1401, 20, 'Kreis 1401', 1401),
              (14, 1402, 20, 'Kreis 1402', 1402)`
    );
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('route-mv-1', 'Route Multi Verdict Laptop', '250 €', 250, 'Nürnberg', 'https://example.com/rmv1', 80, 1401)`
    );
    await runDb(
      db,
      `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
       VALUES ('route-mv-1', 1401, datetime('now', '-2 days'))`
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('route-mv-1', 1401, 'fit', 'Perfekter Zustand Kreis 1', '{"ram": 16}', 'title', datetime('now', '-2 days'))`
    );
    await runDb(
      db,
      `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at)
       VALUES ('route-mv-1', 1402, datetime('now', '-1 days'))`
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('route-mv-1', 1402, 'unclear', 'Unklarer Zustand Kreis 2', '{"ram": 8}', 'title', datetime('now', '-1 days'))`
    );

    // --- Finding 3 Fixture: annotateDeals scope isolation ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (15, 'Campaign A Deals'), (16, 'Campaign B Deals')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1501, 15, 'Search 1501', 'https://example.com/1501', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1601, 16, 'Search 1601', 'https://example.com/1601', 1)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id) VALUES
        ('scope-deal-1', 'Cross-Campaign Deal Candidate', '100 €', 100, 'Berlin', 'https://example.com/sd1', 90, 1501),
        ('s15-1', 'Item 15-1', '100 €', 100, 'Berlin', 'https://example.com/s151', 50, 1501),
        ('s15-2', 'Item 15-2', '100 €', 100, 'Berlin', 'https://example.com/s152', 50, 1501),
        ('s15-3', 'Item 15-3', '100 €', 100, 'Berlin', 'https://example.com/s153', 50, 1501),
        ('s15-4', 'Item 15-4', '100 €', 100, 'Berlin', 'https://example.com/s154', 50, 1501),
        ('s16-1', 'Item 16-1', '300 €', 300, 'Berlin', 'https://example.com/s161', 50, 1601),
        ('s16-2', 'Item 16-2', '300 €', 300, 'Berlin', 'https://example.com/s162', 50, 1601),
        ('s16-3', 'Item 16-3', '300 €', 300, 'Berlin', 'https://example.com/s163', 50, 1601),
        ('s16-4', 'Item 16-4', '300 €', 300, 'Berlin', 'https://example.com/s164', 50, 1601)`
    );
    await runDb(
      db,
      `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES
        ('scope-deal-1', 1501, datetime('now')),
        ('scope-deal-1', 1601, datetime('now')),
        ('s15-1', 1501, datetime('now')),
        ('s15-2', 1501, datetime('now')),
        ('s15-3', 1501, datetime('now')),
        ('s15-4', 1501, datetime('now')),
        ('s16-1', 1601, datetime('now')),
        ('s16-2', 1601, datetime('now')),
        ('s16-3', 1601, datetime('now')),
        ('s16-4', 1601, datetime('now'))`
    );

    // --- Finding 4 Fixture: Kept listings best verdict across hits ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (17, 'Kampagne 17 Alt'), (18, 'Kampagne 18 Neu')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1701, 17, 'Alt-Suche', 'https://example.com/1701', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1702, 18, 'Neu-Suche', 'https://example.com/1702', 1)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('kept-item-1', 'Kept Multi Verdict Laptop', '400 €', 400, 'München', 'https://example.com/kmv1', 75, 1701)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('kept-item-1', 1701, datetime('now', '-3 days'))`);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('kept-item-1', 1702, datetime('now', '-1 days'))`);
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('kept-item-1', 1701, 'no', 'Zu alt', '{"age": 10}', 'title', datetime('now', '-3 days'))`
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('kept-item-1', 1702, 'fit', 'Perfekt passend', '{"kept": true}', 'title', datetime('now', '-1 days'))`
    );

    // --- Finding 5 Fixture: recalculateItemScores via listing_search_hits ---
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1801, 18, 'Recalc Search', 'https://example.com/1801', 1)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id, extracted_facts)
       VALUES ('recalc-hit-1', 'Recalc Test Laptop', '500 €', 500, 'Köln', 'https://example.com/rh1', 0, 9998, '{"ssd": "yes"}')`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('recalc-hit-1', 1801, datetime('now'))`);

    // --- Finding 6 Fixture: Unfiltered /api/listings best verdict across hits ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (19, 'Campaign 19 Unfiltered')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1901, 19, 'Search 1901', 'https://example.com/1901', 1)`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (1902, 19, 'Search 1902', 'https://example.com/1902', 1)`);
    await runDb(
      db,
      `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
       VALUES ('unfiltered-mv-1', 'Unfiltered Multi Verdict Laptop', '600 €', 600, 'Hamburg', 'https://example.com/umv1', 70, 1901)`
    );
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('unfiltered-mv-1', 1901, datetime('now', '-2 days'))`);
    await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('unfiltered-mv-1', 1902, datetime('now', '-1 days'))`);
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('unfiltered-mv-1', 1901, 'unclear', 'Erster Fund Unklar', '{"src": 1901}', 'title', datetime('now', '-2 days'))`
    );
    await runDb(
      db,
      `INSERT INTO listing_fit (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
       VALUES ('unfiltered-mv-1', 1902, 'fit', 'Zweiter Fund Fit', '{"src": 1902}', 'title', datetime('now', '-1 days'))`
    );

    // --- One listing by id, and equal prices ordered by score ---
    await runDb(db, `INSERT INTO campaigns (id, name) VALUES (20, 'Campaign 20 Same Price')`);
    await runDb(db, `INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (2001, 20, 'Search 2001', 'https://example.com/2001', 1)`);
    for (const [id, score] of [['same-low', 40], ['same-high', 90], ['same-none', null]]) {
      await runDb(
        db,
        `INSERT INTO listings (id, title, price, price_eur, location, url, niceness_score, search_id)
         VALUES (?, 'Same Price Kit', '150 €', 150, 'Ulm', 'https://example.com/sp', ?, 2001)`,
        [id, score]
      );
      await runDb(db, `INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, 2001, datetime('now'))`, [id]);
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

    console.log('--- TEST 13: deals only, on an ordinary search too ---');
    // The family endpoint has filtered deals on the server since the count had
    // to be right. /api/listings ignored the parameter, so pressing the pill on
    // an ordinary search did nothing at all and said nothing about it.
    const allOfIt = await request('/api/listings?campaign_id=1&limit=100');
    const dealsOnly = await request('/api/listings?campaign_id=1&limit=100&dealsOnly=1');
    assert(dealsOnly.status === 200, `status ${dealsOnly.status}`);
    assert(
      dealsOnly.data.total <= allOfIt.data.total,
      `deals are a subset: ${dealsOnly.data.total} of ${allOfIt.data.total}`
    );
    assert(
      dealsOnly.data.listings.every(l => l.is_deal),
      'and every row that comes back is one'
    );
    // The count is the filtered set, not the page and not the unfiltered total.
    assert(
      dealsOnly.data.total === dealsOnly.data.listings.length ||
        dealsOnly.data.listings.length === 100,
      `total ${dealsOnly.data.total} must describe what was returned`
    );

    console.log('--- TEST 13b: a listing belongs to every search that found it ---');
    // Not only to the one that found it first. Scoping on listings.search_id
    // made a search that had just harvested a row answer without it, and
    // showed the first finder's date under the search now looking at it.
    const secondFinder = await request('/api/listings?search_id=202&limit=50');
    const sharedRow = secondFinder.data.listings.find(l => l.id === 'shared-1');
    assert(sharedRow, 'search 202 found it, so search 202 must show it');
    assert(
      sharedRow.first_seen_at.startsWith('2026-09-10'),
      `the date is when *this* search saw it, got ${sharedRow.first_seen_at}`
    );

    const firstFinder = await request('/api/listings?search_id=301&limit=60');
    assert(
      firstFinder.data.listings.some(l => l.id === 'shared-1'),
      'and the search that found it first still shows it'
    );

    // The campaign it was found in second holds it too.
    const secondCampaign = await request('/api/listings?campaign_id=2&limit=50');
    assert(
      secondCampaign.data.listings.some(l => l.id === 'shared-1'),
      'campaign 2 harvested it, so campaign 2 holds it'
    );

    console.log('--- TEST 14: the number on the list is the number in the results ---');
    // A number that changes when you tap it is worse than no number. The list
    // counted every listing of every search in the campaign; the results ask
    // whichever endpoint the campaign's shape demands, and a campaign with both
    // a route and a family resolves to the route.
    const campaigns = await request('/api/campaigns');
    assert(campaigns.status === 200, `status ${campaigns.status}`);

    for (const campaign of campaigns.data) {
      assert(
        typeof campaign.listing_count === 'number',
        `campaign ${campaign.id} must say how many it will show`
      );

      let shown;
      if (campaign.route_id) {
        shown = (await request(`/api/campaigns/${campaign.id}/route?limit=1`)).data.total;
      } else if (campaign.family_id) {
        shown = (await request(`/api/search-families/${campaign.family_id}/listings?limit=1`)).data.total;
      } else {
        shown = (await request(`/api/listings?campaign_id=${campaign.id}&limit=1`)).data.total;
      }

      assert(
        campaign.listing_count === shown,
        `campaign ${campaign.id}: list says ${campaign.listing_count}, results say ${shown}`
      );
    }

    // Equality alone cannot catch a wrong precedence when the candidates agree,
    // so campaign 2 was seeded to make them disagree: its route sees 3, its
    // family 8, the whole campaign 26. Naming the numbers means a rule that
    // reaches for the family first goes red here instead of passing quietly.
    const werkbank = campaigns.data.find(c => c.id === 2);
    assert(werkbank, 'campaign 2 must exist for the precedence to be testable');
    assert(werkbank.route_id && werkbank.family_id, 'campaign 2 has both a route and a family');
    assert(
      Number(werkbank.route_listings) === 3,
      `route sees 3, got ${werkbank.route_listings}`
    );
    assert(
      Number(werkbank.family_listings) === 9,
      `family sees 9 -- the re-aimed search is kept, not shown -- got ${werkbank.family_listings}`
    );
    assert(
      Number(werkbank.campaign_listings) === 27,
      `the whole campaign holds 27 -- 26 of its own plus one a second search found -- got ${werkbank.campaign_listings}`
    );
    assert(
      werkbank.listing_count === 3,
      `a route wins over a family: expected 3, got ${werkbank.listing_count}`
    );

    const drucker = campaigns.data.find(c => c.id === 3);
    assert(drucker, 'campaign 3 must exist for the plain branch to be testable');
    assert(!drucker.route_id && !drucker.family_id, 'campaign 3 has neither');
    assert(
      drucker.listing_count === 5,
      `a campaign with neither counts its own searches: expected 5, got ${drucker.listing_count}`
    );

    console.log('--- TEST 15: a re-aimed family counts only what it still searches ---');
    // A family keeps its old links so the listings they found stay reachable,
    // but it does not search through them any more. Counting them made every
    // number grow each time a town or a radius was edited. Family 2 has one
    // retired link holding seven listings.
    const families = await request('/api/search-families?campaign_id=2');
    assert(families.status === 200, `status ${families.status}`);
    const fam2 = families.data.find(f => f.id === 2);
    assert(fam2, 'family 2 must be listed');
    assert(Number(fam2.searches) === 2, `two live searches, got ${fam2.searches}`);
    assert(
      Number(fam2.listings) === 9,
      `the retired link's seven do not count: expected 9, got ${fam2.listings}`
    );

    const fam2Detail = await request('/api/search-families/2');
    const schraubstock = fam2Detail.data.terms.find(t => t.term === 'Schraubstock');
    assert(schraubstock, 'the Schraubstock term must be there');
    assert(
      Number(schraubstock.listings) === 6,
      `its live search holds 5 plus the shared one, not the retired 7: got ${schraubstock.listings}`
    );

    console.log('--- TEST 16: GET /api/campaigns/:id/overview - pots, rejections, market, survivors ---');
    const overviewRes = await request('/api/campaigns/4/overview');
    assert(overviewRes.status === 200, `status ${overviewRes.status}`);
    const ov = overviewRes.data;

    // 1. Pots
    assert(ov.pots.all === 10, `pots.all should be 10, got ${ov.pots.all}`);
    assert(ov.pots.fit === 3, `pots.fit should be 3, got ${ov.pots.fit}`);
    assert(ov.pots.unclear === 2, `pots.unclear should be 2, got ${ov.pots.unclear}`);
    assert(ov.pots.no === 5, `pots.no should be 5, got ${ov.pots.no}`);
    assert(ov.pots.alle === 10, `pots.alle should be 10, got ${ov.pots.alle}`);
    assert(ov.pots.passend === 3, `pots.passend should be 3, got ${ov.pots.passend}`);
    assert(ov.pots.unklar === 2, `pots.unklar should be 2, got ${ov.pots.unklar}`);
    assert(ov.pots.abgelehnt === 5, `pots.abgelehnt should be 5, got ${ov.pots.abgelehnt}`);

    // 2. Rejections (aggregated from text)
    assert(Array.isArray(ov.rejections), 'rejections should be an array');
    assert(ov.rejections.length === 2, `expected 2 rejection groups, got ${ov.rejections.length}`);
    const modulesGroup = ov.rejections.find(r => r.reason === 'Anzahl Module 4 statt 2');
    assert(modulesGroup && modulesGroup.count === 3, `expected 3 for modules, got ${modulesGroup?.count}`);
    const clockGroup = ov.rejections.find(r => r.reason === 'Taktung unter mind. 3200 MHz');
    assert(clockGroup && clockGroup.count === 2, `expected 2 for clock under 3200 MHz, got ${clockGroup?.count}`);

    // 3. Market histogram & reference pricing
    assert(ov.market && typeof ov.market === 'object', 'market should be present');
    assert(ov.market.count === 10, `market count should be 10, got ${ov.market.count}`);
    assert(ov.market.min === 20, `market min should be 20, got ${ov.market.min}`);
    assert(ov.market.max === 150, `market max should be 150, got ${ov.market.max}`);
    assert(typeof ov.market.median === 'number', `median should be number, got ${ov.market.median}`);
    assert(Array.isArray(ov.market.bins) && ov.market.bins.length >= 2, `market bins should have >= 2 bins, got ${ov.market.bins.length}`);
    const binTotal = ov.market.bins.reduce((sum, b) => sum + b.count, 0);
    assert(binTotal === 10, `sum of bin counts should be 10, got ${binTotal}`);

    // 4. Requirements & Survivors
    assert(Array.isArray(ov.requirements), 'requirements should be an array');
    assert(ov.requirements.length === 3, `expected 3 requirements, got ${ov.requirements.length}`);
    const stickReq = ov.requirements.find(r => r.id === 'stickCount');
    assert(stickReq, 'stickCount requirement should exist');
    assert(stickReq.text === 'Zwei Riegel', `expected "Zwei Riegel", got ${stickReq.text}`);
    assert(stickReq.survivors === 7, `expected 7 survivors for stickCount, got ${stickReq.survivors}`);
    assert(stickReq.contradicted === 3, `expected 3 contradicted for stickCount, got ${stickReq.contradicted}`);

    const speedReq = ov.requirements.find(r => r.id === 'speedMhz');
    assert(speedReq, 'speedMhz requirement should exist');
    assert(speedReq.text === 'ab 3200 MHz', `expected "ab 3200 MHz", got ${speedReq.text}`);
    assert(speedReq.survivors === 7, `expected 7 survivors for speedMhz, got ${speedReq.survivors}`);
    assert(speedReq.contradicted === 3, `expected 3 contradicted for speedMhz, got ${speedReq.contradicted}`);

    console.log('--- TEST 17: overview honours active filters (q, dealsOnly, price) ---');
    // Filter by query q
    const filteredQ = await request('/api/campaigns/4/overview?q=RGB');
    assert(filteredQ.status === 200, `status ${filteredQ.status}`);
    assert(filteredQ.data.pots.all === 1, `q=RGB should match 1 listing, got ${filteredQ.data.pots.all}`);
    assert(filteredQ.data.pots.fit === 1, `q=RGB should have fit 1, got ${filteredQ.data.pots.fit}`);
    assert(filteredQ.data.pots.no === 0, `q=RGB should have no 0, got ${filteredQ.data.pots.no}`);

    // Filter by price range
    const filteredPrice = await request('/api/campaigns/4/overview?min_price=100&max_price=130');
    assert(filteredPrice.status === 200, `status ${filteredPrice.status}`);
    assert(filteredPrice.data.pots.all === 4, `price 100-130 should have 4 listings, got ${filteredPrice.data.pots.all}`);
    assert(filteredPrice.data.market.count === 4, `market count should be 4, got ${filteredPrice.data.market.count}`);
    assert(filteredPrice.data.market.min === 100, `market min should be 100, got ${filteredPrice.data.market.min}`);
    assert(filteredPrice.data.market.max === 130, `market max should be 130, got ${filteredPrice.data.market.max}`);

    // Filter by dealsOnly
    const filteredDeals = await request('/api/campaigns/4/overview?dealsOnly=1');
    assert(filteredDeals.status === 200, `status ${filteredDeals.status}`);
    assert(filteredDeals.data.pots.all <= 2, `deals should be at most 2, got ${filteredDeals.data.pots.all}`);
    assert(filteredDeals.data.market.count === filteredDeals.data.pots.all, 'market count must match deals pots');

    console.log('--- TEST 18: overview respects search_family_searches.active = 1 and search endpoint ---');
    const famOverview = await request('/api/campaigns/2/overview');
    assert(famOverview.status === 200, `status ${famOverview.status}`);
    // Campaign 2 is a family with a corridor. Its list comes from the family
    // endpoint, so its counts must too: the route alone said 3 while the list
    // showed the family's listings.
    const famList = await request('/api/search-families/2/listings?limit=100');
    assert(famOverview.data.pots.all === famList.data.total,
      `a hunt with a corridor counts what its list shows: ${famOverview.data.pots.all} vs ${famList.data.total}`);
    assert(famOverview.data.pots.all !== 3, 'not the route alone');

    // Search overview endpoint
    const searchOverview = await request('/api/searches/401/overview');
    assert(searchOverview.status === 200, `status ${searchOverview.status}`);
    assert(searchOverview.data.pots.all === 10, `search 401 pots.all should be 10, got ${searchOverview.data.pots.all}`);
    assert(searchOverview.data.pots.fit === 3, `search 401 pots.fit should be 3, got ${searchOverview.data.pots.fit}`);

    console.log('--- TEST 19: filtering listings by verdict (fit, unclear, no, all) ---');
    const fitListings = await request('/api/listings?campaign_id=4&limit=50&verdict=fit');
    assert(fitListings.status === 200, `status ${fitListings.status}`);
    assert(fitListings.data.total === 3, `expected 3 fit listings, got ${fitListings.data.total}`);
    for (const l of fitListings.data.listings) {
      assert(l.fit && l.fit.verdict === 'fit', `listing ${l.id} must be fit`);
    }

    const noListings = await request('/api/listings?campaign_id=4&limit=50&verdict=no');
    assert(noListings.status === 200, `status ${noListings.status}`);
    assert(noListings.data.total === 5, `expected 5 rejected listings, got ${noListings.data.total}`);
    for (const l of noListings.data.listings) {
      assert(l.fit && l.fit.verdict === 'no', `listing ${l.id} must be rejected`);
    }

    const unclearListings = await request('/api/listings?campaign_id=4&limit=50&verdict=unclear');
    assert(unclearListings.status === 200, `status ${unclearListings.status}`);
    assert(unclearListings.data.total === 2, `expected 2 unclear listings, got ${unclearListings.data.total}`);


    console.log('--- TEST 20: Käufersprache phrasing and contradicts on wants.match (numbers and strings) ---');
    const buyerOverview = await request('/api/campaigns/5/overview');
    assert(buyerOverview.status === 200, `status ${buyerOverview.status}`);
    const reqs = buyerOverview.data.requirements;

    const bStickReq = reqs.find(r => r.id === 'stickCount');
    assert(bStickReq, 'stickCount req must exist');
    assert(bStickReq.text === 'Zwei Riegel', `expected "Zwei Riegel", got ${bStickReq.text}`);
    assert(bStickReq.total === 2, `expected total 2, got ${bStickReq.total}`);
    assert(bStickReq.contradicted === 1, `expected 1 contradicted (4 sticks != match: 2), got ${bStickReq.contradicted}`);
    assert(bStickReq.survivors === 1, `expected 1 survivor, got ${bStickReq.survivors}`);
    const bGbReq = reqs.find(r => r.id === 'gbPerStick');
    assert(bGbReq, 'gbPerStick req must exist');
    assert(bGbReq.text === '16 GB je Riegel', `expected "16 GB je Riegel", got ${bGbReq.text}`);
    assert(bGbReq.text !== bStickReq.text, 'two requirements must not share one label');

    const bGenReq = reqs.find(r => r.id === 'generation');
    assert(bGenReq && bGenReq.text === 'DDR4', `expected "DDR4", got ${bGenReq?.text}`);

    const bSpeedReq = reqs.find(r => r.id === 'speedMhz');
    assert(bSpeedReq && bSpeedReq.text === 'mindestens 3200 MHz', `expected "mindestens 3200 MHz", got ${bSpeedReq?.text}`);

    const bClReq = reqs.find(r => r.id === 'casLatency');
    assert(bClReq && bClReq.text === 'CL16 oder schneller', `expected "CL16 oder schneller", got ${bClReq?.text}`);
    assert(bClReq.contradicted === 1, `expected 1 contradicted for CL (18 > max: 16), got ${bClReq.contradicted}`);

    const bFfReq = reqs.find(r => r.id === 'formFactor');
    assert(bFfReq && bFfReq.text === 'DIMM', `expected "DIMM", got ${bFfReq?.text}`);
    assert(bFfReq.contradicted === 1, `expected 1 contradicted for formFactor ('sodimm' != match: 'dimm'), got ${bFfReq.contradicted}`);

    console.log('--- TEST 21: cross-campaign fit isolation (#3) ---');
    const campBOverview = await request('/api/campaigns/7/overview');
    assert(campBOverview.status === 200, `status ${campBOverview.status}`);
    assert(campBOverview.data.pots.all === 1, `Campaign B should hold 1 listing, got ${campBOverview.data.pots.all}`);
    assert(
      campBOverview.data.pots.no === 0,
      `Campaign B must have 0 rejected, got ${campBOverview.data.pots.no} (rejection from Campaign A leaked!)`
    );
    assert(
      campBOverview.data.pots.unjudged === 1,
      `Campaign B listing should be unjudged, got ${campBOverview.data.pots.unjudged}`
    );
    assert(
      campBOverview.data.rejections.length === 0,
      `Campaign B should have 0 rejections, got ${campBOverview.data.rejections.length}`
    );

    console.log('--- TEST 22: best verdict wins (fit > unclear > no) & exact row data (#4) ---');
    const camp8Overview = await request('/api/campaigns/8/overview');
    assert(camp8Overview.status === 200, `status ${camp8Overview.status}`);
    assert(camp8Overview.data.pots.all === 1, `Campaign 8 should hold 1 listing, got ${camp8Overview.data.pots.all}`);
    assert(
      camp8Overview.data.pots.fit === 1,
      `Campaign 8 listing with fit in search A and unclear in search B must count as fit, got ${camp8Overview.data.pots.fit}`
    );
    assert(
      camp8Overview.data.pots.unclear === 0,
      `Campaign 8 unclear pot must be 0, got ${camp8Overview.data.pots.unclear}`
    );
    // Requirements must use facts from the winning row (Search 801: gbPerStick = 16)
    const reqGb = camp8Overview.data.requirements.find(r => r.id === 'gbPerStick');
    assert(reqGb, 'gbPerStick requirement must exist');
    assert(
      reqGb.survivors === 1,
      `Winning fit row facts should survive requirement, got ${reqGb?.survivors}`
    );

    console.log('--- TEST 23: Finding 1 - /api/listings cross-campaign isolation & within-campaign best verdict ---');
    // 1. Cross-campaign: cross-camp-1 was rejected in Campaign 6 (search 601), but unjudged in Campaign 7 (search 701)
    const c7No = await request('/api/listings?campaign_id=7&limit=50&verdict=no');
    assert(c7No.status === 200, `status ${c7No.status}`);
    assert(c7No.data.total === 0, `Campaign 7 must have 0 rejected listings, got ${c7No.data.total} (rejection leaked from Campaign 6!)`);

    const c7Unclear = await request('/api/listings?campaign_id=7&limit=50&verdict=unclear');
    assert(c7Unclear.status === 200, `status ${c7Unclear.status}`);
    assert(c7Unclear.data.total === 1, `Campaign 7 must have 1 unclear/unjudged listing, got ${c7Unclear.data.total}`);
    assert(c7Unclear.data.listings[0].id === 'cross-camp-1', 'expected cross-camp-1 in unclear');
    assert(c7Unclear.data.listings[0].item_name === 'Suche B', `item_name must belong to Campaign 7, got ${c7Unclear.data.listings[0].item_name}`);
    assert(c7Unclear.data.listings[0].campaign_name === 'Kampagne B', `campaign_name must belong to Campaign 7, got ${c7Unclear.data.listings[0].campaign_name}`);

    // 2. Within-campaign best verdict: c11-item-1 has 1101 'unclear', 1102 'fit'
    const c11Fit = await request('/api/listings?campaign_id=11&limit=50&verdict=fit');
    assert(c11Fit.status === 200, `status ${c11Fit.status}`);
    assert(c11Fit.data.total === 1, `Campaign 11 fit tab must find c11-item-1, got ${c11Fit.data.total}`);
    assert(c11Fit.data.listings[0].fit.verdict === 'fit', `fit verdict should be 'fit', got ${c11Fit.data.listings[0].fit.verdict}`);
    assert(c11Fit.data.listings[0].fit.reason === 'Passend 16GB', `fit reason should be 'Passend 16GB', got ${c11Fit.data.listings[0].fit.reason}`);

    const c11Unclear = await request('/api/listings?campaign_id=11&limit=50&verdict=unclear');
    assert(c11Unclear.status === 200, `status ${c11Unclear.status}`);
    assert(c11Unclear.data.total === 0, `Campaign 11 unclear tab must be 0 for winning fit listing, got ${c11Unclear.data.total}`);

    console.log('--- TEST 24: Finding 3 - GET /api/campaigns route_listings counts via listing_search_hits ---');
    const allCampaignsRes = await request('/api/campaigns');
    assert(allCampaignsRes.status === 200, `status ${allCampaignsRes.status}`);
    const camp9 = allCampaignsRes.data.find(c => c.id === 9);
    assert(camp9, 'Campaign 9 must exist in campaigns response');
    assert(camp9.listing_count === 1, `Campaign 9 route listing_count must be 1, got ${camp9.listing_count} (counted only l.search_id instead of hits)`);

    console.log('--- TEST 25: Finding 4 - getRouteCorridorPayload handles deleted first finder ---');
    const route12Res = await request('/api/campaigns/12/route');
    assert(route12Res.status === 200, `status ${route12Res.status}`);
    assert(route12Res.data.total === 1, `Route 12 total must be 1, got ${route12Res.data.total} (INNER JOIN searches dropped deleted finder!)`);
    assert(route12Res.data.listings.length === 1, `Route 12 listings length must be 1, got ${route12Res.data.listings.length}`);
    assert(route12Res.data.listings[0].id === 'deleted-finder-1', 'expected deleted-finder-1');
    assert(route12Res.data.listings[0].search_name === 'Kreis 1201', `search_name should be 'Kreis 1201', got ${route12Res.data.listings[0].search_name}`);

    console.log('--- TEST 26: Finding 5 - /api/search-families/:id/listings resolves best verdict consistently ---');
    const fam13Res = await request('/api/search-families/13/listings');
    assert(fam13Res.status === 200, `status ${fam13Res.status}`);
    assert(fam13Res.data.listings.length === 1, `Family 13 listings length must be 1, got ${fam13Res.data.listings.length}`);
    const famItem = fam13Res.data.listings[0];
    assert(famItem.fit && famItem.fit.verdict === 'fit', `expected best verdict 'fit', got ${famItem.fit?.verdict}`);
    assert(famItem.fit.reason === 'Perfekt 1312', `expected reason 'Perfekt 1312', got ${famItem.fit?.reason}`);
    assert(famItem.fit.facts.spec === 'gold', `expected facts.spec 'gold', got ${famItem.fit?.facts?.spec}`);

    console.log('--- TEST 27: Finding 1 - GET /api/campaigns/:id/route: best verdict wins across circles ---');
    const r14Res = await request('/api/campaigns/14/route');
    assert(r14Res.status === 200, `status ${r14Res.status}`);
    assert(r14Res.data.listings.length === 1, `expected 1 listing, got ${r14Res.data.listings.length}`);
    const r14Item = r14Res.data.listings[0];
    assert(r14Item.fit && r14Item.fit.verdict === 'fit', `expected best verdict 'fit', got ${r14Item.fit?.verdict}`);
    assert(r14Item.fit.reason === 'Perfekter Zustand Kreis 1', `expected reason 'Perfekter Zustand Kreis 1', got ${r14Item.fit?.reason}`);
    assert(r14Item.fit.facts.ram === 16, `expected facts.ram 16, got ${r14Item.fit?.facts?.ram}`);

    const r14FitOnly = await request('/api/campaigns/14/route?verdict=fit');
    assert(r14FitOnly.status === 200, `status ${r14FitOnly.status}`);
    assert(r14FitOnly.data.total === 1, `verdict=fit should return 1, got ${r14FitOnly.data.total}`);

    const r14Unclear = await request('/api/campaigns/14/route?verdict=unclear');
    assert(r14Unclear.status === 200, `status ${r14Unclear.status}`);
    assert(r14Unclear.data.total === 0, `verdict=unclear should return 0 since best is fit, got ${r14Unclear.data.total}`);

    console.log('--- TEST 28: Finding 2 - GET /api/listings: verdict=all and unknown values do not filter out non-fit listings ---');
    const c4All = await request('/api/listings?campaign_id=4&limit=50&verdict=all');
    assert(c4All.status === 200, `status ${c4All.status}`);
    assert(c4All.data.total === 10, `verdict=all should return all 10 listings, got ${c4All.data.total}`);

    const c4Unknown = await request('/api/listings?campaign_id=4&limit=50&verdict=unknown_dummy');
    assert(c4Unknown.status === 200, `status ${c4Unknown.status}`);
    assert(c4Unknown.data.total === 10, `unknown verdict value should not filter, got ${c4Unknown.data.total}`);

    console.log('--- TEST 29: Finding 3 - annotateDeals respects scopeSearchIds (badge matches deal filter) ---');
    // In Campaign A (15):
    const campAListings = await request('/api/listings?campaign_id=15&limit=50');
    assert(campAListings.status === 200, `status ${campAListings.status}`);
    const campAItem = campAListings.data.listings.find(l => l.id === 'scope-deal-1');
    assert(campAItem, 'scope-deal-1 must be returned in Campaign A');
    assert(campAItem.is_deal === false, `scope-deal-1 must NOT be marked as deal in Campaign A, got is_deal=${campAItem.is_deal}`);

    const campADealsOnly = await request('/api/listings?campaign_id=15&limit=50&dealsOnly=1');
    assert(campADealsOnly.status === 200, `status ${campADealsOnly.status}`);
    assert(!campADealsOnly.data.listings.some(l => l.id === 'scope-deal-1'), 'scope-deal-1 must not be in Campaign A dealsOnly');

    // In Campaign B (16):
    const campBListings = await request('/api/listings?campaign_id=16&limit=50');
    assert(campBListings.status === 200, `status ${campBListings.status}`);
    const campBItem = campBListings.data.listings.find(l => l.id === 'scope-deal-1');
    assert(campBItem, 'scope-deal-1 must be returned in Campaign B');
    assert(campBItem.is_deal === true, `scope-deal-1 MUST be marked as deal in Campaign B, got is_deal=${campBItem.is_deal}`);

    const campBDealsOnly = await request('/api/listings?campaign_id=16&limit=50&dealsOnly=1');
    assert(campBDealsOnly.status === 200, `status ${campBDealsOnly.status}`);
    assert(campBDealsOnly.data.listings.some(l => l.id === 'scope-deal-1'), 'scope-deal-1 MUST be in Campaign B dealsOnly');

    console.log('--- TEST 30: Finding 4 - GET /api/kept?listings=true selects best verdict & fit details across hits ---');
    await request('/api/kept/kept-item-1', { method: 'PUT', body: JSON.stringify({ note: 'Mein Merkzettel' }) });
    const keptRes = await request('/api/kept?listings=1');
    assert(keptRes.status === 200, `status ${keptRes.status}`);
    const keptItem = keptRes.data.listings.find(l => l.id === 'kept-item-1');
    assert(keptItem, 'kept-item-1 must be returned in kept listings');
    assert(keptItem.search_name === 'Neu-Suche', `search_name should be from winning fit search 'Neu-Suche', got ${keptItem.search_name}`);
    assert(keptItem.campaign_name === 'Kampagne 18 Neu', `campaign_name should be 'Kampagne 18 Neu', got ${keptItem.campaign_name}`);
    assert(keptItem.fit && keptItem.fit.verdict === 'fit', `fit verdict must be 'fit', got ${keptItem.fit?.verdict}`);
    assert(keptItem.fit.reason === 'Perfekt passend', `fit reason must be 'Perfekt passend', got ${keptItem.fit?.reason}`);
    assert(keptItem.fit.facts.kept === true, `fit facts must have kept: true, got ${keptItem.fit?.facts?.kept}`);

    console.log('--- TEST 31: Finding 5 - recalculateItemScores updates listings found via listing_search_hits ---');
    const recalcRes = await request('/api/searches/recalculate', {
      method: 'POST',
      body: JSON.stringify({
        search_id: 1801,
        item_json: {
          scoring_model: {
            weights: {
              ssd: { importance: 40, satisfied_if: 'yes' }
            }
          }
        }
      })
    });
    assert(recalcRes.status === 200, `status ${recalcRes.status}`);
    const checkDb = new sqlite3.Database(TEST_DB);
    const updatedListing = await new Promise((resolve, reject) => {
      checkDb.get('SELECT id, niceness_score FROM listings WHERE id = ?', ['recalc-hit-1'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    checkDb.close();
    assert(updatedListing && updatedListing.niceness_score === 40, `niceness_score must be recalculated to 40, got ${updatedListing?.niceness_score}`);

    console.log('--- TEST 32: Finding 6 - unfiltered GET /api/listings uses best verdict across all searches that found it ---');
    const unfiltRes = await request('/api/listings?q=Unfiltered+Multi+Verdict');
    assert(unfiltRes.status === 200, `status ${unfiltRes.status}`);
    assert(unfiltRes.data.listings.length === 1, `expected 1 listing, got ${unfiltRes.data.listings.length}`);
    const unfiltItem = unfiltRes.data.listings[0];
    assert(unfiltItem.fit && unfiltItem.fit.verdict === 'fit', `fit verdict must be 'fit' from winning search, got ${unfiltItem.fit?.verdict}`);
    assert(unfiltItem.fit.reason === 'Zweiter Fund Fit', `fit reason must be 'Zweiter Fund Fit', got ${unfiltItem.fit?.reason}`);

    const unfiltFitOnly = await request('/api/listings?q=Unfiltered+Multi+Verdict&verdict=fit');
    assert(unfiltFitOnly.status === 200, `status ${unfiltFitOnly.status}`);
    assert(unfiltFitOnly.data.total === 1, `verdict=fit must find unfiltered-mv-1, got ${unfiltFitOnly.data.total}`);

    console.log('--- TEST 33: equal price, higher score first ---');
    const sameRes = await request('/api/listings?campaign_id=20&limit=10&sort=price_asc');
    assert(sameRes.status === 200, `status ${sameRes.status}`);
    const order = sameRes.data.listings.map(l => l.id);
    assert(
      JSON.stringify(order) === JSON.stringify(['same-high', 'same-low', 'same-none']),
      `equal prices must rank by score, unscored last; got ${JSON.stringify(order)}`
    );

    console.log('--- TEST 34: one listing by id, with its best verdict, for sharing as a link ---');
    const oneRes = await request('/api/listings/unfiltered-mv-1');
    assert(oneRes.status === 200, `status ${oneRes.status}`);
    assert(oneRes.data.id === 'unfiltered-mv-1', `wrong listing ${oneRes.data.id}`);
    assert(oneRes.data.fit && oneRes.data.fit.verdict === 'fit', `best verdict expected, got ${oneRes.data.fit?.verdict}`);
    assert(Array.isArray(oneRes.data.images), 'images must be parsed');
    const missingRes = await request('/api/listings/does-not-exist');
    assert(missingRes.status === 404, `unknown id must be 404, got ${missingRes.status}`);

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
