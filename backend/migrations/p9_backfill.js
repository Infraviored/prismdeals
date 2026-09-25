/**
 * P9 backfill: computes requirements_hash for knowledge_sets and listing_fit rows.
 *
 * Idempotent:
 * 1. Computes requirements_hash for knowledge_sets where item_json is not null.
 * 2. Backfills listing_fit.requirements_hash from the search's knowledge set
 *    where listing_fit.requirements_hash IS NULL.
 */

const sqlite3 = require('sqlite3').verbose();
const { requirementsHash } = require('../db/requirements_hash');
const { defaultPath } = require('../db/path');

async function backfillP9Verdicts(query, run) {
  // 1. Backfill knowledge_sets
  const ksRows = await query(`
    SELECT id, item_json, requirements_hash
      FROM knowledge_sets
     WHERE item_json IS NOT NULL
  `);

  let ksUpdated = 0;
  const ksHashes = new Map();

  for (const row of ksRows) {
    let fields = null;
    try {
      const parsed = JSON.parse(row.item_json);
      fields = parsed.fields || null;
    } catch {
      fields = null;
    }
    const hash = requirementsHash(fields);
    if (hash) {
      ksHashes.set(row.id, hash);
      if (row.requirements_hash !== hash) {
        await run('UPDATE knowledge_sets SET requirements_hash = ? WHERE id = ?', [hash, row.id]);
        ksUpdated++;
      }
    }
  }

  // 2. Backfill listing_fit
  const fitRows = await query(`
    SELECT lf.listing_id, lf.search_id, lf.requirements_hash, s.knowledge_set_id
      FROM listing_fit lf
      JOIN searches s ON s.id = lf.search_id
     WHERE lf.requirements_hash IS NULL
  `);

  let fitUpdated = 0;
  let fitSkipped = 0;

  for (const row of fitRows) {
    const hash = ksHashes.get(row.knowledge_set_id);
    if (hash) {
      await run(
        'UPDATE listing_fit SET requirements_hash = ? WHERE listing_id = ? AND search_id = ?',
        [hash, row.listing_id, row.search_id]
      );
      fitUpdated++;
    } else {
      fitSkipped++;
    }
  }

  return {
    knowledgeSetsUpdated: ksUpdated,
    listingFitUpdated: fitUpdated,
    listingFitSkipped: fitSkipped,
  };
}

if (require.main === module) {
  const dbPath = process.argv[2] || process.env.PRISMDEALS_DB || defaultPath();
  console.log(`Running P9 backfill on: ${dbPath}`);
  const db = new sqlite3.Database(dbPath);

  const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });

  backfillP9Verdicts(query, run)
    .then(stats => {
      console.log('P9 backfill completed successfully:');
      console.log(`  knowledge_sets updated: ${stats.knowledgeSetsUpdated}`);
      console.log(`  listing_fit updated:    ${stats.listingFitUpdated}`);
      console.log(`  listing_fit skipped:    ${stats.listingFitSkipped}`);
      db.close();
    })
    .catch(err => {
      console.error('P9 backfill failed:', err);
      db.close();
      process.exit(1);
    });
}

module.exports = { backfillP9Verdicts };
