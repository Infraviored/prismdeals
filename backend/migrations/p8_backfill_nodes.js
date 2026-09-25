/**
 * P8 backfill: populates listing_nodes for all existing listings.
 *
 * Idempotent:
 * 1. Ensures listing_nodes table and index exist.
 * 2. Resolves node per listing using rank > identity > playbook > hunt fallback.
 * 3. Writes into listing_nodes with INSERT OR REPLACE.
 *
 * docs/product-core.md §7, plan-hunt-engine.md §11 (P8).
 */

const sqlite3 = require('sqlite3').verbose();
const { resolveNode, normalizeNodePart } = require('../db/market_node');
const { defaultPath } = require('../db/path');

async function backfillP8Nodes(query, run) {
  // 1. Ensure table and index
  await run(`
    CREATE TABLE IF NOT EXISTS listing_nodes (
      listing_id TEXT NOT NULL PRIMARY KEY,
      node_key   TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT 'hunt',
      computed_at TEXT NOT NULL
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_listing_nodes_node ON listing_nodes(node_key)
  `);

  // Ensure listing_ranks has node column if possible
  try {
    await run(`ALTER TABLE listing_ranks ADD COLUMN node TEXT`);
  } catch {
    // Already exists
  }

  // 2. Fetch listings with facts, rank node, and campaign information
  const rows = await query(`
    SELECT
      l.id,
      l.title,
      l.details,
      l.price_eur,
      fs.facts_json,
      fs.playbook_key,
      c.id AS campaign_id,
      c.name AS campaign_name,
      s.name AS search_name,
      lr.node AS rank_node
    FROM listings l
    LEFT JOIN fact_sheets fs ON fs.listing_id = l.id
    LEFT JOIN listing_search_hits lsh ON lsh.listing_id = l.id
    LEFT JOIN searches s ON s.id = lsh.search_id
    LEFT JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN (
      SELECT lr_inner.listing_id, lr_inner.node
      FROM listing_ranks lr_inner
      JOIN judge_runs jr ON jr.id = lr_inner.run_id
      WHERE lr_inner.node IS NOT NULL
      ORDER BY jr.created_at DESC
    ) lr ON lr.listing_id = l.id
    GROUP BY l.id
  `);

  const now = new Date().toISOString();
  const counts = { total: 0, identity: 0, playbook: 0, rank: 0, hunt: 0 };

  // Use transaction for fast bulk insert
  await run('BEGIN TRANSACTION');

  try {
    for (const row of rows) {
      let factSheet = null;
      if (row.facts_json) {
        try {
          factSheet = JSON.parse(row.facts_json);
        } catch {
          factSheet = null;
        }
      }

      let details = null;
      if (row.details) {
        try {
          details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
        } catch {
          details = null;
        }
      }

      const listing = {
        id: row.id,
        title: row.title,
        details,
        price_eur: row.price_eur,
      };

      const huntFallback = normalizeNodePart(row.campaign_name || row.search_name) || (row.campaign_id ? `hunt/${row.campaign_id}` : 'hunt');
      const { node_key, source } = resolveNode(
        listing,
        factSheet,
        row.playbook_key,
        row.rank_node,
        huntFallback
      );

      await run(`
        INSERT OR REPLACE INTO listing_nodes (listing_id, node_key, source, computed_at)
        VALUES (?, ?, ?, ?)
      `, [String(row.id), node_key, source, now]);

      counts.total++;
      counts[source] = (counts[source] || 0) + 1;
    }

    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }

  return counts;
}

if (require.main === module) {
  const dbPath = process.argv[2] || process.env.PRISMDEALS_DB || defaultPath();
  console.log(`Running P8 node backfill on: ${dbPath}`);
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

  backfillP8Nodes(query, run)
    .then(counts => {
      console.log('P8 backfill completed successfully:');
      console.log(`  Total listings processed: ${counts.total}`);
      console.log(`  Node from rank:           ${counts.rank}`);
      console.log(`  Node from identity:       ${counts.identity}`);
      console.log(`  Node from playbook:       ${counts.playbook}`);
      console.log(`  Node from hunt fallback:  ${counts.hunt}`);
      db.close();
    })
    .catch(err => {
      console.error('P8 backfill failed:', err);
      db.close();
      process.exit(1);
    });
}

module.exports = { backfillP8Nodes };
