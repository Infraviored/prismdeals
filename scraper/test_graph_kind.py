"""The kind check: what names put on a hunted product may be only something for it."""

import sqlite3

import pytest

import db_schema
from graph import hunts, llm, store, taxonomy


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    db_schema.apply_schema(c)
    taxonomy.seed(c)
    return c


TITLES = ["Matratze 90x200 Kaltschaum", "Matratze Bezug 90x200", "Matratze plus Topper"]


def _hunt(conn):
    betten = taxonomy.category_node_id(conn, "81")
    matratze = store.create_node(conn, betten, "class", "Matratze", "test")
    store.add_alias(conn, matratze, "Matratze", "name", "test")
    cid = hunts.save(
        conn,
        {
            "name": "Matratze",
            "category_code": "81",
            "frame": {},
            "targets": [{"typed": "Matratze", "node_id": matratze}],
            "conditions": [],
        },
    )
    (sid,) = conn.execute(
        "SELECT id FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchone()
    for n, title in enumerate(TITLES):
        conn.execute(
            "INSERT INTO listings (id, title, url, details, detailed_description) VALUES (?, ?, ?, '{}', '')",
            (str(n), title, f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-81-1"),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (str(n), sid),
        )
    return cid


def _ask(calls):
    def ask(prompt, **_):
        calls.append(prompt)
        assert prompt.startswith("Gesucht: Matratze")
        return [{"i": 0, "is": "self"}, {"i": 1, "is": "part"}, {"i": 2, "is": "self"}]

    return ask


def _methods(conn):
    return dict(conn.execute("SELECT listing_id, method FROM listing_resolution"))


def test_a_cover_named_like_the_product_is_rejected_once(conn):
    cid = _hunt(conn)
    calls = []
    assert hunts.refine(conn, cid, ask=_ask(calls))["asked"] == 3
    methods = _methods(conn)
    assert methods["1"] == "rejected"
    assert methods["0"] != "rejected" and methods["2"] != "rejected"
    # Asked once: names do not undo the no, and the yeses are not asked again.
    hunts.refine(conn, cid, ask=_ask(calls))
    assert len(calls) == 1
    assert _methods(conn)["1"] == "rejected"


def test_an_answer_that_is_no_list_of_self_or_part_is_no_answer(conn):
    cid = _hunt(conn)
    with pytest.raises(llm.NoModel):
        hunts.refine(conn, cid, ask=lambda p, **_: [{"i": 0, "is": "ja"}])
    assert "rejected" not in _methods(conn).values()
