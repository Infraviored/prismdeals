const { SFS_ACTIVE_OR_PENDING_SQL } = require('../db/family_scope');
/**
 * Scope resolution for overview: Route -> Family -> Plain campaign.
 */

/**
 * Resolves campaign searches in the same precedence order as the results screen:
 * Route -> Family -> Plain campaign.
 */
async function resolveCampaignScope(campaignId, searchIdParam, { query, get }) {
  const campaign = await get('SELECT id, name FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) return null;

  if (searchIdParam) {
    const search = await get('SELECT id, name, campaign_id, knowledge_set_id FROM searches WHERE id = ?', [searchIdParam]);
    if (search) {
      return {
        campaign,
        kind: 'search',
        searchIds: [Number(search.id)],
        primarySearchId: Number(search.id),
      };
    }
  }

  const route = await get(
    'SELECT id, family_id FROM route_searches WHERE campaign_id = ? ORDER BY id DESC LIMIT 1',
    [campaignId]
  );
  // A hunt given a corridor is still a family: its list comes from the family
  // (terms, old town searches until the circles ran), so the counts must too.
  if (route && !route.family_id) {
    const circles = await query(
      'SELECT DISTINCT search_id FROM route_search_circles WHERE route_search_id = ?',
      [route.id]
    );
    const searchIds = circles.map(c => Number(c.search_id));
    return {
      campaign,
      kind: 'route',
      routeId: Number(route.id),
      searchIds,
      primarySearchId: searchIds[0] || null,
    };
  }

  const family = await get(
    'SELECT id FROM search_families WHERE campaign_id = ? ORDER BY id DESC LIMIT 1',
    [campaignId]
  );
  if (family) {
    const rows = await query(
      `SELECT DISTINCT sfs.search_id
         FROM search_family_searches sfs
         JOIN searches s ON s.id = sfs.search_id
        WHERE sfs.family_id = ?
          AND ${SFS_ACTIVE_OR_PENDING_SQL}`,
      [family.id]
    );
    const searchIds = rows.map(r => Number(r.search_id));
    return {
      campaign,
      kind: 'family',
      familyId: Number(family.id),
      routeId: route ? Number(route.id) : null,
      searchIds,
      primarySearchId: searchIds[0] || null,
    };
  }

  const plainSearches = await query('SELECT id FROM searches WHERE campaign_id = ?', [campaignId]);
  const searchIds = plainSearches.map(s => Number(s.id));
  return {
    campaign,
    kind: 'plain',
    searchIds,
    primarySearchId: searchIds[0] || null,
  };
}

module.exports = {
  resolveCampaignScope,
};
