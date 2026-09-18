import type { Campaign, SearchTarget, Listing } from '../types';
import { formatFreshness, type TranslateFn } from './freshness';
import { formatLocation } from './formatLocation';

/**
 * Capitalizes and cleans a location slug.
 * e.g., "landsberg-am-lech" -> "Landsberg am Lech", "muenchen" -> "München"
 */
export function cleanLocationSlug(slug: string): string {
  if (!slug) return '';
  const lower = slug.toLowerCase().trim();
  if (lower === 'muenchen' || lower === 'munich') return 'München';
  if (lower === 'nuernberg' || lower === 'nuremberg') return 'Nürnberg';
  if (lower === 'koeln' || lower === 'cologne') return 'Köln';
  if (lower === 'landsberg-lech' || lower === 'landsberg-am-lech') return 'Landsberg';

  return slug
    .split('-')
    .map(word => {
      if (['am', 'an', 'der', 'des', 'im', 'in'].includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

/**
 * Extracts location and radius from a Kleinanzeigen search URL.
 */
export function parseSearchUrlLocationAndRadius(urlStr: string): { location: string | null; radius: number | null } {
  try {
    const url = new URL(urlStr);
    const path = url.pathname;

    // Tail radius extraction: e.g., ...k0l6411r30 -> radius = 30
    const lastSeg = path.split('/').filter(Boolean).pop() || '';
    const radiusMatch = lastSeg.match(/r(\d+)(?:$|\?)/);
    const radius = radiusMatch ? parseInt(radiusMatch[1], 10) : null;

    // Path location extraction: look for /s-<slug>/ or /s-<category>/<slug>/
    const segs = path.split('/').filter(Boolean);
    let locationSlug: string | null = null;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.startsWith('s-')) {
        const withoutPrefix = seg.slice(2);
        // If it's a known category root like 'notebooks', check the next segment
        if (['notebooks', 'elektronik', 'haus-garten', 'kleidung', 'dienstleistungen'].includes(withoutPrefix)) {
          if (i + 1 < segs.length && !segs[i + 1].includes(':') && !segs[i + 1].startsWith('k0')) {
            locationSlug = segs[i + 1];
            break;
          }
        } else if (!withoutPrefix.includes(':') && !withoutPrefix.startsWith('k0')) {
          locationSlug = withoutPrefix;
          break;
        }
      }
    }

    const location = locationSlug ? cleanLocationSlug(locationSlug) : null;
    return { location, radius };
  } catch {
    return { location: null, radius: null };
  }
}

function resolveCorridorSubtitle(searches: SearchTarget[], t: TranslateFn): string {
  for (const s of searches) {
    if (!s.name) continue;
    const match = s.name.match(/([^:]+?)\s*(?:→|->)\s*([^·:]+)/);
    if (match) {
      const from = cleanLocationSlug(formatLocation(match[1].trim()));
      const to = cleanLocationSlug(formatLocation(match[2].trim()));
      if (from && to) {
        return t('surface.corridorRoute', { from, to });
      }
    }
  }
  return t('surface.corridor');
}

function resolveRadiusSubtitle(searches: SearchTarget[], listings: Listing[], t: TranslateFn): string | null {
  for (const s of searches) {
    if (s.url) {
      const { location, radius } = parseSearchUrlLocationAndRadius(s.url);
      if (location && radius) return t('surface.radiusAround', { radius, location });
      if (location) return location;
      if (radius) return t('surface.kmDistance', { km: radius });
    }
    if (s.name && !s.name.includes('http') && !s.name.includes('Guidelines')) {
      const cleaned = cleanLocationSlug(formatLocation(s.name));
      if (cleaned) return cleaned;
    }
  }

  for (const l of listings) {
    if (l.location) {
      const cleaned = cleanLocationSlug(formatLocation(l.location));
      if (cleaned) return cleaned;
    }
  }

  return null;
}

/**
 * Generates the location/corridor subtitle for a campaign search row.
 * e.g., "30 km um Landsberg" or "Korridor Landsberg→Konstanz"
 */
export function getSearchLocationSubtitle(
  campaign: Campaign,
  searches: SearchTarget[],
  listings: Listing[],
  t: TranslateFn
): string | null {
  if (campaign.route_id) {
    return resolveCorridorSubtitle(searches, t);
  }
  return resolveRadiusSubtitle(searches, listings, t);
}

/**
 * Generates the freshness subtitle for a campaign search row.
 * e.g., "vor 2 Std", "gestern", "heute"
 */
export function getSearchFreshnessSubtitle(
  listings: Listing[],
  t: TranslateFn
): string | null {
  if (!listings || listings.length === 0) return null;

  let maxTime: string | null = null;
  let maxMs = 0;

  for (const l of listings) {
    const ts = l.first_seen_at || l.last_description_changed_at || l.llm_processed_time;
    if (ts) {
      const d = new Date(ts);
      const timeMs = d.getTime();
      if (!isNaN(timeMs) && timeMs > maxMs) {
        maxMs = timeMs;
        maxTime = ts;
      }
    }
  }

  if (maxTime) {
    const freshness = formatFreshness(maxTime, t);
    return freshness?.label ?? null;
  }

  return null;
}
