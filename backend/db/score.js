/**
 * One score per listing, the same formula for every kind of thing.
 *
 *   score = gate × Σ(weight_axis × grade_axis) / Σ weight_axis
 *
 * The gate comes from the must-have requirements: one stated violation is 0,
 * every requirement the listing leaves open caps the score at 0.75 of what it
 * would be. The grades come from the five axes of docs/product-core.md, the
 * weights from the listing's profile (scraper/profiles.py, exported to
 * profiles.json). An axis without a basis -- no market, no route -- drops out
 * of both sums instead of counting with an invented grade.
 *
 * This replaces the niceness score a model used to hand out from impressions
 * ("vague, claim-heavy"), which changed with whichever reference description it
 * had seen. The model supplies facts; the grade is arithmetic.
 */

const PROFILES = require('./profiles.json');
const { contradicts, formatRequirementText } = require('../overview/requirements');

const OPEN_CAP = 0.75;

// Kleinanzeigen's own condition field, as the detail page states it.
const CONDITION = {
  neu: 1,
  'sehr gut': 0.85,
  gut: 0.7,
  'in ordnung': 0.5,
  defekt: 0,
};

const LISTING_CATEGORY = /\/s-anzeige\/[^/?#]+\/\d+-(\d+)-\d+/;

function profileWeights(url) {
  const match = url ? LISTING_CATEGORY.exec(url) : null;
  const key = match ? PROFILES.categories[match[1]] : null;
  const weights = key ? PROFILES.profiles[key]?.weights : null;
  // "Offen" and "Außerhalb" weigh nothing; judge them evenly rather than not at all.
  if (!weights || weights.every(w => w === 0)) return [1, 1, 1, 1, 1];
  return weights;
}

function isHard(field) {
  return field.importance === 'high' || field.hard === true;
}

/** met / violated / open for one requirement against what the listing states. */
function stateOf(field, facts) {
  const wants = field.buyer_wants || {};
  const value = facts[field.id];
  if (value === null || value === undefined) return 'open';
  if (wants.present === true) return 'met';
  return contradicts(wants, value) ? 'violated' : 'met';
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mean(values) {
  const present = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

/**
 * @param {object} listing  with fit.facts, price_eur, market_median, details, images, detour_min, url
 * @param {Array}  fields   requirement fields of the search that found it
 * @returns {{score:number|null, gate:object, axes:object}}
 */
function scoreListing(listing, fields) {
  const facts = listing.fit?.facts || {};
  const rankMusts = listing.rank_musts || listing.musts || null;
  const requirements = Array.isArray(fields) ? fields : [];

  const gate = { met: [], violated: [], open: [] };
  const soft = { met: 0, total: 0 };
  for (const field of requirements) {
    let state;
    if (rankMusts && rankMusts[field.id]) {
      const rm = rankMusts[field.id];
      state = rm === 'met' ? 'met' : (rm === 'violated' ? 'violated' : 'open');
    } else {
      state = stateOf(field, facts);
    }
    if (isHard(field)) {
      gate[state].push(formatRequirementText(field));
    } else {
      soft.total += 1;
      if (state === 'met') soft.met += 1;
    }
  }
  const gateFactor = gate.violated.length ? 0 : Math.pow(OPEN_CAP, gate.open.length);

  // Identity: the preferences on top of the must-haves. Without any, a listing
  // that clears the gate is as right as it can be.
  const identity = requirements.length ? (soft.total ? soft.met / soft.total : 1) : null;

  // Value: at the median 0.5, 30 % below about 0.86, 30 % above about 0.14.
  let value = null;
  if (typeof listing.price_eur === 'number' && listing.market_median > 0) {
    value = listing.price_eur <= 0 ? 1 : clamp01(0.5 + ((listing.market_median - listing.price_eur) / listing.market_median) * 1.2);
  }

  // Condition and risk: what the seller states about the thing itself, how much
  // of what matters they bothered to state, and how much they show.
  const conditionText = String(listing.details?.Zustand || '').trim().toLowerCase();
  const condition = conditionText in CONDITION ? CONDITION[conditionText] : null;
  const stated = requirements.length
    ? requirements.filter(f => facts[f.id] !== null && facts[f.id] !== undefined).length / requirements.length
    : null;
  const photoCount = Array.isArray(listing.images) ? listing.images.length : 0;
  const photos = clamp01(photoCount / 4);
  const risk = mean([condition, stated, photos]);

  // Procurement: minutes of detour, where a route knows them.
  const procurement = typeof listing.detour_min === 'number' ? clamp01(1 - Math.max(0, listing.detour_min) / 60) : null;

  const grades = { identity, value, risk, procurement, fit: null };
  const weights = profileWeights(listing.url);
  let sum = 0;
  let weight = 0;
  PROFILES.axes.forEach((axis, i) => {
    const grade = grades[axis];
    if (grade === null || grade === undefined) return;
    sum += weights[i] * grade;
    weight += weights[i];
  });

  const score = weight > 0 ? Math.round(gateFactor * (sum / weight) * 100) : null;
  return {
    score,
    gate: { ...gate, factor: gateFactor },
    axes: grades,
  };
}

/**
 * Attaches `score` and `score_parts` to listings, judged against the
 * requirements of the search that found them in this scope.
 */
async function attachScores(query, listings, scopeSearchIds = null) {
  if (!listings.length) return listings;
  const ids = listings.map(l => String(l.id));
  const scope = Array.isArray(scopeSearchIds) && scopeSearchIds.length ? scopeSearchIds : null;
  const rows = await query(
    `SELECT lsh.listing_id, ks.item_json
       FROM listing_search_hits lsh
       JOIN searches s ON s.id = lsh.search_id
       JOIN knowledge_sets ks ON ks.id = s.knowledge_set_id
      WHERE lsh.listing_id IN (${ids.map(() => '?').join(',')})
        ${scope ? `AND lsh.search_id IN (${scope.map(() => '?').join(',')})` : ''}
        AND ks.item_json IS NOT NULL`,
    scope ? [...ids, ...scope] : ids
  );
  const fieldsByListing = new Map();
  for (const row of rows) {
    if (fieldsByListing.has(String(row.listing_id))) continue;
    try {
      const fields = JSON.parse(row.item_json)?.fields;
      if (Array.isArray(fields) && fields.length) fieldsByListing.set(String(row.listing_id), fields);
    } catch {
      // A malformed knowledge set judges nothing rather than everything.
    }
  }
  for (const listing of listings) {
    const parts = scoreListing(listing, fieldsByListing.get(String(listing.id)) || []);
    listing.score = parts.score;
    listing.score_parts = parts;
  }
  return listings;
}

module.exports = { scoreListing, attachScores, OPEN_CAP };
