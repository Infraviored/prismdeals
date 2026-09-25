/** The seller's title without what the spec line under it already says.
 *
 * "Corsair Vengeance LPX 32 GB DDR4-3200 CL16 – 2×16 GB" above a line reading
 * "2×16 GB  DDR4-3200  CL16" says everything twice and is cut off anyway.
 * What is left -- "Corsair Vengeance LPX" -- is what tells the rows apart.
 * Only used where a spec line is shown; the full title stays in the sheet.
 */
const NOISE: RegExp[] = [
  /\([^)]*\)/g, // "(2x16GB)", seller codes "(A2#)"
  /\b\d+\s*[x×]\s*\d+\s*(gb|tb)?\b/gi, // 2x16, 2×16 GB
  /\b\d+\s*(gb|tb)\b/gi, // 32 GB
  /\bddr\s?\d(-\d{3,5})?\b/gi, // DDR4, DDR 4, DDR4-3200
  /\b\d{3,5}\s*mhz\b/gi,
  /\bcl\s?\d{1,2}\b/gi,
  /\b(ram|arbeitsspeicher|speicherkit|speicher|kit|dimm|sodimm)\b/gi,
  /[®™]/g,
];

/** "CORSAIR VENGEANCE" reads as shouting in a list of calm titles. */
function tameCaps(text: string): string {
  const letters = text.replace(/[^A-Za-zÄÖÜäöü]/g, '');
  if (letters.length < 6 || letters !== letters.toUpperCase()) return text;
  // Short tokens stay as they are: LPX, RGB and DDR are names, not shouting.
  return text.replace(/\p{L}{4,}/gu, (w) => w[0] + w.slice(1).toLowerCase());
}

export function shortTitle(title: string): string {
  let text = title;
  for (const pattern of NOISE) text = text.replace(pattern, ' ');
  return tameCaps(text)
    .replace(/\s[-–|,/]+\s/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–|,/]+|[\s\-–|,/]+$/g, '')
    .trim();
}
