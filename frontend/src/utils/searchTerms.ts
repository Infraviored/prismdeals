/** Turning what a buyer wants into what to ask Kleinanzeigen for.
 *
 * The two pull in opposite directions. The wish is narrow -- 2x16 GB, DDR4,
 * 3200 MHz, CL16 -- and the requirements judge it. The search has to be broad,
 * because a listing it misses is never seen again, while one too many costs a
 * line in the free sieve. Sellers write the brand, the product line and the
 * capacity; they often leave out clock, latency and how the kit is split.
 *
 * Measured on the Corsair hunt: "corsair vengeance 32gb" found 50 listings, 7
 * of them matching. The full wish as a search term would have found almost
 * none. See docs/product-core.md, section 4.
 */

const DROP: RegExp[] = [
  /\([^)]*\)/g, // "(2x16)" and other parentheticals
  /\b\d+\s*x\s*\d+\s*(gb|tb)?\b/g, // module split: 2x16, 2 x 16 GB
  /\bddr\d(-\d{3,5})?\b/g, // memory generation and speed: DDR4, DDR4-3200
  /\b\d{3,5}\s*mhz\b/g, // clock
  /\bcl\s*\d{1,2}\b/g, // CAS latency
];

/** A broad search term from a narrow wish. */
export function broadenQuery(wish: string): string {
  let text = wish.toLowerCase();
  for (const pattern of DROP) text = text.replace(pattern, ' ');
  return text
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/**
 * A search term without a trailing generation or frame code:
 * "yamaha-r1-rn19" -> "yamaha-r1", "BMW 3er E90" -> "BMW 3er".
 *
 * Sellers write "R1", rarely "R1 RN19": measured, "yamaha r1 rn19" finds 0
 * offers and "yamaha r1" 115. The code belongs in the requirements (judged
 * from the listing), not in the search (which would never see those offers).
 * Needs at least two words before the code, so "Golf 7" or "S7" stay whole.
 */
export function withoutGeneration(term: string): string {
  const parts = term.trim().split(/([\s-]+)/);
  const words = parts.filter((_, i) => i % 2 === 0);
  // As scraper/generation.py decides: the last word is a generation only when
  // the words before it still name a model with a number ("R1 RN19"); in
  // "YZF R1" and "ThinkPad T480" it is the model itself.
  const designation = /[A-Za-z]+\d|\d+[A-Za-z]|\d{2,}/;
  if (
    words.length >= 3 &&
    /^[A-Za-z]{1,3}\d{1,3}$/.test(words[words.length - 1]) &&
    words.slice(0, -1).some((w) => designation.test(w))
  ) {
    return parts.slice(0, -2).join('');
  }
  return term.trim();
}
