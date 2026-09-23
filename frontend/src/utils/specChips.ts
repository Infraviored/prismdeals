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
