"""A corridor given to a hunt after it was made, or taken away again.

A hunt starts at one town. Deciding later "I drive Landsberg -> Konstanz
anyway" used to mean a new hunt: routes could only be planned together with
their search. Here the hunt keeps its terms, requirements and verdicts and only
changes where it looks -- every term runs in every circle of the corridor, and
the town searches rest (links deactivated, not deleted, so what they found
stays in the list).
"""

import family_store
import route_pipeline
import route_store


def _family(conn, family_id):
    row = conn.execute(
        "SELECT base_url, campaign_id, knowledge_set_id, name FROM search_families "
        "WHERE id = ?",
        (family_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"No search family {family_id}")
    return row


def _terms(conn, family_id):
    rows = conn.execute(
        "SELECT id, term, label FROM search_family_terms "
        "WHERE family_id = ? AND enabled = 1 ORDER BY position, id",
        (family_id,),
    ).fetchall()
    return [{"id": r[0], "term": r[1], "label": r[2]} for r in rows]


def _rest_current_searches(conn, family_id):
    """Deactivates the family's links; returns the search ids they held."""
    sids = [
        r[0]
        for r in conn.execute(
            "SELECT search_id FROM search_family_searches "
            "WHERE family_id = ? AND active = 1",
            (family_id,),
        ).fetchall()
    ]
    conn.execute(
        "UPDATE search_family_searches SET active = 0 WHERE family_id = ?",
        (family_id,),
    )
    return sids


def _drop_routes(conn, family_id):
    for (route_id,) in conn.execute(
        "SELECT id FROM route_searches WHERE family_id = ?", (family_id,)
    ).fetchall():
        route_store.delete_route(conn, route_id)


def set_route(
    conn,
    family_id,
    origin,
    destination,
    radius_km=30.0,
    half_width_km=15.0,
    client=None,
    resolver=None,
):
    """Replaces where the hunt searches with a corridor. Returns (route_id, plan).

    Plans first: a place that cannot be resolved raises before anything is
    changed, so a typo never leaves a hunt searching nowhere.
    """
    base_url, campaign_id, knowledge_set_id, name = _family(conn, family_id)
    plan = route_pipeline.plan_corridor(
        base_url,
        origin,
        destination,
        radius_km=radius_km,
        half_width_km=half_width_km,
        client=client,
        resolver=resolver,
    )

    _drop_routes(conn, family_id)
    rested = _rest_current_searches(conn, family_id)
    route_id = route_store.insert_route(
        conn,
        plan,
        base_url,
        origin,
        destination,
        name=f"{name}: {origin} → {destination}",
        campaign_id=campaign_id,
        knowledge_set_id=knowledge_set_id,
        family_id=family_id,
    )
    family_store.attach_terms(
        conn,
        family_id,
        _terms(conn, family_id),
        circles=plan.as_dict()["circles"],
        route_search_id=route_id,
    )
    family_store.recompute_enabled(conn, rested)
    conn.commit()
    return route_id, plan


def clear_route(conn, family_id):
    """Back to the hunt's own town: the corridor goes, the town searches return."""
    _family(conn, family_id)
    _drop_routes(conn, family_id)
    rested = _rest_current_searches(conn, family_id)
    family_store.attach_terms(conn, family_id, _terms(conn, family_id))
    family_store.recompute_enabled(conn, rested)
    conn.commit()
