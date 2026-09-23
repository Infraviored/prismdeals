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
    'SELECT id FROM route_searches WHERE campaign_id = ? ORDER BY id DESC LIMIT 1',
    [campaignId]
  );
  if (route) {
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
      'SELECT DISTINCT search_id FROM search_family_searches WHERE family_id = ? AND active = 1',
      [family.id]
    );
    const searchIds = rows.map(r => Number(r.search_id));
    return {
      campaign,
      kind: 'family',
      familyId: Number(family.id),
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
