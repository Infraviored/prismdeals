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

// The listing URL carries its category: /s-anzeige/<slug>/<id>-<cat>-<loc>.
const PLAYBOOK_BY_CATEGORY = {
  225: 'computing/memory',
  278: 'electronics/laptops',
  305: 'vehicles/motorcycles',
  216: 'vehicles/cars',
  173: 'electronics/phones',
};

function playbookFromUrl(url) {
  const match = /\/s-anzeige\/[^/?#]+\/\d+-(\d+)-\d+/.exec(url || '');
  return match ? PLAYBOOK_BY_CATEGORY[match[1]] || null : null;
}

// Startup and every crawl's end both run this; one at a time.
let queue = Promise.resolve();
function backfillP8Nodes(query, run) {
  const next = queue.then(() => resolveAllNodes(query, run));
  queue = next.catch(() => {});
  return next;
}

async function resolveAllNodes(query, run) {
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
      l.url,
      l.title,
      l.details,
      l.price_eur,
      fs.facts_json,
      fs.playbook_key,
      c.id AS campaign_id,
      c.name AS campaign_name,
      s.name AS search_name,
      lr.node AS rank_node,
      (SELECT f.facts_json FROM listing_fit f WHERE f.listing_id = l.id
        ORDER BY f.judged_at DESC LIMIT 1) AS fit_facts,
      (SELECT COALESCE(t.label, t.term)
         FROM listing_search_hits h2
         JOIN search_family_searches sfs ON sfs.search_id = h2.search_id
         JOIN search_family_terms t ON t.id = sfs.term_id
         JOIN search_families sf ON sf.id = sfs.family_id
         JOIN campaigns c2 ON c2.id = sf.campaign_id
        WHERE h2.listing_id = l.id AND c2.hunt_type IN ('shortlist', 'class')
        ORDER BY h2.first_seen_at LIMIT 1) AS model_term
    FROM listings l
    LEFT JOIN fact_sheets fs ON fs.listing_id = l.id
    LEFT JOIN listing_search_hits lsh ON lsh.listing_id = l.id
    LEFT JOIN searches s ON s.id = lsh.search_id
    LEFT JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN (
      -- compare.py writes node_key; node is the older column (P7).
      SELECT lr_inner.listing_id, COALESCE(lr_inner.node_key, lr_inner.node) AS node
      FROM listing_ranks lr_inner
      JOIN judge_runs jr ON jr.id = lr_inner.run_id
      WHERE COALESCE(lr_inner.node_key, lr_inner.node) IS NOT NULL
      ORDER BY jr.created_at DESC
    ) lr ON lr.listing_id = l.id
    GROUP BY l.id
  `);

  const now = new Date().toISOString();
  const counts = { total: 0, identity: 0, playbook: 0, rank: 0, hunt: 0 };

  // No explicit transaction: this shares the server's one connection, and a
  // BEGIN while another backfill held one failed with "cannot start a
  // transaction within a transaction". Batched rows are fast enough.
  const resolved = [];
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

      // fact_sheets is nearly empty (16 of 1566 listings on the live copy);
      // the verdict's facts carry the same fields for every judged listing.
      if (!factSheet && row.fit_facts) {
        try {
          factSheet = { criteria: JSON.parse(row.fit_facts) };
        } catch {
          factSheet = null;
        }
      }
      // In a model list every search term is a model: the term that found
      // the listing names its product better than the hunt does.
      const modelNode = row.model_term ? normalizeNodePart(row.model_term) : null;
      const huntFallback = modelNode
        ? `modell/${modelNode}`
        : normalizeNodePart(row.campaign_name || row.search_name) || (row.campaign_id ? `hunt/${row.campaign_id}` : 'hunt');
      const { node_key, source } = resolveNode(
        listing,
        factSheet,
        row.playbook_key || playbookFromUrl(row.url),
        row.rank_node,
        huntFallback
      );

      resolved.push([String(row.id), node_key, source, now]);
      counts.total++;
      counts[source] = (counts[source] || 0) + 1;
  }

  const BATCH = 200; // 4 values each, under SQLite's 999 variables
  for (let i = 0; i < resolved.length; i += BATCH) {
    const batch = resolved.slice(i, i + BATCH);
    await run(
      `INSERT OR REPLACE INTO listing_nodes (listing_id, node_key, source, computed_at)
       VALUES ${batch.map(() => '(?, ?, ?, ?)').join(', ')}`,
      batch.flat()
    );
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

module.exports = { backfillP8Nodes, playbookFromUrl };
