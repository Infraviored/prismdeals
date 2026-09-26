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
const { conditionText } = require('./verdict');

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

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mean(values) {
  const present = values.filter(v => typeof v === 'number' && !Number.isNaN(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

/**
 * @param {object} listing     with fit.states (computed by verdict.js), price_eur,
 *                             market_median, details, images, detour_min, url
 * @param {Array}  conditions  the hunt's conditions
 * @returns {{score:number|null, gate:object, wishes:object, axes:object}}
 */
function scoreListing(listing, conditions) {
  const states = listing.fit?.states || {};
  // Only the conditions that apply to the listing's target have a state.
  const applied = (conditions || []).filter(c => states[c.id]);
  const gate = { met: [], violated: [], open: [] };
  const soft = { met: 0, total: 0 };
  // Wishes by name, so the sheet can say which ones this offer brings.
  const wishes = { met: [], missed: [], open: [] };
  for (const c of applied) {
    const state = states[c.id];
    if (c.importance === 'must') {
      gate[state].push(conditionText(c));
      continue;
    }
    soft.total += 1;
    // A wish the offer does not mention is neither kept nor broken: half.
    // Counted as missed, one unmentioned "ABS" cut good offers to 19 %.
    if (state === 'met') soft.met += 1;
    else if (state === 'open') soft.met += 0.5;
    wishes[state === 'met' ? 'met' : state === 'violated' ? 'missed' : 'open'].push(c.label);
  }
  // Another model, a request, a year outside the generation: nothing to score.
  // A model not recognised counts as one open must.
  const verdict = listing.fit?.verdict;
  const unplaced = verdict === 'unclear' && !listing.fit?.target_id ? 1 : 0;
  const gateFactor = gate.violated.length || verdict === 'no'
    ? 0
    : Math.pow(OPEN_CAP, gate.open.length + unplaced);

  // Identity: the preferences on top of the must-haves. Without any, a listing
  // that clears the gate is as right as it can be.
  const identity = applied.length ? (soft.total ? soft.met / soft.total : 1) : null;

  // Value: at the median 0.5, 30 % below about 0.86, 30 % above about 0.14.
  let value = null;
  if (typeof listing.price_eur === 'number' && listing.market_median > 0) {
    value = listing.price_eur <= 0 ? 1 : clamp01(0.5 + ((listing.market_median - listing.price_eur) / listing.market_median) * 1.2);
  }

  // Condition and risk: what the seller states about the thing itself, how much
  // of what matters they bothered to state, and how much they show.
  const zustand = String(listing.details?.Zustand || '').trim().toLowerCase();
  const condition = zustand in CONDITION ? CONDITION[zustand] : null;
  // How much of what must be true the seller bothered to state. Wishes stay
  // out: "ohne ABS" is honest, not a better-documented offer.
  const musts = applied.filter(c => c.importance === 'must');
  const stated = musts.length
    ? musts.filter(c => states[c.id] !== 'open').length / musts.length
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

/** Attaches `score` and `score_parts` to listings that carry a computed fit. */
function attachScores(listings, conditions) {
  for (const listing of listings) {
    const parts = scoreListing(listing, conditions);
    listing.score = parts.score;
    listing.score_parts = parts;
  }
  return listings;
}

module.exports = { scoreListing, attachScores, OPEN_CAP };
