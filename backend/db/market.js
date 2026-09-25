/**
 * What a product usually costs, per graph node (plan §6).
 *
 * The market of a node is every offer resolved into its subtree -- found by any
 * hunt, not only this one -- that is still listed, has a price and is no
 * request. An SC59 is priced against SC59s, a Ventilator against Ventilators.
 * The same grouping serves every user hunting the same thing.
 *
 * The median, not the mean: one listing at 1,200 € among fifteen at 80 € moves
 * a mean out of the market and leaves a deal looking ordinary.
 */

// How often the accent may fire: the cheapest twentieth of a market, and only
// when that is clearly under the median -- in a tight market nothing is a deal.
const DEAL_PERCENTILE = 0.05;
const DEAL_RATIO = 0.7;
const MIN_ABSOLUTE_SAVING_EUR = 15;
// Three prices do not describe a market.
const MIN_GROUP_SIZE = 4;

function judge(priceEur, market) {
  if (!market || market.count < MIN_GROUP_SIZE) return { isDeal: false, delta: null };
  if (typeof priceEur !== 'number' || priceEur <= 0) return { isDeal: false, delta: null };
  const delta = market.median - priceEur;
  const isDeal =
    priceEur <= market.cheapest &&
    priceEur <= market.median * DEAL_RATIO &&
    delta >= MIN_ABSOLUTE_SAVING_EUR;
  return { isDeal, delta: delta > 0 ? Math.round(delta) : null };
}

function summarise(prices) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const cheapest = sorted[Math.max(1, Math.floor(n * DEAL_PERCENTILE)) - 1];
  return { median, cheapest, count: n, prices: sorted };
}

/** {nodeId: {median, cheapest, count, prices}} over each node's subtree. */
async function nodeMarkets(query, tree, nodeIds) {
  const out = new Map();
  if (!nodeIds.length) return out;
  const rows = await query(
    `SELECT r.node_id, l.price_eur
       FROM listing_resolution r
       JOIN listings l ON l.id = r.listing_id
       LEFT JOIN listing_facts f ON f.listing_id = r.listing_id AND f.attr_id = 'is_request'
      WHERE l.delisted_at IS NULL AND l.price_eur > 0
        AND COALESCE(f.value_json, 'false') <> 'true'`
  );
  const wanted = new Set(nodeIds);
  const prices = new Map(nodeIds.map(id => [id, []]));
  for (const row of rows) {
    for (const n of tree.ancestors(row.node_id)) {
      if (wanted.has(n.id)) prices.get(n.id).push(row.price_eur);
    }
  }
  for (const [id, list] of prices) {
    const market = summarise(list);
    if (market) out.set(id, market);
  }
  return out;
}

/** is_deal, price_delta_eur, market_median from the market of each listing's target. */
function annotateMarket(listings, markets) {
  for (const listing of listings) {
    const market = listing.fit?.target_id ? markets.get(listing.fit.target_id) : null;
    const { isDeal, delta } = judge(listing.price_eur, market);
    listing.is_deal = isDeal;
    listing.price_delta_eur = delta;
    listing.market_median = market && market.count >= MIN_GROUP_SIZE ? market.median : null;
    listing.market_basis = market ? { count: market.count, median: market.median } : null;
  }
  return listings;
}

module.exports = { judge, summarise, nodeMarkets, annotateMarket, MIN_GROUP_SIZE, DEAL_RATIO };
