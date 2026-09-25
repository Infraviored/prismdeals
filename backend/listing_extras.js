// Small things every listing endpoint adds: the price's history, a thinned
// route line.

/**
 * The prices a listing has carried, for the ones that have moved.
 *
 * Asked for the whole page at once rather than per row: fifty listings would
 * otherwise be fifty queries for a line drawing. Only listings with more than
 * one recorded price get an entry -- a price that never moved has no shape to
 * draw and a flat line would suggest it was watched when it may not have been.
 */
async function attachPriceHistory(query, listings) {
  const ids = listings.map(l => String(l.id));
  if (ids.length === 0) return listings;

  const rows = await query(
    `SELECT listing_id, price_eur, seen_at
       FROM listing_price_history
      WHERE listing_id IN (${ids.map(() => '?').join(',')})
      ORDER BY seen_at, rowid`,
    ids
  );

  const byListing = new Map();
  for (const row of rows) {
    const key = String(row.listing_id);
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push({ price_eur: row.price_eur, seen_at: row.seen_at });
  }

  for (const listing of listings) {
    const history = byListing.get(String(listing.id));
    listing.price_history = history && history.length > 1 ? history : null;
  }
  return listings;
}

/**
 * Every nth point of a polyline, both ends kept.
 *
 * A map draws the shape, not the kerb. The stored route holds ~4500 vertices —
 * 101 KB of JSON — and the preview endpoint already thinned its copy to 400
 * before sending it to the very same map component. Doing it in one path and
 * not the other was an oversight, not a decision.
 */
function thin(points, limit = 400) {
  if (!Array.isArray(points) || points.length <= limit) return points || [];
  const step = points.length / limit;
  const out = [];
  for (let i = 0; i < limit; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

module.exports = { attachPriceHistory, thin };
