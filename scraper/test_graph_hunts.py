"""Hunts as queries: targets placed, conditions on attributes, the crawl derived."""

import json
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


def _answers(prompt):
    """The placing answer, or readers for whatever facts the prompt asks about."""
    if "Er verlangt diese Merkmale" in prompt:
        labels = [
            line[2:]
            for line in prompt.splitlines()
            if line.startswith("- ") and ":" not in line
        ]
        return {
            "attributes": [
                {
                    "label": label,
                    "id": label.lower(),
                    "type": "boolean",
                    "readers": [f"keywords:{label.lower()}"],
                }
                for label in labels
            ]
        }
    return _cbr_answer(prompt)


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
    cid = hunts.save(conn, _doc(), ask=_answers)
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
    cid = hunts.save(conn, doc, ask=_answers)
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "+motorraeder_roller.km_i:,30000" in url


def test_saving_again_keeps_the_family_and_the_name_is_unique(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    node_id = conn.execute("SELECT node_id FROM hunt_targets").fetchone()[0]
    hunts.save(
        conn,
        _doc(targets=[{"node_id": node_id, "typed": "SC59"}], conditions=[]),
        campaign_id=cid,
        ask=_answers,
    )
    assert conn.execute("SELECT COUNT(*) FROM search_families").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM hunt_conditions").fetchone()[0] == 0
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, _doc(), ask=_answers)


def test_a_condition_needs_its_value(conn):
    bad = _doc(
        conditions=[{"label": "Kilometerstand", "op": "max", "importance": "must"}]
    )
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, bad, ask=_answers)


def test_refine_asks_once_about_listings_above_the_target(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
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


def test_deleting_a_hunt_keeps_what_it_found(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    conn.execute(
        "INSERT INTO listings (id, title, search_id) VALUES ('x', 'Honda CBR', ?)",
        (sid,),
    )
    conn.execute(
        "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('x', ?, 0)",
        (sid,),
    )
    assert hunts.delete(conn, cid)["deleted"]
    assert conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0] == 1
    assert conn.execute("SELECT enabled, campaign_id FROM searches").fetchone() == (
        0,
        None,
    )
    assert conn.execute("SELECT COUNT(*) FROM search_families").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM hunt_targets").fetchone()[0] == 0


def test_the_crawl_plan_fetches_the_never_fetched_first(conn):
    import datetime

    from graph import crawlplan

    cid = hunts.save(
        conn,
        _doc(
            targets=[
                {"typed": "Honda CBR 1000 RR SC59"},
                {"typed": "Honda CBR 1000 RR"},
            ]
        ),
        ask=_answers,
    )
    units = crawlplan.plan(conn)
    assert len(units) == 1  # both targets are searched as the CBR: one unit
    conn.execute("UPDATE searches SET last_scraped_at = '2026-09-25T10:00:00+00:00'")
    hunts.save(
        conn,
        _doc(name="Zweite", targets=[{"typed": "Yamaha R1"}]),
        ask=lambda p: _answers(p)
        if "Er verlangt" in p
        else {
            "path": [
                {"name": "Yamaha", "kind": "brand"},
                {"name": "R1", "kind": "model"},
            ]
        },
    )
    now = datetime.datetime(2026, 9, 25, 12, tzinfo=datetime.timezone.utc)
    order = [u["url"] for u in crawlplan.plan(conn, now=now)]
    assert "yamaha-r1" in order[0] and "honda" in order[1]
    assert [u["url"] for u in crawlplan.plan(conn, campaign_id=cid)] == [order[1]]


def test_a_class_that_is_its_category_is_the_category(conn):
    from graph import place

    def never(prompt):
        raise AssertionError("no model call")

    laptops = taxonomy.category_node_id(conn, "278")
    assert place.place(conn, "Laptop", "278", ask=never) == laptops
    # A model that names the category as a class is taken the same way.
    moto = place.place(
        conn,
        "Motorrad",
        "305",
        ask=lambda p: {"path": [{"name": "Motorräder & Motorroller", "kind": "class"}]},
    )
    assert moto == taxonomy.category_node_id(conn, "305")


def test_a_kind_of_goods_is_found_in_compounds_and_by_the_art_field(conn):
    from graph import facts

    cid = hunts.save(
        conn,
        {
            "name": "Matratze",
            "category_code": "81",
            "frame": {"max_price": 50, "location_id": 6358, "radius_km": 26},
            "targets": [{"typed": "Matratze"}],
            "conditions": [
                {"label": "Art", "op": "eq", "value": "Matratzen", "importance": "must"}
            ],
        },
        ask=lambda p: {
            "path": [{"name": "Matratze", "kind": "class", "aliases": ["Matratze"]}]
        },
    )
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "art_s:matratzen" in url and "/matratze/" not in url
    target = hunts.target_ids(conn, cid)[0]
    rows = [
        ("m1", "Kaltschaummatratze 90x200", {}),
        ("m2", "Boxspring Topper neuwertig", {"Art": "Matratzen"}),
        ("m3", "Lattenrost 90x200", {"Art": "Lattenroste"}),
    ]
    for n, (lid, title, details) in enumerate(rows):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, ?)",
            (
                lid,
                title,
                f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-81-1",
                json.dumps(details),
            ),
        )
    assert facts.process(conn, "m1") == target
    assert facts.process(conn, "m2") == target
    assert facts.process(conn, "m3") == taxonomy.category_node_id(conn, "81")


def test_a_class_step_that_is_the_category_is_dropped(conn):
    from graph import place, store

    node = place.place(
        conn,
        "Yamaha R1",
        "305",
        ask=lambda p: {
            "path": [
                {
                    "name": "Motorräder & Motorroller",
                    "kind": "class",
                    "aliases": ["Motorrad"],
                },
                {"name": "Yamaha", "kind": "brand"},
                {"name": "R1", "kind": "model"},
            ],
            "attributes": [
                {
                    "id": "abs",
                    "label": "ABS",
                    "type": "boolean",
                    "readers": ["keywords:abs"],
                    "at": 2,
                }
            ],
        },
    )
    moto = taxonomy.category_node_id(conn, "305")
    assert [n["kind"] for n in store.ancestors(conn, node)][-2:] == ["brand", "model"]
    assert store.node(conn, node)["parent_id"] != moto
    assert "abs" in store.effective_attributes(conn, node)
    assert place.find(conn, "Motorrad", moto) == moto
