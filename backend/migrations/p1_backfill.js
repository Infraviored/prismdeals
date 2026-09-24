/**
 * P1 backfill: hunts with a family + memory playbook -> 'exact', else null.
 *
 * Idempotent: only modifies campaigns where hunt_type IS NULL.
 */

async function backfillHuntTypes(query, run) {
  // Find campaigns with a search family using the memory playbook (c225)
  // where hunt_type has not been set yet.
  const candidates = await query(`
    SELECT DISTINCT c.id, c.name, sf.base_url
      FROM campaigns c
      JOIN search_families sf ON sf.campaign_id = c.id
     WHERE c.hunt_type IS NULL
       AND (sf.base_url LIKE '%c225%' OR sf.base_url LIKE '%k0c225%')
  `);

  const updatedIds = [];
  for (const row of candidates) {
    await run('UPDATE campaigns SET hunt_type = ? WHERE id = ?', ['exact', row.id]);
    updatedIds.push(row.id);
  }

  return {
    updated: updatedIds.length,
    campaign_ids: updatedIds,
  };
}

module.exports = { backfillHuntTypes };
