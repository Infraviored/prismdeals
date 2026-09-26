/**
 * One offer listed twice is one row: same price and the same title, or mostly
 * the same description. Two sellers' own texts at one price stay two.
 */
const assert = require('assert');
const { foldSameOffers } = require('./db/same_offer');

const TEXT = 'Das Motorrad ist Baujahr 2013. Die Maschine ist abgemeldet und aktuell ohne TÜV, abgelaufen 05/2026. Die Maschine wurde dieses Jahr noch nicht bewegt und stand in der Garage.';
const rows = [
  { id: 'a', title: 'Honda CBR1000RR sc59 Facelift', price_eur: 6200, detailed_description: TEXT, location: 'Hohenwart', fit: { verdict: 'fit' }, score: 80 },
  { id: 'b', title: 'Honda CBR1000RR, SC59, Facelift, ABS', price_eur: 6200, detailed_description: `Im Auftrag angeboten. ${TEXT}`, location: 'Südstadt', fit: { verdict: 'fit' }, score: 85 },
  { id: 'c', title: 'Corsair Vengeance 32GB', price_eur: 100, location: 'Ulm', detailed_description: 'Verkaufe meinen Arbeitsspeicher, lief zwei Jahre ohne Probleme im Gaming PC, jetzt aufgerüstet.', fit: { verdict: 'fit' }, score: 70 },
  { id: 'd', title: 'Corsair Vengeance 32GB', price_eur: 100, location: 'Augsburg', detailed_description: 'Biete hier ein Kit an, originalverpackt, nie benutzt, da falsch bestellt. Versand gegen Aufpreis möglich.', fit: { verdict: 'fit' }, score: 60 },
  { id: 'f', title: 'Lenovo L14 Gen 1 Ryzen 5', price_eur: 200, location: '81739 München', detailed_description: 'kurz', fit: { verdict: 'fit' }, score: 60 },
  { id: 'g', title: 'Lenovo L14 Gen 1 Ryzen 5', price_eur: 200, location: '81739 München', detailed_description: 'kurz', fit: { verdict: 'fit' }, score: 60 },
  { id: 'e', title: 'Corsair Vengeance 32GB 3200', price_eur: 100, detailed_description: 'Ganz anderer Text eines anderen Verkäufers mit eigenen Worten über sein eigenes Kit und den Zustand.', fit: { verdict: 'fit' }, score: 50 },
];
const out = foldSameOffers(rows);
// The bike: one row, the better-scored copy, the other under `also`.
const bike = out.find(l => l.id === 'b');
assert.ok(bike && !out.find(l => l.id === 'a'));
assert.deepStrictEqual(bike.also.map(x => x.id), ['a']);
// The same title from the same place is one dealer's stock; the same title
// from two towns with two texts is two sellers.
assert.deepStrictEqual(out.map(l => l.id), ['b', 'c', 'd', 'f', 'e']);
assert.deepStrictEqual(out.find(l => l.id === 'f').also.map(x => x.id), ['g']);
assert.strictEqual(out.find(l => l.id === 'c').also, undefined);
console.log('same offer: all assertions passed');
