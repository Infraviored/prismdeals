"""Planning a hunt's corridor, and placing its listings on it.

Two operations, deliberately separate because they happen at different times and
cost different things:

`plan_corridor` resolves both ends and covers the route with circles. It runs
once, when a buyer says where they are driving; family_route turns the circles
into the hunt's ordinary searches. Everything after that is the existing
pipeline: the scraper collects those searches like any other, the extractor
builds fact sheets, the scorer ranks against intent.

`annotate` computes what the ordinary pipeline cannot know — how far off the route
each listing sits, and what collecting it would cost in driving time. It runs
after scraping, over listings that do not have an answer yet, so a route with a
thousand listings does not re-route the ones it settled yesterday.

Keeping them apart is what stops the routing service from ever sitting in the
scraper's path: if routing is down, listings still arrive, they simply arrive
without a detour until the next annotate run.
"""

import logging

import geo
import route_search
import route_store
import routing

logger = logging.getLogger(__name__)

# Beyond this, the straight-line distance already proves the detour is worse than
# any listing is worth, and a routing request would only measure how much worse.
DEFAULT_MAX_OFFROUTE_KM = 40.0

# A listing sits at the centre of its town, which can be kilometres from where
# the thing actually is, so a corridor narrower than this would throw away
# listings on the strength of a coordinate that was never that precise.
MIN_OFFROUTE_KM = 10.0


def resolve_place(where, centroids=None, places=None):
    """Accepts a postal code, a "Ort, Bundesland" pair, or coordinates.

    Raises rather than guessing: a mistyped origin that silently resolves to the
    wrong town produces a plausible corridor through the wrong part of the
    country, which is far more expensive than an error message.
    """
    if isinstance(where, (tuple, list)) and len(where) == 2:
        return (float(where[0]), float(where[1]))

    text = str(where).strip()
    table = centroids or geo.centroids()

    if text.isdigit() and len(text) == 5:
        found = table.coordinates(text)
        if found:
            return found
        raise ValueError(f"Unknown postal code: {text}")

    gazetteer = places or geo.places()
    name, _, state = text.partition(",")
    found = gazetteer.coordinates(name.strip(), state.strip() or None)
    if found:
        return found

    raise ValueError(
        f"Could not place {text!r}. Give a postal code, or "
        f'"Ort, Bundesland" when the name occurs more than once.'
    )


def plan_corridor(
    base_url,
    origin,
    destination,
    radius_km=30.0,
    half_width_km=15.0,
    client=None,
    resolver=None,
):
    """Resolves both ends, routes between them, and covers the corridor.

    Raises when no circle centre resolves: a corridor with no searchable place
    would leave the hunt searching nowhere.
    """
    client = client or routing.OsrmClient()
    start = resolve_place(origin)
    end = resolve_place(destination)

    plan = route_search.plan(
        base_url,
        client.route([start, end]),
        radius_km=radius_km,
        half_width_km=half_width_km,
        resolver=resolver,
    )
    if not plan.circles:
        unresolved = ", ".join(plan.unresolved) if plan.unresolved else "none"
        raise ValueError(
            "No circle centre could be resolved to a location the platform "
            f"recognises, so this corridor cannot be searched. Unresolved "
            f"postal codes: {unresolved}."
        )
    return plan


def _coordinates_for(listing, places):
    """A listing's position, from the place string the scraper stored.

    The stored form is "Bayern - Landsberg (Lech)"; the state is what makes the
    town unambiguous, so it is kept rather than split away.
    """
    # The card's postal code first: a district ("Sendling") is no town the
    # gazetteer knows, and a bare "Moosach" is the wrong Moosach.
    code = listing.get("postal_code")
    if code:
        found = geo.centroids().coordinates(code)
        if found:
            return found
    text = (listing.get("location") or "").strip()
    if not text:
        return None
    state, separator, place = text.partition(" - ")
    if not separator:
        state, place = None, text
    return places.coordinates(place.strip(), (state or "").strip() or None)


def annotate(
    conn,
    route_search_id,
    client=None,
    max_offroute_km=None,
    places=None,
    limit=None,
):
    """Computes detours for listings on this route that lack one.

    Returns a summary rather than the rows: the numbers are in the database, and
    what a caller wants to know is how much was done and what could not be.

    The cutoff follows the corridor the buyer asked for. It used to be a flat
    forty kilometres regardless, which meant the corridor width decided how many
    searches to run and then had no say over what came back: a +/-15 km corridor
    returned listings 35 km off the route. It also made redrawing pointless for
    the listings already set aside, since the number they had been judged
    against never moved.

    A floor keeps a very narrow corridor from discarding the town-centre
    coordinates this works from — a listing is placed at the centre of its town,
    which can be several kilometres from wherever it actually is.
    """
    route = route_store.route(conn, route_search_id)
    if route is None:
        raise ValueError(f"Route {route_search_id} has no stored geometry.")

    if max_offroute_km is None:
        stored = route_store.get_plan(conn, route_search_id) or {}
        half_width = stored.get("half_width_km")
        max_offroute_km = (
            max(float(half_width), MIN_OFFROUTE_KM)
            if half_width
            else DEFAULT_MAX_OFFROUTE_KM
        )

    client = client or routing.OsrmClient()
    gazetteer = places or geo.places()

    pending = route_store.pending_geo(conn, route_search_id)
    if limit:
        pending = pending[:limit]

    located = []
    unplaceable = 0
    for listing in pending:
        coordinates = _coordinates_for(listing, gazetteer)
        if coordinates is None:
            unplaceable += 1
            # Recorded as settled, so an unplaceable listing is not retried on
            # every run — no amount of asking will give it coordinates.
            route_store.save_geo(
                conn,
                route_search_id,
                listing["id"],
                None,
                None,
                None,
                status=route_store.UNPLACEABLE,
            )
            continue
        located.append(dict(listing, coordinates=coordinates))

    annotated = routing.annotate_detours(
        client, route, located, max_offroute_km=max_offroute_km
    )

    too_far = failed = 0
    for listing in annotated:
        if listing.get("too_far"):
            status = route_store.TOO_FAR
            too_far += 1
        elif listing.get("failed"):
            status = route_store.FAILED
            failed += 1
        else:
            status = route_store.ROUTED

        route_store.save_geo(
            conn,
            route_search_id,
            listing["id"],
            listing.get("coordinates"),
            listing.get("offroute_km"),
            listing.get("detour_min"),
            status=status,
        )

    summary = {
        "considered": len(pending),
        "routed": len(annotated) - too_far - failed,
        "too_far": too_far,
        "unplaceable": unplaceable,
        "failed": failed,
    }
    logger.info(
        "Route %s: %d listings considered, %d routed, %d beyond %.0f km, "
        "%d without a resolvable place, %d failed and will be retried.",
        route_search_id,
        summary["considered"],
        summary["routed"],
        too_far,
        max_offroute_km,
        unplaceable,
        failed,
    )
    return summary
