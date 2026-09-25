import sqlite3

import pytest

import db_schema
import family_route
import family_store
import route_search
from test_route_pipeline import FakeOsrm, suggest

BASE = (
    "https://www.kleinanzeigen.de/s-landsberg-am-lech/preis::25/ventilator/k0c176l0r30"
)


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    db_schema.apply_schema(connection)
    yield connection
    connection.close()


def _hunt(conn):
    conn.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Ventilator')")
    fid, _, _ = family_store.save_family(
        conn, "Ventilator", BASE, ["ventilator", "tischventilator"], campaign_id=1
    )
    return fid


def _enabled_urls(conn):
    return sorted(
        r[0] for r in conn.execute("SELECT url FROM searches WHERE enabled = 1")
    )


def _corridor(conn, fid):
    return family_route.set_route(
        conn,
        fid,
        "86899",
        "78462",
        client=FakeOsrm(),
        resolver=route_search.LocationResolver(fetch=suggest),
    )


def test_a_corridor_replaces_the_town_searches_and_keeps_the_terms(conn):
    fid = _hunt(conn)
    town = _enabled_urls(conn)
    route_id, plan = _corridor(conn, fid)

    now = _enabled_urls(conn)
    assert not set(town) & set(now)
    assert len(now) == 2 * len(plan.circles)
    assert all("ventilator" in url and "preis::25" in url for url in now)
    row = conn.execute(
        "SELECT family_id, campaign_id FROM route_searches WHERE id = ?", (route_id,)
    ).fetchone()
    assert row == (fid, 1)


def test_a_new_corridor_replaces_the_old_one(conn):
    fid = _hunt(conn)
    _corridor(conn, fid)
    _corridor(conn, fid)
    assert conn.execute("SELECT COUNT(*) FROM route_searches").fetchone()[0] == 1


def test_clearing_the_corridor_brings_the_town_back(conn):
    fid = _hunt(conn)
    town = _enabled_urls(conn)
    _corridor(conn, fid)
    family_route.clear_route(conn, fid)
    assert _enabled_urls(conn) == town
    assert conn.execute("SELECT COUNT(*) FROM route_searches").fetchone()[0] == 0


def test_an_unknown_place_changes_nothing(conn):
    fid = _hunt(conn)
    town = _enabled_urls(conn)
    with pytest.raises(ValueError):
        family_route.set_route(conn, fid, "00000", "78462", client=FakeOsrm())
    assert _enabled_urls(conn) == town


def test_clearing_a_corridor_stops_its_own_circle_searches(conn):
    """A route planned first and adopted by the hunt owns base circles; they
    must stop when the corridor goes, not be crawled forever."""
    import route_pipeline

    conn.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Fan')")
    route_id, _ = route_pipeline.create(
        conn,
        base_url=BASE,
        origin="86899",
        destination="78462",
        campaign_id=1,
        client=FakeOsrm(),
        resolver=route_search.LocationResolver(fetch=suggest),
    )
    fid, _, _ = family_store.save_family(
        conn, "Fan", BASE, ["tischventilator"], campaign_id=1, route_search_id=route_id
    )
    family_route.clear_route(conn, fid)
    enabled = _enabled_urls(conn)
    assert all("tischventilator" in url for url in enabled), enabled
