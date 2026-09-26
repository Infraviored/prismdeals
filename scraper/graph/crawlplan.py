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
        }
        for sid, url, last, hunts in rows
    ]
    return sorted(units, key=lambda u: -u["demand"])
