/**
 * Measurement script for P8 (Market per node).
 * Measures campaigns 1 (Laptops), 7 (Corsair RAM), 9 (R1/CBR), 8 (Motorrad) on /tmp/p8market.db.
 */

const sqlite3 = require('sqlite3').verbose();
const { nodeMedians, medianOf } = require('../backend/db/market_node');

const dbPath = process.argv[2] || '/tmp/p8market.db';
const db = new sqlite3.Database(dbPath);

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

async function measure() {
  const campaigns = [
    { id: 1, name: 'Laptops' },
    { id: 7, name: 'Corsair RAM' },
    { id: 9, name: 'Yamaha R1 / Honda CBR' },
    { id: 8, name: 'Motorrad' },
  ];

  console.log('='.repeat(90));
  console.log('P8 MARKET PER NODE MEASUREMENT REPORT');
  console.log('Database:', dbPath);
  console.log('='.repeat(90));

  for (const c of campaigns) {
    console.log(`\n--- Campaign ${c.id}: ${c.name} ---`);

    // Get search IDs for this campaign
    const searches = await query('SELECT id FROM searches WHERE campaign_id = ?', [c.id]);
    const searchIds = searches.map(s => s.id);

    if (!searchIds.length) {
      console.log('  No searches found for this campaign.');
      continue;
    }

    // 1. Old scope median (all non-null positive prices for these search hits)
    const scopePlaceholders = searchIds.map(() => '?').join(',');
    const scopeRows = await query(`
      SELECT l.price_eur
        FROM listing_search_hits lsh
        JOIN listings l ON l.id = lsh.listing_id
       WHERE lsh.search_id IN (${scopePlaceholders})
         AND l.price_eur IS NOT NULL
         AND l.price_eur > 0
    `, searchIds);
    const scopePrices = scopeRows.map(r => Number(r.price_eur));
    const oldScope = medianOf(scopePrices);

    console.log(`  Total listings found in scope: ${scopePrices.length}`);
    console.log(`  Old scope median: ${oldScope ? `${oldScope.median} € (${oldScope.count} listings)` : 'N/A'}`);

    // 2. Nodes assigned in this campaign
    const nodeRows = await query(`
      SELECT DISTINCT ln.node_key, ln.source, COUNT(DISTINCT l.id) as count
        FROM listing_search_hits lsh
        JOIN listings l ON l.id = lsh.listing_id
        JOIN listing_nodes ln ON ln.listing_id = l.id
       WHERE lsh.search_id IN (${scopePlaceholders})
       GROUP BY ln.node_key, ln.source
       ORDER BY count DESC
    `, searchIds);

    if (!nodeRows.length) {
      console.log('  No nodes assigned (0 listings in campaign).');
      continue;
    }

    const nodeKeys = nodeRows.map(r => r.node_key);
    const medians = await nodeMedians(query, nodeKeys, searchIds);

    console.log('\n  Per-Node Breakdown:');
    console.log('  ' + '-'.repeat(85));
    console.log(
      '  ' +
      'Node Key'.padEnd(35) +
      'Source'.padEnd(12) +
      'Listings'.padEnd(10) +
      'Median'.padEnd(12) +
      'Basis (Type)'
    );
    console.log('  ' + '-'.repeat(85));

    for (const row of nodeRows) {
      const m = medians.get(row.node_key);
      const medianStr = m ? `${m.median} €` : 'N/A';
      const basisStr = m ? `${m.basis} (${m.basis_type}, n=${m.count})` : 'none';
      console.log(
        '  ' +
        row.node_key.padEnd(35) +
        row.source.padEnd(12) +
        String(row.count).padEnd(10) +
        medianStr.padEnd(12) +
        basisStr
      );
    }
  }

  console.log('\n' + '='.repeat(90));
}

measure()
  .then(() => db.close())
  .catch(err => {
    console.error('Measurement failed:', err);
    db.close();
    process.exit(1);
  });
