/**
 * Where a listing is, from its printed place, and how far from the hunt's town.
 */
const assert = require('assert');
const { coordinatesOf, centreOf, placeListings } = require('./listing_geo');

const VENTILATOR = 'https://www.kleinanzeigen.de/s-vilgertshofen/preis::25/ventilator/k0c176l7074r50';

// A postal code is the most precise form a card prints.
const plz = coordinatesOf('81547 Untergiesing-Harlaching');
assert(plz && Math.abs(plz[0] - 48.10) < 0.05 && Math.abs(plz[1] - 11.58) < 0.05, 'postal code');

// "State - Town", the qualifier in brackets included.
const landsberg = coordinatesOf('Bayern - Landsberg (Lech)');
assert(landsberg && Math.abs(landsberg[0] - 48.05) < 0.1, 'state and town');

assert.strictEqual(coordinatesOf(''), null);
// A bare name far from the search is another town of that name.
const munich = [48.137, 11.576];
assert.strictEqual(coordinatesOf('Neuhausen', munich, 50), null);
assert(coordinatesOf('Germering', munich, 50), 'a bare name nearby is kept');
assert.strictEqual(coordinatesOf('Nirgendwo-Gibtsnicht'), null);

// The search's town comes from the URL slug and its radius from the tail.
const centre = centreOf(VENTILATOR);
assert.strictEqual(centre.radius_km, 50);
assert(/Vilgertshofen/.test(centre.label));
assert.strictEqual(centreOf('https://www.kleinanzeigen.de/s-ventilator/k0'), null);

// Every listing is placed and measured; a corridor's own position is kept.
const listings = [
  { id: 'a', location: '86899 Landsberg am Lech' },
  { id: 'b', location: '81547 Untergiesing-Harlaching' },
  { id: 'c', location: '' },
  { id: 'e', location: 'Sendling', postal_code: '81369' },
  { id: 'd', location: 'Bayern - Germering', lat: 1, lon: 2 },
];
placeListings(listings, VENTILATOR);
assert(listings[0].distance_km > 5 && listings[0].distance_km < 25, `Landsberg ${listings[0].distance_km}`);
assert(listings[1].distance_km > listings[0].distance_km, 'Munich is further than Landsberg');
assert.strictEqual(listings[2].lat, null);
assert.strictEqual(listings[2].distance_km, null);
assert.deepStrictEqual([listings[4].lat, listings[4].lon], [1, 2]);
assert(listings[3].lat > 48 && listings[3].lat < 48.2, 'the postal code column places a bare district');

console.log('test_listing_geo: all passed');
