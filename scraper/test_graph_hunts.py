"""Hunts as queries: targets placed, conditions on attributes, the crawl derived."""

import sqlite3

import pytest

import db_schema
from graph import hunts, store, taxonomy
from test_graph import _cbr_answer


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    db_schema.apply_schema(c)
    taxonomy.seed(c)
    return c


def _doc(**over):
    doc = {
        "name": "Supersportler",
        "text": "CBR SC59 unter 5000 km",
        "category_code": "305",
        "frame": {"max_price": 9000, "location_id": 6411, "radius_km": 200},
        "targets": [
            {
                "typed": "Honda CBR 1000 RR SC59",
                "conditions": [
                    {
                        "label": "Kilometerstand",
                        "op": "max",
                        "value": 5000,
                        "importance": "must",
                    }
                ],
            }
        ],
        "conditions": [{"label": "Heizgriffe", "op": "present", "importance": "wish"}],
    }
    doc.update(over)
    return doc


def test_a_hunt_is_its_targets_conditions_and_crawl(conn):
    cid = hunts.save(conn, _doc(), ask=_cbr_answer)
    ((node_id, name),) = conn.execute(
        "SELECT node_id, name FROM hunt_targets"
    ).fetchall()
    assert store.node(conn, node_id)["key"].endswith("/honda/cbr-1000-rr/sc59")
    assert name == "Honda CBR 1000 RR SC59"
    rows = conn.execute(
        "SELECT node_id, attr_id, op, value_json, importance FROM hunt_conditions ORDER BY id"
    ).fetchall()
    # The km condition reads the site's own attribute; the wish added one.
    assert rows[0] == (node_id, "km", "max", "5000", "must")
    assert rows[1][:2] == (None, "heizgriffe")
    assert "heizgriffe" in store.effective_attributes(conn, node_id)
    # The SC59 is searched as the CBR, the km filter narrows the URL only when
    # it applies to every target -- this one is scoped, so it does not.
    ((term,),) = conn.execute("SELECT label FROM search_family_terms").fetchall()
    assert term == "Honda CBR 1000 RR"
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "c305" in url and "r200" in url and "km_i" not in url


def test_a_must_for_all_targets_narrows_the_crawl_url(conn):
    doc = _doc(
        targets=[{"typed": "Honda CBR 1000 RR SC59"}],
        conditions=[
            {
                "label": "Kilometerstand",
                "op": "max",
                "value": 30000,
                "importance": "must",
            }
        ],
    )
    cid = hunts.save(conn, doc, ask=_cbr_answer)
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "+motorraeder_roller.km_i:,30000" in url


def test_saving_again_keeps_the_family_and_the_name_is_unique(conn):
    cid = hunts.save(conn, _doc(), ask=_cbr_answer)
    node_id = conn.execute("SELECT node_id FROM hunt_targets").fetchone()[0]
    hunts.save(
        conn,
        _doc(targets=[{"node_id": node_id, "typed": "SC59"}], conditions=[]),
        campaign_id=cid,
        ask=_cbr_answer,
    )
    assert conn.execute("SELECT COUNT(*) FROM search_families").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM hunt_conditions").fetchone()[0] == 0
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, _doc(), ask=_cbr_answer)


def test_a_condition_needs_its_value(conn):
    bad = _doc(
        conditions=[{"label": "Kilometerstand", "op": "max", "importance": "must"}]
    )
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, bad, ask=_cbr_answer)


def test_refine_asks_once_about_listings_above_the_target(conn):
    cid = hunts.save(conn, _doc(), ask=_cbr_answer)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    for n, title in enumerate(["Honda Fireblade Rot", "Honda Superblade Tank"]):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, '{}')",
            (f"x{n}", title, f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-305-1"),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (f"x{n}", sid),
        )
    calls = []

    def answer(prompt):
        calls.append(prompt)
        return [{"i": 0, "key": None}, {"i": 1, "key": None}]

    # "Fireblade" is an alias of the CBR: named, not asked. The other is at
    # Honda, above the target, and asked -- once.
    assert hunts.refine(conn, cid, ask=answer)["asked"] == 1
    assert hunts.refine(conn, cid, ask=answer)["asked"] == 0
    assert len(calls) == 1
    methods = dict(
        conn.execute("SELECT listing_id, method FROM listing_resolution").fetchall()
    )
    assert methods == {"x0": "alias", "x1": "model"}
