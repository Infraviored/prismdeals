"""Keeping the verdict, not just computing it.

The judgement existed and went nowhere: it ran inside the scoring pipeline,
settled most of a search for nothing, and threw the answer away. So fifty
offers looked exactly like the same list on Kleinanzeigen, with a 4x8 kit
sitting between the matches.
"""

import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fit  # noqa: E402

SCHEMA = """
CREATE TABLE searches (id INTEGER PRIMARY KEY, url TEXT, knowledge_set_id INTEGER);
CREATE TABLE knowledge_sets (id INTEGER PRIMARY KEY, item_json TEXT);
CREATE TABLE listings (
    id TEXT PRIMARY KEY, search_id INTEGER, title TEXT,
    detailed_description TEXT, short_description TEXT
);
CREATE TABLE listing_fit (
    listing_id TEXT NOT NULL, search_id INTEGER NOT NULL, verdict TEXT NOT NULL,
    reason TEXT, facts_json TEXT, stage TEXT NOT NULL, judged_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);
"""

MEMORY_SEARCH = "https://www.kleinanzeigen.de/s-pc-zubehoer-software/corsair/k0c225"

WANTS = {
    "fields": [
        {"id": "stickCount", "buyer_wants": {"min": 2, "max": 2}},
        {"id": "gbPerStick", "buyer_wants": {"min": 16, "max": 16}},
        {"id": "generation", "buyer_wants": {"preferred": ["ddr4"]}},
        {"id": "speedMhz", "buyer_wants": {"min": 3200}},
        {"id": "casLatency", "buyer_wants": {"max": 16}},
        {"id": "hasFunctionalDefect", "buyer_wants": {"match": False}},
    ]
}


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA)
    c.execute(
        "INSERT INTO knowledge_sets (id, item_json) VALUES (1, ?)", (json.dumps(WANTS),)
    )
    c.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (1, ?, 1)",
        (MEMORY_SEARCH,),
    )
    return c


def add(conn, listing_id, title, description=None):
    conn.execute(
        "INSERT INTO listings (id, search_id, title, detailed_description) VALUES (?, 1, ?, ?)",
        (listing_id, title, description),
    )


def test_a_verdict_is_written_for_every_listing(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    add(conn, "b", "32GB RAM Kit (4x8GB) Corsair Vengeance")
    add(conn, "c", "32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)")

    counts = fit.judge_search(conn, 1)
    assert counts == {"fit": 1, "unclear": 1, "no": 1}

    rows = dict(
        conn.execute(
            "SELECT listing_id, verdict FROM listing_fit WHERE search_id = 1"
        ).fetchall()
    )
    assert rows == {"a": "fit", "b": "no", "c": "unclear"}


def test_a_rejection_says_the_one_fact_that_decided_it(conn):
    """ "4 Riegel statt 2" beats a list of everything that was fine."""
    add(conn, "b", "32GB RAM Kit (4x8GB) Corsair Vengeance & Goodram")
    fit.judge_search(conn, 1)
    reason = conn.execute(
        "SELECT reason FROM listing_fit WHERE listing_id = 'b'"
    ).fetchone()[0]
    assert "stickCount" in reason and "4" in reason


def test_the_description_settles_what_the_title_left_open(conn):
    add(
        conn,
        "c",
        "32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)",
        "Typ: DDR4-3200 MHz, CL16, zwei Module, voll funktionsfähig.",
    )
    counts = fit.judge_search(conn, 1)
    assert counts["fit"] == 1
    stage = conn.execute(
        "SELECT stage FROM listing_fit WHERE listing_id = 'c'"
    ).fetchone()[0]
    assert stage == "description", "and it says which stage answered"


def test_judging_twice_replaces_rather_than_duplicates(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    fit.judge_search(conn, 1)
    fit.judge_search(conn, 1)
    assert conn.execute("SELECT COUNT(*) FROM listing_fit").fetchone()[0] == 1


def test_the_facts_are_kept_so_a_verdict_can_be_argued_with(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    fit.judge_search(conn, 1)
    facts = json.loads(
        conn.execute(
            "SELECT facts_json FROM listing_fit WHERE listing_id = 'a'"
        ).fetchone()[0]
    )
    assert facts["stickCount"] == 2
    assert facts["speedMhz"] == 3200


def test_a_search_without_requirements_says_so_rather_than_judging(conn):
    """It is the one thing the buyer has to do, so it must not look like a bug."""
    conn.execute("UPDATE searches SET knowledge_set_id = NULL WHERE id = 1")
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    result = fit.judge_search(conn, 1)
    assert "error" in result and "requirement" in result["error"]
    assert conn.execute("SELECT COUNT(*) FROM listing_fit").fetchone()[0] == 0


def test_a_category_with_no_playbook_says_so(conn):
    conn.execute(
        "UPDATE searches SET url = 'https://www.kleinanzeigen.de/s-x/k0' WHERE id = 1"
    )
    add(conn, "a", "irgendwas")
    result = fit.judge_search(conn, 1)
    assert "error" in result and "playbook" in result["error"]
