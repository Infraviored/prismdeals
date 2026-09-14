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
    if preceding.startswith("s-") or (":" in preceding):
        segments.insert(-1, slug)
    else:
        segments[-2] = slug

    new_path = "/".join(segments)
    return urllib.parse.urlunsplit(split._replace(path=new_path))
