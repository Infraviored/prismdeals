"""The crawl as one plan (plan §7): which searches to fetch, in which order.

A search is a crawl unit a hunt's targets and frame derived (graph/hunts.py);
one unit serves every hunt that owns it, since a search URL is one row. The
order is demand: how many hunts want the unit, times how long it has not been
fetched -- a unit never fetched comes first. Units no hunt wants anymore are
not fetched at all.
"""

import datetime

# A unit never fetched counts as this many hours stale.
NEVER = 10_000.0
# Result pages per search: the default, and the most a search gets when its
# results are mostly accessories or requests ("PlayStation 5" is controllers).
BASE_PAGES = 2
MAX_PAGES = 6


def pages(conn, search_id):
    """As many pages as it takes to find what the default would find if every
    result were an offer of the thing: 2 at full yield, up to 6."""
    total, off = conn.execute(
        """SELECT COUNT(*), SUM(r.method = 'rejected' OR f.value_json = 'true')
             FROM listing_search_hits h
             LEFT JOIN listing_resolution r ON r.listing_id = h.listing_id
             LEFT JOIN listing_facts f ON f.listing_id = h.listing_id AND f.attr_id = 'is_request'
            WHERE h.search_id = ?""",
        (search_id,),
    ).fetchone()
    if not total:
        return BASE_PAGES
    useful = max(1, total - (off or 0))
    return min(MAX_PAGES, max(BASE_PAGES, round(BASE_PAGES * total / useful)))


def _hours_since(stamp, now):
    if not stamp:
        return NEVER
    try:
        then = datetime.datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return NEVER
    if then.tzinfo is None:
        then = then.replace(tzinfo=datetime.timezone.utc)
    return max(0.0, (now - then).total_seconds() / 3600)


def plan(conn, campaign_id=None, now=None):
    """[{search_id, url, demand, hunts}] in fetch order."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    rows = conn.execute(
        f"""SELECT s.id, s.url, s.last_scraped_at, COUNT(DISTINCT f.campaign_id) AS hunts
              FROM searches s
              JOIN search_family_searches sfs ON sfs.search_id = s.id AND sfs.active = 1
              JOIN search_families f ON f.id = sfs.family_id AND f.enabled = 1
             WHERE s.enabled = 1
               AND EXISTS (SELECT 1 FROM hunt_targets t WHERE t.campaign_id = f.campaign_id) {"AND f.campaign_id = ?" if campaign_id is not None else ""}
             GROUP BY s.id""",
        (campaign_id,) if campaign_id is not None else (),
    ).fetchall()
    units = [
        {
            "search_id": sid,
            "url": url,
            "hunts": hunts,
            "demand": hunts * _hours_since(last, now),
            "pages": pages(conn, sid),
        }
        for sid, url, last, hunts in rows
    ]
    return sorted(units, key=lambda u: -u["demand"])
