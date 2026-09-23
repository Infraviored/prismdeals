/**
 * Utilities for decomposing and composing Kleinanzeigen search URLs.
 *
 * Kleinanzeigen URL structure:
 * https://www.kleinanzeigen.de/s-<ort-slug>/[preis:a:b/][<suchbegriff-slug>/]k0[c<kategorie>]l<ort-id>r<radius>
 */

// Category attribute filters hang off the END of the tail, after location and
// radius, joined by '+'. Put them before the location and kleinanzeigen.de
// redirects and drops the location: a Munich search silently becomes a
// nationwide one. Mirrors TAIL_RE in scraper/search_url.py.
const TAIL_REGEX = /^(?:k\d+)(?:c(?<cat>\d+))?(?:l(?<loc>\d+))?(?:r(?<rad>\d+))?(?<attrs>(?:\+[\w.]+:[^+/]+)*)$/;
const PRICE_REGEX = /^preis:(\d*(?:\.\d+)?)?:(\d*(?:\.\d+)?)?$/;

export interface DecomposedSearchUrl {
  locationSlug: string | null;
  locationId: string | null;
  radius: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  query: string | null;
  category: string | null;
  categorySlug: string | null;
  attributes: string[];
}

export interface ComposeSearchUrlParams {
  locationSlug?: string | null;
  locationId?: string | number | null;
  radius?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  query?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  attributes?: string[] | null;
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
  attributes: string[];
} | null {
  try {
    const parsed = new URL(url, 'https://www.kleinanzeigen.de');
    if (!parsed.hostname.includes('kleinanzeigen')) return null;

    const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments.length === 0) return null;

    const tailSeg = segments[segments.length - 1];
    const match = TAIL_REGEX.exec(tailSeg);
    if (!match || !match.groups) return null;

    const { cat, loc, rad, attrs } = match.groups;
    return {
      category: cat || null,
      location: loc ? `l${loc}` : null,
      radius: rad ? parseInt(rad, 10) : null,
      // Kept as written: the site reads a repeated key as "either of these",
      // so order and repetition are part of the search.
      attributes: (attrs || '').split('+').filter(Boolean),
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

    const locId = tailInfo.location ? tailInfo.location.replace(/^l/, '') : null;
    const rootSeg = segments[0];
    const rootWithoutPrefix = rootSeg.startsWith('s-') ? rootSeg.slice(2) : rootSeg;

    const price = parsePrice(url);

    let query: string | null = null;
    const tailSeg = segments[segments.length - 1];
    for (let i = 1; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!seg.includes(':') && seg !== tailSeg) {
        query = seg;
      }
    }

    let locationSlug: string | null = null;
    let categorySlug: string | null = null;

    if (locId) {
      // True location search: root is location slug
      locationSlug = rootWithoutPrefix === 'suchanfrage' ? null : rootWithoutPrefix;
    } else {
      // No location in tail: root segment is either a category slug or query
      if (tailInfo.category) {
        categorySlug = rootWithoutPrefix;
      } else if (!query && rootWithoutPrefix !== 'suchanfrage' && !rootSeg.includes(':')) {
        query = rootWithoutPrefix;
      }
    }

    return {
      locationSlug: locationSlug || null,
      locationId: locId || null,
      radius: locId ? tailInfo.radius : null,
      minPrice: price ? price.min : null,
      maxPrice: price ? price.max : null,
      query,
      category: tailInfo.category,
      categorySlug: categorySlug || null,
      attributes: tailInfo.attributes,
    };
  } catch {
    return null;
  }
}

function formatPriceSegment(minPrice?: number | null, maxPrice?: number | null): string | null {
  const pMin = minPrice !== null && minPrice !== undefined && !isNaN(Number(minPrice)) ? Math.round(Number(minPrice)) : null;
  const pMax = maxPrice !== null && maxPrice !== undefined && !isNaN(Number(maxPrice)) ? Math.round(Number(maxPrice)) : null;
  if (pMin === null && pMax === null) return null;
  if (pMin !== null && pMax !== null && pMin > pMax) return null;
  return `preis:${pMin !== null ? pMin : ''}:${pMax !== null ? pMax : ''}`;
}

function formatTailSegment(
  category?: string | null,
  locationId?: string | number | null,
  radius?: number | null,
  attributes?: string[] | null
): string {
  const cat = category ? `c${category}` : '';
  const loc = locationId ? `l${String(locationId).replace(/^l/, '')}` : '';
  const rad = radius !== null && radius !== undefined && Number(radius) > 0 ? `r${Math.round(Number(radius))}` : '';
  const attrs = (attributes || []).filter(Boolean).map(a => `+${a}`).join('');
  return `k0${cat}${loc}${rad}${attrs}`;
}

export function composeSearchUrl({
  locationSlug,
  locationId,
  radius,
  minPrice,
  maxPrice,
  query,
  category,
  categorySlug,
  attributes,
  origin = 'https://www.kleinanzeigen.de',
}: ComposeSearchUrlParams): string {
  const cleanLoc = locationSlug ? slugify(locationSlug) : null;
  const cleanQ = query ? slugify(query) : null;
  const cleanCat = categorySlug ? slugify(categorySlug) : null;

  const hasLocation = Boolean(locationId || (cleanLoc && cleanLoc !== 'suchanfrage'));

  let root: string;
  let queryInPath: string | null;

  if (hasLocation && cleanLoc) {
    root = cleanLoc.startsWith('s-') ? cleanLoc : `s-${cleanLoc}`;
    queryInPath = cleanQ;
  } else if (cleanCat) {
    root = cleanCat.startsWith('s-') ? cleanCat : `s-${cleanCat}`;
    queryInPath = cleanQ;
  } else if (cleanQ) {
    root = cleanQ.startsWith('s-') ? cleanQ : `s-${cleanQ}`;
    queryInPath = null;
  } else {
    root = 's-suchanfrage';
    queryInPath = null;
  }

  const segments: string[] = ['', root];

  const priceSeg = formatPriceSegment(minPrice, maxPrice);
  if (priceSeg) segments.push(priceSeg);

  if (queryInPath) {
    segments.push(queryInPath);
  }

  segments.push(formatTailSegment(category, hasLocation ? locationId : null, hasLocation ? radius : null, attributes));
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}${segments.join('/')}`;
}
