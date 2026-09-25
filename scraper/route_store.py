"""A hunt's corridor as a row, and where listings sit relative to it.

A corridor is not a new kind of search. It is a hunt's terms run in every circle
covering the route — ordinary searches that family_store registers — and the
rest of the system already knows how to run those. Everything downstream
(scraping, extraction, scoring) keeps working without knowing a route exists.

Two things do need somewhere to live:

- the route itself, so its geometry can be read back without asking the routing
  service again, and so the circles can be traced back to the hunt that
  produced them;
- where each listing sits relative to that route. The detour is a property of
  (listing, route), not of the listing, so it belongs in its own table for the
  same reason fact sheets do: one listing on two routes has two detours, and
  neither is a fact about the listing.
"""

import datetime
import db_schema
import json
import logging

logger = logging.getLogger(__name__)

# The route_searches DDL lives in db/schema.sql, applied by db_schema.
# It was declared here too until the two copies began to drift.

# Why a listing has no detour, which decides whether asking again is worthwhile.
# Without this the three reasons are indistinguishable — all of them store a null
# detour — and a routing service that was briefly down would mark every listing
# of that run as settled forever.
ROUTED = "routed"  # answered
TOO_FAR = "too_far"  # deliberately not routed; distance already decides it
UNPLACEABLE = "unplaceable"  # no coordinates, and none are coming
FAILED = "failed"  # the attempt failed; try again next run

RETRYABLE = (FAILED,)


def ensure_schema(conn):
    """Bring the connection up to db/schema.sql.

    The route tables used to be declared here *and* in backend/server.js, and
    the two had already begun to drift. Both sides now read one file.
    """
    db_schema.apply_schema(conn)


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def insert_route(
    conn,
    plan,
    base_url,
    origin,
    destination,
    name=None,
    campaign_id=None,
    family_id=None,
):
    """Writes the route row alone, without registering any search."""
    ensure_schema(conn)
    cursor = conn.execute(
        "INSERT INTO route_searches (name, campaign_id, base_url, origin, "
        "destination, radius_km, half_width_km, plan_json, created_at, family_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            name or f"{origin} → {destination}",
            campaign_id,
            base_url,
            str(origin),
            str(destination),
            plan.radius_km,
            plan.half_width_km,
            json.dumps(plan.as_dict(), ensure_ascii=False),
            _now(),
            family_id,
        ),
    )
    return cursor.lastrowid


def delete_route(conn, route_search_id):
    """Removes a route with its circles and detours; searches stay, but stop.

    A circle search nothing else owns any more is switched off here:
    recompute_enabled leaves ownerless searches alone (it reads them as made
    by hand), so after a corridor was dropped its circles were crawled forever.
    """
    import family_store

    circle_sids = [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT search_id FROM route_search_circles WHERE route_search_id = ?",
            (route_search_id,),
        ).fetchall()
    ]
    for table, column in (
        ("listing_route_geo", "route_search_id"),
        ("route_search_circles", "route_search_id"),
        ("route_searches", "id"),
    ):
        conn.execute(f"DELETE FROM {table} WHERE {column} = ?", (route_search_id,))
    for sid in circle_sids:
        owned = conn.execute(
            "SELECT 1 FROM search_family_searches WHERE search_id = ? "
            "UNION SELECT 1 FROM route_search_circles WHERE search_id = ? LIMIT 1",
            (sid, sid),
        ).fetchone()
        if not owned:
            conn.execute("UPDATE searches SET enabled = 0 WHERE id = ?", (sid,))
    family_store.recompute_enabled(conn, circle_sids)


def get_plan(conn, route_search_id):
    """The stored plan payload, or None."""
    row = conn.execute(
        "SELECT plan_json FROM route_searches WHERE id = ?", (route_search_id,)
    ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except (ValueError, TypeError):
        logger.warning("Corrupt route plan for %s", route_search_id)
        return None


def route(conn, route_search_id):
    """The stored route, rebuilt well enough to price stretches of itself.

    The per-segment durations are carried through so a detour is measured
    against what the drive actually costs, not against a fresh shortest path
    between the same two anchors.
    """
    import routing

    plan = get_plan(conn, route_search_id)
    if not plan:
        return None

    points = [(lat, lon) for lat, lon in plan.get("polyline", [])]
    if len(points) < 2:
        return None

    return routing.Route(
        polyline=points,
        duration_s=(plan.get("duration_min") or 0) * 60.0,
        distance_m=(plan.get("distance_km") or 0) * 1000.0,
    )


def listings_for_route(conn, route_search_id):
    """Every listing found through any of this route's circles.

    A listing found by two circles appears once: it is one listing, and the
    corridor is one search from the buyer's point of view.
    """
    columns = {r[1] for r in conn.execute("PRAGMA table_info(listings)").fetchall()}
    postal = "l.postal_code" if "postal_code" in columns else "NULL"
    rows = conn.execute(
        # Every circle that found it, not only the first finder: a hunt given
        # a corridor afterwards had found its listings by its town search.
        f"SELECT DISTINCT l.id, l.title, l.price, l.location, l.url, {postal} "
        "FROM listings l "
        "JOIN listing_search_hits h ON h.listing_id = l.id "
        "JOIN route_search_circles c ON h.search_id = c.search_id "
        "WHERE c.route_search_id = ?",
        (route_search_id,),
    ).fetchall()
    return [
        {
            "id": row[0],
            "title": row[1],
            "price": row[2],
            "location": row[3],
            "url": row[4],
            "postal_code": row[5],
        }
        for row in rows
    ]


def save_geo(
    conn,
    route_search_id,
    listing_id,
    coordinates,
    offroute_km,
    detour_min,
    status=ROUTED,
):
    ensure_schema(conn)
    lat, lon = coordinates if coordinates else (None, None)
    conn.execute(
        "INSERT OR REPLACE INTO listing_route_geo "
        "(listing_id, route_search_id, lat, lon, offroute_km, detour_min, status, "
        "computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            listing_id,
            route_search_id,
            lat,
            lon,
            offroute_km,
            detour_min,
            status,
            _now(),
        ),
    )
    conn.commit()


def geo_for_route(conn, route_search_id):
    """Listing id -> what we know about its position on this route."""
    rows = conn.execute(
        "SELECT listing_id, lat, lon, offroute_km, detour_min, status "
        "FROM listing_route_geo WHERE route_search_id = ?",
        (route_search_id,),
    ).fetchall()
    return {
        row[0]: {
            "coordinates": (row[1], row[2]) if row[1] is not None else None,
            "offroute_km": row[3],
            "detour_min": row[4],
            "status": row[5],
        }
        for row in rows
    }


def pending_geo(conn, route_search_id):
    """Listings on this route still worth asking about.

    Never seen before, or seen and failed. A listing that was answered, was too
    far to be worth routing, or has no resolvable place is settled — asking again
    would cost a request and change nothing. A listing whose attempt failed is
    not settled, and treating it as though it were is how one minute of routing
    downtime turns into a permanent gap.
    """
    known = geo_for_route(conn, route_search_id)

    def pending(listing):
        status = known.get(listing["id"], {}).get("status", FAILED)
        # "No place" was settled before cards gave a postal code; one that has
        # one now is worth another try.
        return status in RETRYABLE or (
            status == UNPLACEABLE and listing.get("postal_code")
        )

    return [
        listing
        for listing in listings_for_route(conn, route_search_id)
        if pending(listing)
    ]
