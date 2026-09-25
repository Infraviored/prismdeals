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
  // "ohne ABS" is a stated no, not a stated fact that happens to exist.
  if (wants.present === true) return value === false ? 'violated' : 'met';
  return contradicts(wants, value) ? 'violated' : 'met';
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]));
  }
  return value;
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
  // Must states from the latest comparative run (quotes already checked there)
  // override what the patterns read; "retrofittable" and anything else unknown
  // counts as open.
  const judged = listing.rank_musts || null;
  const requirements = Array.isArray(fields) ? fields : [];

  const gate = { met: [], violated: [], open: [] };
  const soft = { met: 0, total: 0 };
  // Wishes by name, so the sheet can say which ones this offer brings.
  const wishes = { met: [], missed: [], open: [] };
  const judgedWants = listing.rank_wants || null;
  const states = requirements.map(field => {
    const fromRun = judged?.[field.id];
    // Only while the buyer still wants what the run judged against: "met" for
    // at least 16 GB says nothing once the must is 32 GB.
    const sameWants =
      !judgedWants ||
      JSON.stringify(sortKeys(judgedWants[field.id] || {})) === JSON.stringify(sortKeys(field.buyer_wants || {}));
    if (fromRun && sameWants) return fromRun === 'met' || fromRun === 'violated' ? fromRun : 'open';
    return stateOf(field, facts);
  });
  requirements.forEach((field, i) => {
    if (isHard(field)) {
      gate[states[i]].push(formatRequirementText(field));
    } else {
      soft.total += 1;
      // A wish the offer does not mention is neither kept nor broken: half.
      // Counted as missed, one unmentioned "ABS" cut good offers to 19 %.
      if (states[i] === 'met') soft.met += 1;
      else if (states[i] === 'open') soft.met += 0.5;
      const label = field.label || formatRequirementText(field);
      wishes[states[i] === 'met' ? 'met' : states[i] === 'violated' ? 'missed' : 'open'].push(label);
    }
  });
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
  // How much of what must be true the seller bothered to state. Wishes stay
  // out: "ohne ABS" is honest, not a better-documented offer.
  const hardStates = states.filter((_, i) => isHard(requirements[i]));
  const stated = hardStates.length
    ? hardStates.filter(state => state !== 'open').length / hardStates.length
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
    wishes,
    axes: grades,
    market_basis: listing.market_basis || null,
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
    `SELECT lsh.listing_id, ks.item_json, sfs.term_id
       FROM listing_search_hits lsh
       JOIN searches s ON s.id = lsh.search_id
       JOIN knowledge_sets ks ON ks.id = s.knowledge_set_id
       LEFT JOIN search_family_searches sfs ON sfs.search_id = lsh.search_id
      WHERE lsh.listing_id IN (${ids.map(() => '?').join(',')})
        ${scope ? `AND lsh.search_id IN (${scope.map(() => '?').join(',')})` : ''}
        AND ks.item_json IS NOT NULL`,
    scope ? [...ids, ...scope] : ids
  );
  const fieldsByListing = new Map();
  // The models (family terms) whose searches found the listing: a
  // requirement for one model ("under 5000 km" for the CBR) scores only it.
  const termsByListing = new Map();
  for (const row of rows) {
    const id = String(row.listing_id);
    if (row.term_id != null) {
      if (!termsByListing.has(id)) termsByListing.set(id, new Set());
      termsByListing.get(id).add(String(row.term_id));
    }
    if (fieldsByListing.has(id)) continue;
    try {
      const fields = JSON.parse(row.item_json)?.fields;
      if (Array.isArray(fields) && fields.length) fieldsByListing.set(id, fields);
    } catch {
      // A malformed knowledge set judges nothing rather than everything.
    }
  }
  const forListing = (id) => {
    const terms = termsByListing.get(id) || new Set();
    return (fieldsByListing.get(id) || []).filter(
      f => !Array.isArray(f.applies_to) || !f.applies_to.length || f.applies_to.some(t => terms.has(String(t)))
    );
  };
  for (const listing of listings) {
    const parts = scoreListing(listing, forListing(String(listing.id)));
    listing.score = parts.score;
    listing.score_parts = parts;
  }
  return listings;
}

module.exports = { scoreListing, attachScores, OPEN_CAP };
