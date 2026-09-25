// Where a listing is, and how far that is from where the buyer searched.
//
// Only a corridor used to place listings (listing_route_geo), so a plain hunt
// had no map and no "nearest first". The printed place is enough: most cards
// carry a postal code ("81547 Untergiesing-Harlaching"), the rest a state and a
// town ("Bayern - Germering"). Both are answered from the shipped tables, the
// same ones the corridor planner uses -- no geocoding service, no request.

const fs = require('fs');
const path = require('path');
const places = require('./places');

const PLZ_PATH = path.join(__dirname, '..', 'scraper', 'reference', 'plz_centroids.csv');

let plzTable = null;

function plz() {
  if (plzTable) return plzTable;
  plzTable = new Map();
  try {
    const lines = fs.readFileSync(PLZ_PATH, 'utf-8').split('\n').slice(1);
    for (const line of lines) {
      const [code, lat, lon] = line.split(',');
      if (code && lat && lon) plzTable.set(code.trim(), [Number(lat), Number(lon)]);
    }
  } catch (error) {
    console.error('Could not load the postal code table:', error.message);
  }
  return plzTable;
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

/** The candidate nearest to `near`, or the first when there is no hint. */
function nearest(candidates, near) {
  if (!candidates.length) return null;
  if (!near) return candidates[0];
  return candidates.reduce((best, p) =>
    distanceKm([p.lat, p.lon], near) < distanceKm([best.lat, best.lon], near) ? p : best
  );
}

/**
 * [lat, lon] of a printed place, or null.
 *
 * `near` settles a name that exists more than once. A bare name (no postal
 * code, no state) further than `withinKm` from it is dropped: "Neuhausen" from
 * a Munich search is the district, and the only Neuhausen the table knows is
 * 150 km away -- a pin there is worse than no pin.
 */
function coordinatesOf(location, near = null, withinKm = null) {
  const text = String(location || '').trim();
  if (!text) return null;
  const code = text.match(/^(\d{5})\b/);
  if (code) {
    const found = plz().get(code[1]);
    if (found) return found;
  }
  const [state, town] = text.includes(' - ') ? text.split(' - ', 2) : [null, text.replace(/^\d{5}\s*/, '')];
  const place = nearest(places.byName(town.trim(), state ? state.trim() : null), near);
  if (!place) return null;
  if (!state && near && withinKm && distanceKm([place.lat, place.lon], near) > withinKm) return null;
  return [place.lat, place.lon];
}

/**
 * Where a search is centred and how wide it reaches, from its URL.
 *
 * The URL names the town only as a slug ("s-vilgertshofen/…/l7074r50"); a
 * slug shared by two towns is settled by where the listings actually are.
 */
function centreOf(searchUrl, listingPoints = []) {
  let pathname;
  try {
    pathname = new URL(searchUrl).pathname;
  } catch {
    return null;
  }
  const radius = pathname.match(/l\d+r(\d+)/);
  const slug = (pathname.match(/^\/s-([^/]+)/) || [])[1];
  if (!slug || !radius || /^(anzeige|suche)/.test(slug)) return null;
  const hint = listingPoints.length
    ? [median(listingPoints.map(p => p[0])), median(listingPoints.map(p => p[1]))]
    : null;
  const name = slug.replace(/-/g, ' ');
  const place = nearest(places.byName(name), hint);
  if (!place) return null;
  return { lat: place.lat, lon: place.lon, radius_km: Number(radius[1]), label: place.label };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Gives every listing lat/lon (where the corridor has not already) and its
 * distance from the search centre. Returns the centre, or null.
 *
 * `measure: false` for a corridor: there the detour is the distance, and km
 * from the hunt's old town would read as one.
 */
function placeListings(listings, searchUrl, { measure = true } = {}) {
  // Postal codes are unambiguous, so they alone locate the search's town.
  const coded = listings
    .map(l => (typeof l.lat === 'number' ? [l.lat, l.lon] : /^\d{5}\b/.test(l.location || '') ? coordinatesOf(l.location) : null))
    .filter(Boolean);
  const centre = centreOf(searchUrl, coded);
  const hint = centre ? [centre.lat, centre.lon] : null;
  for (const listing of listings) {
    if (typeof listing.lat !== 'number' || typeof listing.lon !== 'number') {
      const found = coordinatesOf(listing.location, hint, centre ? centre.radius_km * 1.5 + 20 : null);
      listing.lat = found ? found[0] : null;
      listing.lon = found ? found[1] : null;
    }
    listing.distance_km =
      measure && centre && typeof listing.lat === 'number'
        ? Math.round(distanceKm([centre.lat, centre.lon], [listing.lat, listing.lon]) * 10) / 10
        : null;
  }
  return centre;
}

module.exports = { coordinatesOf, centreOf, placeListings, distanceKm };
