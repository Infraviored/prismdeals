/**
 * What a thing usually costs, so that a cheap one can be pointed at.
 *
 * The surface reserves one colour for one meaning: this price is worth your
 * attention. It had never once appeared, because `is_deal` was derived from
 * `niceness_score >= 85` and only 10 of 1266 listings carry a score at all --
 * each of them exactly 50. A product whose single accent never fires reads as
 * a grey list, which is what the owner saw.
 *
 * The reference is the median price of the same search. That is the right
 * grouping rather than a lucky one: a search family expands to one search per
 * model per place, so "the same search" already means "the same printer in the
 * same area". Comparing a Brother against a Kyocera would be noise.
 *
 * The median, not the mean: one listing at 1,200 € among fifteen at 80 € moves
 * a mean out of the market and leaves a deal looking ordinary.
 *
 * No model is asked. This is a pure function of stored prices, which is what
 * docs/ROADMAP.md requires of scoring.
 */

// How often the accent may fire. Measured against the stored 1,266 listings:
// "20 % under the median" marked 35 % of every list, and a colour a third of
// the rows wear says nothing. The cheapest twentieth of a search marks 75 of
// 1,280 -- roughly two coral rows on a screen of fifty, which is what "worth
// your attention" should look like.
const DEAL_PERCENTILE = 0.05;

// The percentile alone would always mark a twentieth, even in a market where
// every listing costs the same. This is the guard that stops it: in a tight
// market nothing is a deal, however it ranks.
const DEAL_RATIO = 0.7;
const MIN_ABSOLUTE_SAVING_EUR = 15;

// Three prices do not describe a market. Under this, no listing is a deal.
const MIN_GROUP_SIZE = 4;

/**
 * Decides whether one price is a deal against its reference.
 *
 * @param {number|null} priceEur
 * @param {{median: number, count: number}|undefined} reference
 * @returns {{isDeal: boolean, delta: number|null}}
 */
function judge(priceEur, reference) {
  if (!reference || reference.count < MIN_GROUP_SIZE) return { isDeal: false, delta: null };
  if (typeof priceEur !== 'number' || priceEur <= 0) return { isDeal: false, delta: null };

  const delta = reference.median - priceEur;
  const isDeal =
    priceEur <= reference.cheapest &&
    priceEur <= reference.median * DEAL_RATIO &&
    delta >= MIN_ABSOLUTE_SAVING_EUR;
  return { isDeal, delta: delta > 0 ? Math.round(delta) : null };
}

/**
 * Median, cheap-end cut-off and group size per search.
 *
 * SQLite has neither median nor percentile, so both are picked by position in
 * the sorted prices: the middle row (or the mean of the two middle rows), and
 * the row that closes the cheapest twentieth.
 *
 * @param {(sql: string, params: any[]) => Promise<any[]>} query
 * @param {number[]} searchIds
 * @returns {Promise<Map<number, {median: number, cheapest: number, count: number}>>}
 */
async function referencePrices(query, searchIds) {
  const byId = new Map();
  if (!searchIds || searchIds.length === 0) return byId;

  const placeholders = searchIds.map(() => '?').join(',');
  const sql = `
    SELECT search_id,
           AVG(CASE WHEN rn IN ((cnt + 1) / 2, (cnt + 2) / 2) THEN price_eur END) AS median,
           MAX(CASE WHEN rn = cheap_rn THEN price_eur END) AS cheapest,
           MAX(cnt) AS cnt
      FROM (
        SELECT lsh.search_id AS search_id,
               l.price_eur AS price_eur,
               ROW_NUMBER() OVER (PARTITION BY lsh.search_id ORDER BY l.price_eur) AS rn,
               COUNT(*)     OVER (PARTITION BY lsh.search_id) AS cnt,
               MAX(1, CAST(COUNT(*) OVER (PARTITION BY lsh.search_id) * ${DEAL_PERCENTILE} AS INTEGER)) AS cheap_rn
          FROM listing_search_hits lsh
          JOIN listings l ON l.id = lsh.listing_id
         WHERE lsh.search_id IN (${placeholders})
           AND l.price_eur IS NOT NULL
           AND l.price_eur > 0
      )
     GROUP BY search_id
  `;

  for (const row of await query(sql, searchIds)) {
    if (row.median == null || row.cheapest == null) continue;
    byId.set(Number(row.search_id), {
      median: Number(row.median),
      cheapest: Number(row.cheapest),
      count: Number(row.cnt),
    });
  }
  return byId;
}

/**
 * Annotates listings in place with `is_deal` and `price_delta_eur`.
 *
 * Listings carry a single `search_id`; a listing found by several searches is
 * judged against the one it was first stored under, which is the same search
 * the row's own name comes from.
 */
async function annotateDeals(query, listings) {
  const ids = [...new Set(listings.map(l => l.search_id).filter(Boolean))].map(Number);
  const references = await referencePrices(query, ids);

  for (const listing of listings) {
    const { isDeal, delta } = judge(listing.price_eur, references.get(Number(listing.search_id)));
    listing.is_deal = isDeal;
    listing.price_delta_eur = delta;
  }
  return listings;
}


/**
 * The ids of every listing in these searches that is a deal.
 *
 * "Deals only" filtered the fifty rows already on screen and then reported that
 * count as the size of the search: 1,266 listings, 50 loaded, the header read
 * "2", implying the whole search held two. Filtering has to happen where the
 * counting happens, which is the server.
 *
 * @param {(sql: string, params: any[]) => Promise<any[]>} query
 * @param {number[]} searchIds
 * @returns {Promise<string[]>} listing ids
 */
async function dealListingIds(query, searchIds) {
  const references = await referencePrices(query, searchIds);
  const usable = [...references.entries()].filter(([, r]) => r.count >= MIN_GROUP_SIZE);
  if (usable.length === 0) return [];

  const ids = [];
  for (const [searchId, reference] of usable) {
    const rows = await query(
      `SELECT DISTINCT l.id AS id, l.price_eur AS price_eur
         FROM listing_search_hits lsh
         JOIN listings l ON l.id = lsh.listing_id
        WHERE lsh.search_id = ?
          AND l.price_eur IS NOT NULL
          AND l.price_eur > 0`,
      [searchId]
    );
    for (const row of rows) {
      if (judge(Number(row.price_eur), reference).isDeal) ids.push(String(row.id));
    }
  }
  return ids;
}

module.exports = {
  judge,
  referencePrices,
  dealListingIds,
  annotateDeals,
  DEAL_PERCENTILE,
  DEAL_RATIO,
  MIN_ABSOLUTE_SAVING_EUR,
  MIN_GROUP_SIZE,
};
