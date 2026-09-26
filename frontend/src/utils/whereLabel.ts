import type { HuntSummary } from '../types/hunt';
import type { TranslateFn } from './freshness';

/** "200 km um Vilgertshofen", "München → Konstanz", or nothing when it searches everywhere. */
export function whereLabel(hunt: HuntSummary, t: TranslateFn): string | null {
  if (hunt.route) return `${hunt.route.origin} → ${hunt.route.destination}`;
  const { place, radius_km } = hunt.frame;
  if (!place) return t('surface.editEverywhere');
  return radius_km ? t('surface.editRadius', { km: radius_km, place }) : place;
}
