/**
 * Data backfill for listings source, source_id, and price_eur.
 *
 * Backfills are data migrations, not DDL schema statements. db/schema.sql is
 * naively split on semicolons by both Node and Python runtimes and only contains
 * structural DDL.
 *
 * Pattern modeled on backfillListingTimestamps() in backend/server.js: runs once
 * on startup after schema migration, guarded by WHERE ... IS NULL so every
 * subsequent run is completely harmless and performs no work.
 */

/**
 * Parses legacy price strings into numeric integer EUR.
 *
 * Distinct from result_list.PRICE_RE which is anchored on HTML boundaries `>...<`.
 * In the database, price strings are extracted text (e.g. "60 €", "150 € VB",
 * "330 € VB360 €", "Zu verschenken", "").
 *
 * Historical rules measured across all 1266 legacy rows:
 * - "Zu verschenken" becomes 0 (genuine price of highest interest for deal-seekers).
 * - Empty strings and unparseable values remain null ("Preis unklar").
 * - 20 legacy rows with concatenated prices (e.g. "330 € VB360 €" caused by old
 *   Selenium adjacent sibling text node extraction) take the first number before
 *   the first € (which is the VB price in all 20 cases) and are logged.
 *
 * @param {string|null} rawPrice
 * @returns {number|null}
 */
function parsePriceEur(rawPrice) {
  if (rawPrice == null) return null;
  const trimmed = rawPrice.trim();
  if (!trimmed) return null;
  if (/^zu\s*verschenken$/i.test(trimmed)) return 0;

  const match = trimmed.match(/^\s*([\d.]+)\s*€/);
  if (!match) return null;

  const numStr = match[1].replace(/\./g, '');
  const parsed = parseInt(numStr, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Idempotently backfills source, source_id, and price_eur for listings.
 *
 * @param {import('sqlite3').Database} db
 */
function backfillCanonicalListings(db) {
  // Phase 0: Canonical source & source_id.
  db.run(
    `UPDATE listings
        SET source = 'kleinanzeigen'
      WHERE source IS NULL`,
    err => {
      if (err) console.error('Backfilling listings.source failed:', err);
    }
  );

  db.run(
    `UPDATE listings
        SET source_id = id
      WHERE source_id IS NULL AND (source = 'kleinanzeigen' OR source IS NULL)`,
    err => {
      if (err) console.error('Backfilling listings.source_id failed:', err);
    }
  );

  // Phase 2a: Numeric price_eur backfill.
  // Guarded by WHERE price_eur IS NULL AND price IS NOT NULL AND TRIM(price) != ''
  // so empty/ambiguous strings remain null and subsequent startups find 0 rows.
  db.all(
    `SELECT id, price FROM listings
      WHERE price_eur IS NULL
        AND price IS NOT NULL
        AND TRIM(price) != ''`,
    (err, rows) => {
      if (err) {
        console.error('Querying listings for price_eur backfill failed:', err);
        return;
      }
      if (!rows || rows.length === 0) return;

      db.serialize(() => {
        const stmt = db.prepare('UPDATE listings SET price_eur = ? WHERE id = ?');
        let updatedCount = 0;
        let giveawayCount = 0;
        let compositeCount = 0;

        for (const row of rows) {
          const parsed = parsePriceEur(row.price);
          if (parsed !== null) {
            if (parsed === 0) {
              giveawayCount++;
            }
            if ((row.price.match(/€/g) || []).length > 1) {
              compositeCount++;
              console.log(
                `[backfill] Resolved legacy composite price for listing ${row.id}: '${row.price}' -> ${parsed} €`
              );
            }
            stmt.run(parsed, row.id, runErr => {
              if (runErr) {
                console.error(`Updating price_eur for listing ${row.id} failed:`, runErr);
              }
            });
            updatedCount++;
          }
        }

        stmt.finalize(finalizeErr => {
          if (finalizeErr) {
            console.error('Finalizing price_eur backfill statement failed:', finalizeErr);
          } else {
            console.log(
              `[backfill] Successfully backfilled price_eur for ${updatedCount} listings ` +
              `(${giveawayCount} free / 0 €, ${compositeCount} composite prices resolved).`
            );
          }
        });
      });
    }
  );
}

module.exports = { backfillCanonicalListings, parsePriceEur };
