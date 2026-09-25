"""A requirement for one model of a hunt judges only that model's offers."""

import json
import sqlite3

import db_schema
import fit


def _store():
    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    fields = [
        {
            "id": "own_kilometerstand_km",
            "label": "Kilometerstand km",
            "importance": "high",
            "own": True,
            "buyer_wants": {"max": 5000},
            "applies_to": [2],
        }
    ]
    conn.execute(
        "INSERT INTO knowledge_sets (id, name, item_json) VALUES (1, 'x', ?)",
        (json.dumps({"fields": fields}),),
    )
    conn.execute(
        "INSERT INTO campaigns (id, name, hunt_type) VALUES (1, 'Bikes', 'features')"
    )
    conn.execute(
        "INSERT INTO search_families (id, name, campaign_id, base_url, created_at) "
        "VALUES (1, 'Bikes', 1, 'https://www.kleinanzeigen.de/s-x/k0', '')"
    )
    conn.executemany(
        "INSERT INTO search_family_terms (id, family_id, term, label) VALUES (?, 1, ?, ?)",
        [(1, "yamaha-r1", "Yamaha R1"), (2, "honda-cbr-1000-rr", "Honda CBR 1000 RR")],
    )
    for sid, term in ((10, 1), (20, 2)):
        conn.execute(
            "INSERT INTO searches (id, campaign_id, url, enabled, knowledge_set_id) "
            "VALUES (?, 1, ?, 1, 1)",
            (sid, f"https://www.kleinanzeigen.de/s-x/k0c{sid}"),
        )
        conn.execute(
            "INSERT INTO search_family_searches (family_id, term_id, search_id) VALUES (1, ?, ?)",
            (term, sid),
        )
    details = json.dumps({"Kilometerstand": "13.000 km"})
    for lid, sid, title in (
        ("r1", 10, "Yamaha R1 RN19"),
        ("cbr", 20, "Honda CBR 1000 RR SC59"),
    ):
        conn.execute(
            "INSERT INTO listings (id, title, search_id, details) VALUES (?, ?, ?, ?)",
            (lid, title, sid, details),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, '')",
            (lid, sid),
        )
    return conn


def test_the_km_limit_for_the_cbr_does_not_touch_the_r1():
    conn = _store()
    fit.judge_search(conn, 10)
    fit.judge_search(conn, 20)
    verdicts = dict(
        conn.execute("SELECT listing_id, verdict FROM listing_fit").fetchall()
    )
    assert verdicts == {"r1": "fit", "cbr": "no"}


def test_both_searches_store_the_same_requirements_hash():
    conn = _store()
    fit.judge_search(conn, 10)
    fit.judge_search(conn, 20)
    hashes = {r[0] for r in conn.execute("SELECT requirements_hash FROM listing_fit")}
    assert len(hashes) == 1


def test_a_failed_number_says_what_was_read():
    conn = _store()
    fit.judge_search(conn, 20)
    reason = conn.execute(
        "SELECT reason FROM listing_fit WHERE listing_id='cbr'"
    ).fetchone()[0]
    assert reason == "Kilometerstand 13.000 km, erlaubt bis 5.000"
