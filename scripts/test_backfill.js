const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3Path = fs.existsSync(path.join(__dirname, '..', 'backend', 'node_modules', 'sqlite3'))
  ? path.join(__dirname, '..', 'backend', 'node_modules', 'sqlite3')
  : path.join(__dirname, '..', '..', '..', 'backend', 'node_modules', 'sqlite3');
const sqlite3 = require(sqlite3Path).verbose();
const { parsePriceEur, backfillCanonicalListings } = require('../backend/db/backfill');
const { applySchema } = require('../backend/db/schema');

function testParsePriceEur() {
  console.log('Testing parsePriceEur...');
  // 1. Giveaways -> 0
  assert.strictEqual(parsePriceEur('Zu verschenken'), 0);
  assert.strictEqual(parsePriceEur('zu verschenken'), 0);
  assert.strictEqual(parsePriceEur('  ZU VERSCHENKEN  '), 0);

  // 2. Empty / whitespace / null / invalid -> null
  assert.strictEqual(parsePriceEur(''), null);
  assert.strictEqual(parsePriceEur('   '), null);
  assert.strictEqual(parsePriceEur(null), null);
  assert.strictEqual(parsePriceEur(undefined), null);
  assert.strictEqual(parsePriceEur('VB'), null);
  assert.strictEqual(parsePriceEur('Preis auf Anfrage'), null);

  // 3. Regular prices
  assert.strictEqual(parsePriceEur('60 €'), 60);
  assert.strictEqual(parsePriceEur('150 € VB'), 150);
  assert.strictEqual(parsePriceEur('1.250 €'), 1250);
  assert.strictEqual(parsePriceEur('2.999 € VB'), 2999);

  // 4. Double/glued prices -> first price before first €
  assert.strictEqual(parsePriceEur('330 € VB360 €'), 330);
  assert.strictEqual(parsePriceEur('1 €2.999 €'), 1);
  assert.strictEqual(parsePriceEur('150 € VB850 €'), 150);
  assert.strictEqual(parsePriceEur('420 €550 €'), 420);

  console.log('parsePriceEur passed all assertions.');
}

function testDatabaseBackfill() {
  console.log('Testing backfillCanonicalListings in database...');
  const db = new sqlite3.Database(':memory:');

  applySchema(db)
    .then(() => {
      // Seed legacy test rows
      const seedSql = `
        INSERT INTO campaigns (id, name) VALUES (1, 'C1');
        INSERT INTO searches (id, campaign_id, url) VALUES (1, 1, 'http://test');
        INSERT INTO listings (id, title, price, search_id) VALUES
          ('ad-free', 'Free couch', 'Zu verschenken', 1),
          ('ad-empty', 'Unstated bike', '', 1),
          ('ad-normal', 'Phone', '150 € VB', 1),
          ('ad-glued', 'Laptop', '330 € VB360 €', 1),
          ('ad-already', 'Priced item', '80 €', 1);
        UPDATE listings SET price_eur = 80 WHERE id = 'ad-already';
      `;
      db.exec(seedSql, (err) => {
        assert.ifError(err);

        // Run backfill
        backfillCanonicalListings(db);

        setTimeout(() => {
          db.all('SELECT id, source, source_id, price, price_eur FROM listings ORDER BY id', (err, rows) => {
            assert.ifError(err);
            const byId = Object.fromEntries(rows.map(r => [r.id, r]));

            // ad-free: 0
            assert.strictEqual(byId['ad-free'].price_eur, 0);
            assert.strictEqual(byId['ad-free'].source, 'kleinanzeigen');
            assert.strictEqual(byId['ad-free'].source_id, 'ad-free');

            // ad-empty: null
            assert.strictEqual(byId['ad-empty'].price_eur, null);
            assert.strictEqual(byId['ad-empty'].source, 'kleinanzeigen');
            assert.strictEqual(byId['ad-empty'].source_id, 'ad-empty');

            // ad-normal: 150
            assert.strictEqual(byId['ad-normal'].price_eur, 150);
            assert.strictEqual(byId['ad-normal'].source, 'kleinanzeigen');

            // ad-glued: 330
            assert.strictEqual(byId['ad-glued'].price_eur, 330);
            assert.strictEqual(byId['ad-glued'].source, 'kleinanzeigen');

            // ad-already: 80 preserved
            assert.strictEqual(byId['ad-already'].price_eur, 80);

            // Run backfill a second time to verify idempotency
            backfillCanonicalListings(db);

            setTimeout(() => {
              db.all('SELECT id, price_eur FROM listings ORDER BY id', (err2, rows2) => {
                assert.ifError(err2);
                const byId2 = Object.fromEntries(rows2.map(r => [r.id, r]));
                assert.strictEqual(byId2['ad-free'].price_eur, 0);
                assert.strictEqual(byId2['ad-empty'].price_eur, null);
                assert.strictEqual(byId2['ad-normal'].price_eur, 150);
                assert.strictEqual(byId2['ad-glued'].price_eur, 330);
                assert.strictEqual(byId2['ad-already'].price_eur, 80);

                console.log('Database backfill passed all assertions including idempotency.');
                db.close();
              });
            }, 100);
          });
        }, 100);
      });
    })
    .catch(err => {
      console.error('Test setup failed:', err);
      process.exit(1);
    });
}

testParsePriceEur();
testDatabaseBackfill();
