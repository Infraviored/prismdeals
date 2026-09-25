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
  // listing_nodes and listing_ranks.node_key come from db/schema.sql, applied
  // before this runs (server start, or the CLI below).

  // 2. Fetch listings with facts, rank node, and campaign information.
  // Picked by ROW_NUMBER, not a bare column under GROUP BY: that kept an
  // arbitrary rank row (15 of 57 listings got an older run's node) and an
  // arbitrary campaign, so the fallback node could change between runs.
  const rows = await query(`
    WITH latest_rank AS (
      -- compare.py writes node_key; node is the older column (P7).
      SELECT lr.listing_id, COALESCE(lr.node_key, lr.node) AS node,
             ROW_NUMBER() OVER (PARTITION BY lr.listing_id
                                ORDER BY jr.created_at DESC, lr.run_id DESC) AS rn
        FROM listing_ranks lr
        JOIN judge_runs jr ON jr.id = lr.run_id
       WHERE COALESCE(lr.node_key, lr.node) IS NOT NULL
    ),
    first_hit AS (
      SELECT lsh.listing_id, lsh.search_id,
             ROW_NUMBER() OVER (PARTITION BY lsh.listing_id
                                ORDER BY lsh.first_seen_at, lsh.search_id) AS rn
        FROM listing_search_hits lsh
    )
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
        ORDER BY h2.first_seen_at, h2.search_id LIMIT 1) AS model_term
    FROM listings l
    LEFT JOIN fact_sheets fs ON fs.listing_id = l.id
    LEFT JOIN first_hit fh ON fh.listing_id = l.id AND fh.rn = 1
    LEFT JOIN searches s ON s.id = fh.search_id
    LEFT JOIN campaigns c ON c.id = s.campaign_id
    LEFT JOIN latest_rank lr ON lr.listing_id = l.id AND lr.rn = 1
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

  require('../db/schema').applySchema(db)
    .then(() => backfillP8Nodes(query, run))
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
