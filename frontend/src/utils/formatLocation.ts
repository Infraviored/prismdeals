const GERMAN_FEDERAL_STATES = new Set([
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
]);

/**
 * Strips the federal state Kleinanzeigen prefixes onto a town name.
 *
 * "Bayern - Landsberg (Lech)" -> "Landsberg (Lech)"
 * Only strips if the part before " - " is one of the 16 German federal states.
 * Place names with hyphens (e.g. "80807 Milbertshofen - Am Hart") are preserved.
 */
export function formatLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  const dashIndex = loc.indexOf(' - ');
  if (dashIndex !== -1) {
    const prefix = loc.slice(0, dashIndex).trim();
    if (GERMAN_FEDERAL_STATES.has(prefix)) {
      return loc.slice(dashIndex + 3).trim();
    }
  }
  return loc;
}
