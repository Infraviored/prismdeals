/**
 * One offer listed more than once -- a seller who posts the same bike twice,
 * a dealer with eight of one laptop -- is one row. Two offers are the same
 * when they ask the same price and say the same thing: the same title from
 * the same place, or mostly the same description. Two sellers of the same kit
 * at the same price -- "Corsair Vengeance 32GB", 100 € -- write their own
 * texts from their own towns and stay two.
 */

const SHARE = 0.6; // of the shorter description's word triples in common
const MIN_WORDS = 12; // fewer words than this say too little to compare

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
function words(text) {
  return String(text ?? '').toLowerCase().replace(/[äöüß]/g, c => UMLAUTS[c]).split(/[^a-z0-9]+/).filter(Boolean);
}

function triples(text) {
  const w = words(text);
  if (w.length < MIN_WORDS) return null;
  const out = new Set();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

function sameText(a, b) {
  if (!a || !b) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const t of small) if (large.has(t)) shared += 1;
  return shared >= SHARE * small.size;
}

const RANK = { fit: 0, unclear: 1, no: 2 };
function better(a, b) {
  const va = RANK[a.fit?.verdict] ?? 3;
  const vb = RANK[b.fit?.verdict] ?? 3;
  if (va !== vb) return va - vb;
  return (b.score ?? -1) - (a.score ?? -1);
}

/** The listings with every repeat folded into its best copy, which lists the
 * others under `also` ({id, url, location, price_eur}). Order is kept. */
function foldSameOffers(listings) {
  const byPrice = new Map();
  for (const l of listings) {
    if (typeof l.price_eur !== 'number') continue;
    if (!byPrice.has(l.price_eur)) byPrice.set(l.price_eur, []);
    byPrice.get(l.price_eur).push(l);
  }
  const groupOf = new Map();
  for (const group of byPrice.values()) {
    if (group.length < 2) continue;
    const text = new Map(group.map(l => [l.id, triples(l.detailed_description || l.description)]));
    const title = new Map(group.map(l => [l.id, words(l.title).join(' ')]));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const sameTitle = title.get(a.id) && title.get(a.id) === title.get(b.id) && a.location && a.location === b.location;
        if (!sameTitle && !sameText(text.get(a.id), text.get(b.id))) continue;
        const ga = groupOf.get(a.id) || [a];
        const gb = groupOf.get(b.id) || [b];
        if (ga === gb) continue;
        const merged = [...ga, ...gb];
        for (const l of merged) groupOf.set(l.id, merged);
      }
    }
  }
  const kept = new Set();
  for (const members of new Set(groupOf.values())) {
    const [best, ...rest] = [...members].sort(better);
    best.also = rest.map(l => ({ id: l.id, url: l.url, location: l.location, price_eur: l.price_eur }));
    kept.add(best.id);
  }
  return listings.filter(l => !groupOf.has(l.id) || kept.has(l.id));
}

module.exports = { foldSameOffers };
