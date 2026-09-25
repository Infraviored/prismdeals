/**
 * What a product usually costs, per graph node (plan §6).
 *
 * The market of a node is every offer ever resolved into its subtree -- found
 * by any hunt, not only this one -- with a price and no request. An SC59 is
 * priced against SC59s, a Ventilator against Ventilators, for every user
 * hunting the same thing.
 *
 * Where the offers state numbers that move the price (a motorcycle's mileage
 * and year, a laptop's memory), the usual price is a model of them: log price
 * against at most two such facts, fitted robustly. A deal is then an asking
 * price well below what *this* offer should cost -- a cheap SC59 with 60,000 km
 * is not one. Without such facts, or for an offer that does not state them,
 * the usual price is the median.
 */

// The median path: the cheapest twentieth, and clearly under the median.
const DEAL_PERCENTILE = 0.05;
const DEAL_RATIO = 0.7;
const MIN_ABSOLUTE_SAVING_EUR = 15;
// Three prices do not describe a market.
const MIN_GROUP_SIZE = 4;
// A price model needs this many offers stating the fact, and facts that
// matter: most offers state them, and they move the price.
const MIN_MODEL_SIZE = 20;
const MIN_COVERAGE = 0.6;
const MIN_CORRELATION = 0.3;
const MAX_FACTORS = 2;

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/.exec(String(value ?? ''));
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  const valid = values.filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const n = valid.length;
  return n % 2 ? valid[(n - 1) / 2] : (valid[n / 2 - 1] + valid[n / 2]) / 2;
}

function rank(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  order.forEach(([, i], r) => { out[i] = r; });
  return out;
}

/** Spearman's rank correlation: does the fact move the price at all. */
function spearman(xs, ys) {
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = (n - 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - mx);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - mx) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Least squares by the normal equations, weighted; k is at most three. */
function solve(rows, ys, weights) {
  const k = rows[0].length;
  const a = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  rows.forEach((x, n) => {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i][j] += weights[n] * x[i] * x[j];
      a[i][k] += weights[n] * x[i] * ys[n];
    }
  });
  for (let c = 0; c < k; c++) {
    let pivot = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    if (Math.abs(a[c][c]) < 1e-12) return null;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= k; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row, i) => row[k] / row[i]);
}

/**
 * log price = b0 + b1 x1 (+ b2 x2), fitted with Huber weights so that one
 * dreamer at three times the market does not bend the line.
 */
function fitModel(observations, attrs) {
  const rows = observations.map(o => [1, ...attrs.map(a => o.facts[a])]);
  const ys = observations.map(o => Math.log(o.price));
  let weights = rows.map(() => 1);
  let coef = null;
  for (let iteration = 0; iteration < 10; iteration++) {
    coef = solve(rows, ys, weights);
    if (!coef) return null;
    const residuals = rows.map((x, n) => ys[n] - x.reduce((s, v, i) => s + v * coef[i], 0));
    const scale = 1.4826 * median(residuals.map(Math.abs)) || 1e-6;
    weights = residuals.map(r => (Math.abs(r) <= 1.345 * scale ? 1 : (1.345 * scale) / Math.abs(r)));
  }
  return coef;
}

/** The facts that price a node: stated by most offers and moving the price. */
function pricingFacts(observations) {
  const counts = new Map();
  for (const o of observations) {
    for (const [attr, value] of Object.entries(o.facts)) counts.set(attr, (counts.get(attr) || 0) + (value !== null ? 1 : 0));
  }
  const chosen = [];
  for (const [attr, count] of counts) {
    if (count < Math.max(MIN_MODEL_SIZE, observations.length * MIN_COVERAGE)) continue;
    const stated = observations.filter(o => o.facts[attr] !== null);
    const rho = spearman(stated.map(o => o.facts[attr]), stated.map(o => o.price));
    if (Math.abs(rho) >= MIN_CORRELATION) chosen.push({ attr, rho });
  }
  // The same fact under two names ("km" from the filter, "kilometerstand"
  // from the page) is one factor, not two.
  const picked = [];
  for (const c of chosen.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho))) {
    const both = observations.filter(o => o.facts[c.attr] !== null && picked.every(p => o.facts[p] !== null));
    const duplicate = picked.some(p => Math.abs(spearman(both.map(o => o.facts[c.attr]), both.map(o => o.facts[p]))) > 0.95);
    if (!duplicate) picked.push(c.attr);
    if (picked.length === MAX_FACTORS) break;
  }
  return picked;
}

function marketOf(observations) {
  const prices = observations.map(o => o.price).sort((a, b) => a - b);
  if (!prices.length) return null;
  const n = prices.length;
  const market = {
    median: median(prices),
    cheapest: prices[Math.max(1, Math.floor(n * DEAL_PERCENTILE)) - 1],
    count: n,
    model: null,
  };
  const attrs = pricingFacts(observations);
  if (attrs.length) {
    const usable = observations.filter(o => attrs.every(a => o.facts[a] !== null));
    const coef = usable.length >= MIN_MODEL_SIZE ? fitModel(usable, attrs) : null;
    if (coef) market.model = { attrs, coef, count: usable.length };
  }
  return market;
}

/** The price this offer should have, and on what it is based. */
function expected(listing, market) {
  if (market.model) {
    const values = market.model.attrs.map(a => asNumber(listing.facts?.[a]));
    if (values.every(v => v !== null)) {
      const log = market.model.coef[0] + values.reduce((s, v, i) => s + v * market.model.coef[i + 1], 0);
      return {
        price: Math.round(Math.exp(log)),
        by: Object.fromEntries(market.model.attrs.map((a, i) => [a, values[i]])),
      };
    }
  }
  return { price: market.median, by: null };
}

function judge(listing, market) {
  if (!market || market.count < MIN_GROUP_SIZE) return { isDeal: false, delta: null, usual: null };
  const usual = expected(listing, market);
  const price = listing.price_eur;
  if (typeof price !== 'number' || price <= 0) return { isDeal: false, delta: null, usual };
  const delta = usual.price - price;
  // On the median path a deal is also among the cheapest of the market; with
  // a model, being well under this offer's own price is the whole test.
  const cheapEnough = usual.by ? true : price <= market.cheapest;
  const isDeal = cheapEnough && price <= usual.price * DEAL_RATIO && delta >= MIN_ABSOLUTE_SAVING_EUR;
  return { isDeal, delta: delta > 0 ? Math.round(delta) : null, usual };
}

// A market may borrow from above up to the product itself: the CBR's offers
// price an SC59 by year and mileage, "Motorräder" as a whole price nothing.
const POOLED_KINDS = new Set(['model', 'family', 'class', 'generation', 'config']);

/**
 * {nodeId: market} for each target. Too few offers of the node itself for a
 * price model (plan §6: 20), and the nearest product node above it that has
 * one lends it -- year and mileage price every generation of the CBR.
 */
async function nodeMarkets(query, tree, nodeIds) {
  const out = new Map();
  if (!nodeIds.length) return out;
  const pools = new Set(nodeIds);
  for (const id of nodeIds) {
    for (const n of tree.ancestors(id).slice(0, -1).reverse()) {
      if (!POOLED_KINDS.has(n.kind)) break;
      pools.add(n.id);
    }
  }
  const rows = await query(
    `SELECT r.listing_id, r.node_id, l.price_eur
       FROM listing_resolution r
       JOIN listings l ON l.id = r.listing_id
       LEFT JOIN listing_facts f ON f.listing_id = r.listing_id AND f.attr_id = 'is_request'
      WHERE l.price_eur > 0 AND COALESCE(f.value_json, 'false') <> 'true'`
  );
  const byNode = new Map([...pools].map(id => [id, []]));
  const ids = new Set();
  for (const row of rows) {
    for (const n of tree.ancestors(row.node_id)) {
      if (pools.has(n.id)) {
        byNode.get(n.id).push({ id: String(row.listing_id), price: row.price_eur, facts: {} });
        ids.add(String(row.listing_id));
      }
    }
  }
  const facts = new Map();
  const list = [...ids];
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    for (const f of await query(
      `SELECT listing_id, attr_id, value_json FROM listing_facts
        WHERE listing_id IN (${chunk.map(() => '?').join(',')}) AND attr_id <> 'is_request'`,
      chunk
    )) {
      const value = asNumber(JSON.parse(f.value_json));
      if (value === null) continue;
      if (!facts.has(String(f.listing_id))) facts.set(String(f.listing_id), {});
      facts.get(String(f.listing_id))[f.attr_id] = value;
    }
  }
  const markets = new Map();
  for (const [id, observations] of byNode) {
    const attrsSeen = new Set(observations.flatMap(o => Object.keys(facts.get(o.id) || {})));
    for (const o of observations) {
      const own = facts.get(o.id) || {};
      o.facts = Object.fromEntries([...attrsSeen].map(a => [a, own[a] ?? null]));
    }
    const market = marketOf(observations);
    if (market) markets.set(id, market);
  }
  for (const id of nodeIds) {
    const chain = [id, ...tree.ancestors(id).slice(0, -1).reverse().map(n => n.id).filter(n => pools.has(n))];
    const own = markets.get(id);
    const withModel = chain.map(n => markets.get(n)).find(m => m && m.model);
    const withPrices = chain.map(n => markets.get(n)).find(m => m && m.count >= MIN_GROUP_SIZE);
    const base = own && own.count >= MIN_GROUP_SIZE ? own : withPrices;
    if (!base) continue;
    out.set(id, { ...base, model: withModel ? withModel.model : null });
  }
  return out;
}

/** is_deal, price_delta_eur, market_median, market_basis from each listing's target market. */
function annotateMarket(listings, markets) {
  for (const listing of listings) {
    const market = listing.fit?.target_id ? markets.get(listing.fit.target_id) : null;
    const { isDeal, delta, usual } = judge(listing, market);
    listing.is_deal = isDeal;
    listing.price_delta_eur = delta;
    listing.market_median = usual ? usual.price : null;
    listing.market_basis = market
      ? { count: market.count, median: usual ? usual.price : market.median, by: usual ? usual.by : null }
      : null;
  }
  return listings;
}

/** Price classes for a histogram: about seven, at round steps. */
function buildPriceHistogram(prices) {
  if (!prices || prices.length === 0) return { min: null, max: null, count: 0, bins: [] };
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const count = sorted.length;
  if (min === max) return { min, max, count, bins: [{ min, max, count, label: `${min} €` }] };
  const rawStep = (max - min) / 7;
  const niceSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000];
  const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep);
  const start = Math.floor(min / step) * step;
  const bins = [];
  for (let current = start; current <= max; current += step) {
    bins.push({ min: current, max: current + step - 1, count: 0, label: `${current}–${current + step - 1} €` });
  }
  for (const price of sorted) {
    bins[Math.min(Math.floor((price - start) / step), bins.length - 1)].count++;
  }
  return { min, max, count, bins };
}

module.exports = { judge, marketOf, median, nodeMarkets, annotateMarket, buildPriceHistogram, MIN_GROUP_SIZE, DEAL_RATIO };
