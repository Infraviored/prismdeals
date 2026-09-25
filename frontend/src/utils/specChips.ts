/**
 * Shared RAM / hardware specification chips extraction and guarding.
 * Guarantees that empty, undefined, or foreign-category fact attributes
 * never produce broken badges like "UNDEFINED" or "NaN×NaN GB".
 */

function formatSticks(facts?: Record<string, unknown> | null): string | null {
  const stickCount = Number(facts?.stickCount);
  const gbPerStick = Number(facts?.gbPerStick);
  if (!isNaN(stickCount) && stickCount > 0 && !isNaN(gbPerStick) && gbPerStick > 0) {
    return `${stickCount}×${gbPerStick} GB`;
  }
  return null;
}

function formatGeneration(facts?: Record<string, unknown> | null): string | null {
  const genRaw = facts?.generation != null ? String(facts.generation).trim() : '';
  if (!genRaw || genRaw.toLowerCase() === 'undefined' || genRaw.toLowerCase() === 'null') {
    return null;
  }
  const speedRaw = facts?.speedMhz != null ? String(facts.speedMhz).trim() : '';
  const hasSpeed = speedRaw && speedRaw.toLowerCase() !== 'undefined' && speedRaw.toLowerCase() !== 'null';
  return genRaw.toUpperCase() + (hasSpeed ? `-${speedRaw}` : '');
}

function formatCasLatency(facts?: Record<string, unknown> | null): string | null {
  const cl = Number(facts?.casLatency);
  return !isNaN(cl) && cl > 0 ? `CL${cl}` : null;
}

function formatFormFactor(facts?: Record<string, unknown> | null): string | null {
  const ffRaw = facts?.formFactor != null ? String(facts.formFactor).trim() : '';
  if (!ffRaw || ffRaw.toLowerCase() === 'undefined' || ffRaw.toLowerCase() === 'null') {
    return null;
  }
  return ffRaw.toUpperCase();
}

export function getSpecChips(facts?: Record<string, unknown> | null): string[] {
  if (!facts || typeof facts !== 'object') return [];

  const chips: string[] = [];
  const sticks = formatSticks(facts);
  if (sticks) chips.push(sticks);

  const gen = formatGeneration(facts);
  if (gen) chips.push(gen);

  const cl = formatCasLatency(facts);
  if (cl) chips.push(cl);

  const ff = formatFormFactor(facts);
  if (ff) chips.push(ff);

  return chips;
}

/**
 * The page's own attributes that decide a vehicle: first registration year,
 * mileage, power. The buyer filters on them ("ab 2005, bis 30 000 km"), so the
 * row shows them -- a list of motorcycles with only price and town made every
 * offer look alike.
 */
export function getDetailChips(details?: Record<string, unknown> | null): string[] {
  if (!details || typeof details !== 'object') return [];
  const chips: string[] = [];
  const reg = String(details['Erstzulassung'] ?? '').match(/(19|20)\d{2}/);
  if (reg) chips.push(`EZ ${reg[0]}`);
  const km = String(details['Kilometerstand'] ?? '').trim();
  if (km) chips.push(km);
  const power = String(details['Leistung'] ?? '').trim();
  if (power) chips.push(power);
  return chips;
}
