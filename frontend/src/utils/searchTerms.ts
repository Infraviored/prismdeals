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
 * none. See docs/produktkern.md, section 6.
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
