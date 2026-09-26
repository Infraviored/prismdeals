/**
 * A hunt's listings with their verdicts, computed (plan §5).
 *
 * Every endpoint that shows a hunt -- the list, the overview, the comparison's
 * candidates -- reads through `huntListings`, so they cannot disagree about
 * which offers fit. The crawl units are the hunt's family of searches; which
 * ones count is decided by SFS_ACTIVE_OR_PENDING_SQL, as before.
 */

const { SFS_ACTIVE_OR_PENDING_SQL } = require('./db/family_scope');
const { loadTree, loadHunt, loadReadings } = require('./db/graph');
const { prepare, verdict } = require('./db/verdict');
const { attachScores } = require('./db/score');
const { placeListings } = require('./listing_geo');
const { nodeMarkets, annotateMarket } = require('./db/market');
const { thin } = require('./listing_extras');

const LISTING_COLUMNS = `l.id, l.title, l.price, l.price_eur, l.location, l.url,
  l.short_description, l.detailed_description, l.details, l.status, l.images,
  l.last_seen_at, l.delisted_at, l.source, l.source_id, l.postal_code`;

/** The hunt, its family, route and search ids. Null when there is no hunt. */
async function huntScope(query, get, campaignId) {
  const tree = await loadTree(query);
  const hunt = await loadHunt(query, get, tree, campaignId);
  if (!hunt) return null;
  const family = await get(
    'SELECT id, base_url FROM search_families WHERE campaign_id = ? ORDER BY id LIMIT 1',
    [campaignId]
  );
  const route = family
    ? await get(
      'SELECT id, origin, destination, half_width_km, plan_json FROM route_searches WHERE family_id = ? ORDER BY id DESC LIMIT 1',
      [family.id]
    )
    : null;
  const searchIds = family
    ? (await query(
      `SELECT sfs.search_id FROM search_family_searches sfs WHERE sfs.family_id = ? AND ${SFS_ACTIVE_OR_PENDING_SQL}`,
      [family.id]
    )).map(r => Number(r.search_id))
    : [];
  return { tree, hunt, family, route, searchIds };
}

/**
 * Every listing of the hunt, each with `fit {verdict, reason, states,
 * target_id}`, placed, priced against its target's market and scored. Filters on the
 * listing's own columns happen in SQL; verdict filters are the caller's.
 */
async function huntListings(query, scope, filters = {}) {
  const { tree, hunt, family, route, searchIds } = scope;
  if (!family || !searchIds.length) {
    // A hunt that has found nothing yet still has a market.
    if (!scope.markets) scope.markets = await nodeMarkets(query, tree, hunt.targets.map(t => t.node_id));
    return [];
  }
  const where = [];
  const params = [];
  if (filters.q) {
    where.push('(l.title LIKE ? OR l.location LIKE ?)');
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (Number.isFinite(filters.minPrice)) {
    where.push('l.price_eur >= ?');
    params.push(filters.minPrice);
  }
  if (Number.isFinite(filters.maxPrice)) {
    where.push('l.price_eur <= ?');
    params.push(filters.maxPrice);
  }
  if (Number.isFinite(filters.maxDetour)) {
    where.push('g.detour_min IS NOT NULL AND g.detour_min <= ?');
    params.push(filters.maxDetour);
  }
  const marks = searchIds.map(() => '?').join(',');
  const rows = await query(
    `WITH hits AS (
       SELECT listing_id, MAX(first_seen_at) AS first_seen_at
         FROM listing_search_hits WHERE search_id IN (${marks})
        GROUP BY listing_id
     )
     SELECT ${LISTING_COLUMNS}, h.first_seen_at,
            g.lat, g.lon, g.offroute_km, g.detour_min, g.status AS geo_status
       FROM hits h
       JOIN listings l ON l.id = h.listing_id
       LEFT JOIN listing_route_geo g ON g.listing_id = l.id AND g.route_search_id = ?
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY h.first_seen_at DESC, l.id DESC`,
    [...searchIds, route ? route.id : null, ...params]
  );
  const readings = await loadReadings(query, rows.map(r => r.id));
  const prepared = prepare(tree, hunt);
  const listings = rows.map(r => {
    const reading = readings.get(String(r.id));
    return {
      ...r,
      details: JSON.parse(r.details || '{}'),
      images: JSON.parse(r.images || '[]'),
      node_id: reading ? reading.node_id : null,
      facts: reading ? reading.facts : {},
      fit: verdict(prepared, reading),
    };
  });
  placeListings(listings, family.base_url);
  // Once per scope, for the targets and every product the offers resolved to
  // below them: the list, its overview and the comparison share it.
  if (!scope.markets) {
    const nodes = new Set(hunt.targets.map(t => t.node_id));
    for (const l of listings) if (l.fit.target_id && l.node_id) nodes.add(l.node_id);
    scope.markets = await nodeMarkets(query, tree, [...nodes]);
  }
  annotateMarket(listings, scope.markets);
  attachScores(listings, hunt.conditions);
  return listings;
}

/** The corridor's shape for the map, so it needs no second request. */
function routeShape(route) {
  if (!route) return null;
  const plan = JSON.parse(route.plan_json || '{}');
  return {
    origin: route.origin,
    destination: route.destination,
    half_width_km: route.half_width_km,
    polyline: thin(plan.polyline),
  };
}

module.exports = { huntScope, huntListings, routeShape };
