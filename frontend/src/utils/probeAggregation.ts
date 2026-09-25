import type { MarketPicture, ProbeRung, BudgetStep, RelaxSignal } from '../types';

/**
 * Pure function to re-aggregate market picture when a requirement is relaxed (Plan §6).
 * No new network requests are made.
 *
 * Updates estimate.union_likely, scales per_budget steps proportionally,
 * and removes the relaxed constraint from the relax suggestions.
 */
export function applyRelaxToMarketPicture(
  picture: MarketPicture,
  relaxedMustIdOrLabel: string
): MarketPicture {
  if (!picture || !picture.relax || picture.relax.length === 0) {
    return picture;
  }

  const relaxItem = picture.relax.find(
    (r) => r.must === relaxedMustIdOrLabel || r.label === relaxedMustIdOrLabel
  );

  if (!relaxItem) {
    return picture;
  }

  const oldUnionLikely = picture.estimate.union_likely;
  const newUnionLikely = Math.max(0, relaxItem.likely_without);
  const factor = oldUnionLikely > 0 ? newUnionLikely / oldUnionLikely : 1;

  const updatedBudget: BudgetStep[] = picture.per_budget.map((b) => ({
    max: b.max,
    likely: Math.min(newUnionLikely, Math.round(b.likely * factor)),
  }));

  const remainingRelax: RelaxSignal[] = picture.relax.filter(
    (r) => r.must !== relaxedMustIdOrLabel && r.label !== relaxedMustIdOrLabel
  );

  return {
    ...picture,
    estimate: {
      ...picture.estimate,
      union_likely: newUnionLikely,
    },
    per_budget: updatedBudget,
    relax: remainingRelax,
  };
}

/**
 * Pure function to determine active likely count under selected budget threshold.
 */
export function getLikelyCountForBudget(
  picture: MarketPicture | null,
  selectedBudgetMax: number | null
): number {
  if (!picture) return 0;
  if (selectedBudgetMax === null || selectedBudgetMax === undefined) {
    return picture.estimate.union_likely;
  }

  // Find exact or closest budget threshold <= selectedBudgetMax
  const matchingStep = picture.per_budget.find((b) => b.max === selectedBudgetMax);
  if (matchingStep) {
    return matchingStep.likely;
  }

  // If between or under steps, locate lowest boundary or interpolate
  const sorted = [...picture.per_budget].sort((a, b) => a.max - b.max);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (selectedBudgetMax >= sorted[i].max) {
      return sorted[i].likely;
    }
  }

  // If below the lowest threshold, scale relative to lowest step
  if (sorted.length > 0 && selectedBudgetMax < sorted[0].max) {
    const ratio = Math.max(0, selectedBudgetMax / sorted[0].max);
    return Math.round(sorted[0].likely * ratio);
  }

  return picture.estimate.union_likely;
}

/**
 * Pure helper to summarize ladder rung execution metrics.
 */
export function calculateRungStats(rungs: ProbeRung[]): {
  totalRungs: number;
  keptRungs: number;
  totalHits: number;
  totalLikely: number;
  totalNewLikely: number;
} {
  let totalHits = 0;
  let totalLikely = 0;
  let totalNewLikely = 0;
  let keptRungs = 0;

  for (const r of rungs) {
    totalHits += r.total || 0;
    totalLikely += r.likely || 0;
    totalNewLikely += r.new_likely || 0;
    if (r.kept) keptRungs++;
  }

  return {
    totalRungs: rungs.length,
    keptRungs,
    totalHits,
    totalLikely,
    totalNewLikely,
  };
}


/**
 * URL filter attributes ("motorraeder_roller.km_i:,30000") as the probe's
 * filter map. The probe searches with the same filters the saved search will
 * carry; without them the market picture showed offers the search then never
 * found (R1 / CBR with first registration from 2010: 2 and 0, not 115 and 56).
 */
export function attributesToFilters(attributes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attribute of attributes) {
    const at = attribute.indexOf(':');
    if (at > 0) out[attribute.slice(0, at)] = attribute.slice(at + 1);
  }
  return out;
}
