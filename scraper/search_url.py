"""URL grammar and manipulation for Kleinanzeigen search URLs.

A Kleinanzeigen search URL encodes its parameters across two distinct path zones:
    /s-<ort-slug>/[preis:a:b/]<suchbegriff-slug>/k0[c<kategorie>]l<ort>r<radius>
     └─ decoration ┘└─ filter ─┘└─ search query ──┘└─── tail (query parameters) ──┘

Measured against the 16 production searches in scraper.db and verified live on
2026-09-14:
1. The tail segment `k...c...l...r...` controls category, location, and radius.
   Rewriting the tail re-aims a search geographically (corridors) without touching
   the query or filters.
2. The path segment immediately preceding the tail carries the search query.
   Rewriting this segment retargets a search to a different product or model
   (search families) without touching the location or filters.
3. If the segment before the tail begins with 's-' (location/category root) or
   contains ':' (a filter facet like 'preis:10:100' or 'anbieter:privat'), no search
   query exists in the URL yet; setting a query inserts the slug directly before
   the tail.

Extracting this grammar into one module lets corridor route planning and search
family expansion share a single source of truth.
"""

import re
import urllib.parse

# k<keyword flag> c<category> l<location> r<radius>, any of the last three absent.
TAIL_RE = re.compile(r"(k\d+)(c\d+)?(l\d+)?(r\d+)?$")
PRICE_RE = re.compile(r"^preis:(\d*(?:\.\d+)?)?:(\d*(?:\.\d+)?)?$")


def parse_tail(url):
    """Returns the (keyword, category, location, radius) parts, or None.

    A URL whose final segment does not carry this grammar is not a search we can
    re-aim or expand, and saying so is better than emitting a plausible URL that
    quietly searches the wrong place.
    """
    path = urllib.parse.urlsplit(url).path.rstrip("/")
    last = path.rsplit("/", 1)[-1]
    match = TAIL_RE.fullmatch(last)
    if not match:
        return None
    keyword, category, location, radius = match.groups()
    return {
        "keyword": keyword,
        "category": category,
        "location": location,
        "radius": int(radius[1:]) if radius else None,
    }


def with_location(url, location_id, radius_km):
    """Re-aims a search URL at another location and radius.

    Everything before the final segment is left byte-for-byte alone.
    """
    parts = parse_tail(url)
    if parts is None:
        raise ValueError(
            f"Not a re-aimable search URL: {url!r} — its last path segment must "
            f"look like k0c278l6411r25"
        )

    location = str(location_id)
    if not location.startswith("l"):
        location = "l" + location.lstrip("_")

    radius = max(1, int(round(radius_km)))
    tail = f"{parts['keyword']}{parts['category'] or ''}{location}r{radius}"

    split = urllib.parse.urlsplit(url)
    path = split.path.rstrip("/")
    new_path = path.rsplit("/", 1)[0] + "/" + tail
    return urllib.parse.urlunsplit(split._replace(path=new_path))


def slugify(term):
    """Normalises a model name or query string into a Kleinanzeigen URL slug.

    Measured on live Kleinanzeigen search paths: terms are lowercased, spaces and
    punctuation collapse to single hyphens, and leading/trailing hyphens are stripped.
    German umlauts transcribe as ae, oe, ue, ss to match platform conventions.
    """
    if not term:
        return ""
    s = str(term).strip().lower()
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def with_query(url, term):
    """Rewrites or inserts the search query segment of a Kleinanzeigen search URL.

    If the segment preceding the tail begins with 's-' or contains ':', there is
    no existing query; the slug is inserted directly before the tail.
    Otherwise, the existing query segment is replaced.
    """
    parts = parse_tail(url)
    if parts is None:
        raise ValueError(
            f"Not a rewriteable search URL: {url!r} — its last path segment must "
            f"look like k0c278l6411r25"
        )

    slug = slugify(term)
    if not slug:
        raise ValueError(f"Cannot set an empty search term: {term!r}")

    split = urllib.parse.urlsplit(url)
    path = split.path.rstrip("/")
    segments = path.split("/")

    if len(segments) < 2:
        raise ValueError(f"URL path too short to rewrite: {url!r}")

    preceding = segments[-2]
    # A term is inserted before the tail if the preceding segment is a filter (contains ':')
    # or is the root location/category slug (the first path segment, which starts with 's-').
    # Any subsequent segment, even if starting with 's-' (e.g. 's-pen', 's-line'), is an
    # existing query term and must be replaced.
    is_root_slug = (
        len(segments) >= 2 and preceding == segments[1] and preceding.startswith("s-")
    )
    if is_root_slug or (":" in preceding):
        segments.insert(-1, slug)
    else:
        segments[-2] = slug

    new_path = "/".join(segments)
    return urllib.parse.urlunsplit(split._replace(path=new_path))


def parse_price(url):
    """Returns the parsed price filter {'min': int|None, 'max': int|None}, or None if absent."""
    split = urllib.parse.urlsplit(url)
    segments = [s for s in split.path.rstrip("/").split("/") if s]
    for seg in segments:
        m = PRICE_RE.match(seg)
        if m:
            min_str, max_str = m.groups()
            min_val = int(round(float(min_str))) if min_str else None
            max_val = int(round(float(max_str))) if max_str else None
            return {"min": min_val, "max": max_val}
    return None


def with_price(url, min_price=None, max_price=None):
    """Inserts, updates, or removes the preis:a:b filter in a Kleinanzeigen search URL."""
    parts = parse_tail(url)
    if parts is None:
        raise ValueError(
            f"Not a rewriteable search URL: {url!r} — its last path segment must "
            f"look like k0c278l6411r25"
        )

    split = urllib.parse.urlsplit(url)
    segments = split.path.rstrip("/").split("/")
    if len(segments) < 2:
        raise ValueError(f"URL path too short to rewrite: {url!r}")

    # Normalise prices
    p_min = (
        int(round(float(min_price)))
        if min_price is not None and str(min_price).strip() != ""
        else None
    )
    p_max = (
        int(round(float(max_price)))
        if max_price is not None and str(max_price).strip() != ""
        else None
    )

    # Locate any existing preis: segment
    price_idx = None
    for idx, seg in enumerate(segments):
        if PRICE_RE.match(seg):
            price_idx = idx
            break

    if p_min is None and p_max is None:
        if price_idx is not None:
            del segments[price_idx]
    else:
        s_min = str(p_min) if p_min is not None else ""
        s_max = str(p_max) if p_max is not None else ""
        price_segment = f"preis:{s_min}:{s_max}"
        if price_idx is not None:
            segments[price_idx] = price_segment
        else:
            # Insert right after root slug if present, otherwise before tail
            insert_idx = min(2, max(1, len(segments) - 1))
            segments.insert(insert_idx, price_segment)

    new_path = "/".join(segments)
    return urllib.parse.urlunsplit(split._replace(path=new_path))


def decompose_search_url(url):
    """Decomposes a Kleinanzeigen search URL into its four constituent fields.

    Returns dict with location_slug, location_id, radius, min_price, max_price,
    query, and category.
    """
    parts = parse_tail(url)
    if not parts:
        return None

    split = urllib.parse.urlsplit(url)
    segments = [s for s in split.path.rstrip("/").split("/") if s]
    if not segments:
        return None

    root_seg = segments[0]
    location_slug = root_seg[2:] if root_seg.startswith("s-") else root_seg

    price = parse_price(url)

    # Identify query segment (if any): segment that is not root, not a facet (':'), and not tail
    query = None
    tail_seg = segments[-1]
    for seg in segments[1:-1]:
        if ":" not in seg and seg != tail_seg:
            query = seg

    loc_id = parts["location"].lstrip("l") if parts.get("location") else None
    cat_id = parts["category"].lstrip("c") if parts.get("category") else None

    return {
        "location_slug": location_slug,
        "location_id": loc_id,
        "radius": parts.get("radius"),
        "min_price": price["min"] if price else None,
        "max_price": price["max"] if price else None,
        "query": query,
        "category": cat_id,
    }


def compose_search_url(
    location_slug,
    location_id,
    radius=None,
    min_price=None,
    max_price=None,
    query=None,
    category=None,
    origin="https://www.kleinanzeigen.de",
):
    """Constructs a canonical Kleinanzeigen search URL from the four composer fields."""
    clean_slug = slugify(location_slug) if location_slug else "suchanfrage"
    root = clean_slug if clean_slug.startswith("s-") else f"s-{clean_slug}"
    segments = ["", root]

    p_min = (
        int(round(float(min_price)))
        if min_price is not None and str(min_price).strip() != ""
        else None
    )
    p_max = (
        int(round(float(max_price)))
        if max_price is not None and str(max_price).strip() != ""
        else None
    )
    if p_min is not None or p_max is not None:
        s_min = str(p_min) if p_min is not None else ""
        s_max = str(p_max) if p_max is not None else ""
        segments.append(f"preis:{s_min}:{s_max}")

    if query:
        q_slug = slugify(query)
        if q_slug:
            segments.append(q_slug)

    kw = "k0"
    cat = f"c{category}" if category else ""
    loc = f"l{str(location_id).lstrip('l')}" if location_id else ""
    rad = (
        f"r{int(round(float(radius)))}"
        if radius is not None and str(radius).strip() != ""
        else ""
    )
    tail = f"{kw}{cat}{loc}{rad}"
    segments.append(tail)

    path = "/".join(segments)
    return f"{origin.rstrip('/')}{path}"
