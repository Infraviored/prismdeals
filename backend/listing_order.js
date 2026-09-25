// How a hunt's listings are ordered, as one table instead of SQL branches.
//
// Distance and score exist only once listings are placed and scored, so the
// order is applied in JS over the whole hunt. Missing values sort last; ties
// keep the order the rows arrived in (Array.prototype.sort is stable).

const FIT_RANK = { fit: 0, unclear: 1, no: 2 };

const last = (value) => (typeof value === 'number' ? value : Infinity);
const byPrice = (l) => last(l.price_eur);
const byPriceDesc = (l) => (typeof l.price_eur === 'number' ? -l.price_eur : Infinity);
const byScore = (l) => (typeof l.score === 'number' ? -l.score : Infinity);
const byDetour = (l) => last(l.detour_min);
const byDistance = (l) => last(l.distance_km);
const byFit = (l) => FIT_RANK[l.fit?.verdict] ?? 1;
const byNewest = (l) => -(Date.parse(l.first_seen_at || '') || 0);

/** A comparator comparing by each key in turn. */
function by(...keys) {
  return (a, b) => {
    for (const key of keys) {
      const d = key(a) - key(b);
      if (d) return d;
    }
    return 0;
  };
}

/**
 * The comparator for a `sort` parameter, or null to keep the base order.
 * "near" is the detour on a corridor and the distance from the town otherwise.
 */
function listingOrder(sort, onRoute) {
  switch (sort) {
    case 'price_asc': return by(byPrice);
    case 'price_desc': return by(byPriceDesc);
    case 'newest':
    case 'freshness': return by(byNewest);
    case 'score': return by(byScore, byPrice);
    case 'near': return onRoute ? by(byDetour, byPrice) : by(byDistance, byPrice);
    case 'detour':
    case 'route': return by(byDetour);
    default: return onRoute ? by(byFit, byDetour) : null;
  }
}

module.exports = { listingOrder };
