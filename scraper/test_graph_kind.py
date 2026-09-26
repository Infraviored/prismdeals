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


def test_a_listing_without_a_title_is_never_asked(conn):
    cid = _hunt(conn)
    conn.execute("UPDATE listings SET title = '' WHERE id = '1'")
    calls = []
    hunts.refine(
        conn,
        cid,
        ask=lambda p, **_: calls.append(p)
        or [{"i": 0, "is": "self"}, {"i": 1, "is": "self"}],
    )
    hunts.refine(conn, cid, ask=_ask([]))  # asks nothing more: would fail
    assert len(calls) == 1 and "0: Matratze 90x200" in calls[0]
    assert "\n2:" not in calls[0]


def test_an_unusable_answer_or_an_outage_leaves_them_unchecked(conn):
    cid = _hunt(conn)
    for bad in (
        lambda p, **_: [{"i": 0, "is": "ja"}],
        lambda p, **_: (_ for _ in ()).throw(llm.NoModel("KI nicht erreichbar.")),
    ):
        out = hunts.refine(conn, cid, ask=bad)
        assert out["listings"] == 3
        assert "rejected" not in _methods(conn).values()
    # Asked again next time.
    calls = []
    hunts.refine(conn, cid, ask=_ask(calls))
    assert len(calls) == 1 and _methods(conn)["1"] == "rejected"
