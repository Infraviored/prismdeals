/**
 * Utilities for decomposing and composing Kleinanzeigen search URLs.
 *
 * Kleinanzeigen URL structure:
 * https://www.kleinanzeigen.de/s-<ort-slug>/[preis:a:b/][<suchbegriff-slug>/]k0[c<kategorie>]l<ort-id>r<radius>
 */

const TAIL_REGEX = /(?:k0)?(?:c(?<cat>\d+))?(?:l(?<loc>\d+))?(?:r(?<rad>\d+))?$/;
const PRICE_REGEX = /^preis:(\d*(?:\.\d+)?)?:(\d*(?:\.\d+)?)?$/;

export interface DecomposedSearchUrl {
  locationSlug: string | null;
  locationId: string | null;
  radius: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  query: string | null;
  category: string | null;
}

export interface ComposeSearchUrlParams {
  locationSlug?: string | null;
  locationId?: string | number | null;
  radius?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  query?: string | null;
  category?: string | null;
  origin?: string;
}

export function slugify(text: string): string {
  if (!text) return '';
  const folded = String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

  return folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTail(url: string): {
  category: string | null;
  location: string | null;
  radius: number | null;
} | null {
  try {
    const parsed = new URL(url, 'https://www.kleinanzeigen.de');
    if (!parsed.hostname.includes('kleinanzeigen')) return null;

    const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments.length === 0) return null;

    const tailSeg = segments[segments.length - 1];
    if (!tailSeg.includes('k0') && !tailSeg.includes('l') && !tailSeg.includes('r') && !tailSeg.includes('c')) {
      return null;
    }

    const match = TAIL_REGEX.exec(tailSeg);
    if (!match || !match.groups) return null;

    const { cat, loc, rad } = match.groups;
    if (!cat && !loc && !rad && !tailSeg.startsWith('k0')) {
      return null;
    }

    return {
      category: cat || null,
      location: loc ? `l${loc}` : null,
      radius: rad ? parseInt(rad, 10) : null,
    };
  } catch {
    return null;
  }
}

export function parsePrice(url: string): { min: number | null; max: number | null } | null {
  try {
    const parsed = new URL(url, 'https://www.kleinanzeigen.de');
    const segments = parsed.pathname.split('/').filter(Boolean);

    for (const seg of segments) {
      const match = PRICE_REGEX.exec(seg);
      if (match) {
        const minStr = match[1];
        const maxStr = match[2];
        return {
          min: minStr && minStr.length > 0 ? Math.round(Number(minStr)) : null,
          max: maxStr && maxStr.length > 0 ? Math.round(Number(maxStr)) : null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function decomposeSearchUrl(url: string): DecomposedSearchUrl | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url, 'https://www.kleinanzeigen.de');
    const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments.length === 0) return null;

    const tailInfo = parseTail(url);
    if (!tailInfo) return null;

    const rootSeg = segments[0];
    const locationSlug = rootSeg.startsWith('s-') ? rootSeg.slice(2) : rootSeg;

    const price = parsePrice(url);

    let query: string | null = null;
    const tailSeg = segments[segments.length - 1];
    for (let i = 1; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!seg.includes(':') && seg !== tailSeg) {
        query = seg;
        break;
      }
    }

    const locId = tailInfo.location ? tailInfo.location.replace(/^l/, '') : null;

    return {
      locationSlug: locationSlug || null,
      locationId: locId || null,
      radius: tailInfo.radius,
      minPrice: price ? price.min : null,
      maxPrice: price ? price.max : null,
      query,
      category: tailInfo.category,
    };
  } catch {
    return null;
  }
}

function formatPriceSegment(minPrice?: number | null, maxPrice?: number | null): string | null {
  const pMin = minPrice !== null && minPrice !== undefined && !isNaN(Number(minPrice)) ? Math.round(Number(minPrice)) : null;
  const pMax = maxPrice !== null && maxPrice !== undefined && !isNaN(Number(maxPrice)) ? Math.round(Number(maxPrice)) : null;
  if (pMin === null && pMax === null) return null;
  return `preis:${pMin !== null ? pMin : ''}:${pMax !== null ? pMax : ''}`;
}

function formatTailSegment(category?: string | null, locationId?: string | number | null, radius?: number | null): string {
  const cat = category ? `c${category}` : '';
  const loc = locationId ? `l${String(locationId).replace(/^l/, '')}` : '';
  const rad = radius !== null && radius !== undefined && Number(radius) > 0 ? `r${Math.round(Number(radius))}` : '';
  return `k0${cat}${loc}${rad}`;
}

export function composeSearchUrl({
  locationSlug,
  locationId,
  radius,
  minPrice,
  maxPrice,
  query,
  category,
  origin = 'https://www.kleinanzeigen.de',
}: ComposeSearchUrlParams): string {
  const cleanSlug = locationSlug ? slugify(locationSlug) : 'suchanfrage';
  const root = cleanSlug.startsWith('s-') ? cleanSlug : `s-${cleanSlug}`;
  const segments: string[] = ['', root];

  const priceSeg = formatPriceSegment(minPrice, maxPrice);
  if (priceSeg) segments.push(priceSeg);

  if (query) {
    const qSlug = slugify(query);
    if (qSlug) segments.push(qSlug);
  }

  segments.push(formatTailSegment(category, locationId, radius));
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}${segments.join('/')}`;
}
