"""Tests for P9: verdicts keyed by requirements version (hash).

Verdicts survive search term edits (re-aiming) because they share the same
requirements hash.  Verdicts invalidate when the buyer modifies their musts
(new requirements hash).  Searches with differing requirements never leak.
"""

import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fit  # noqa: E402
from requirements_hash import requirements_hash  # noqa: E402

SCHEMA = """
CREATE TABLE searches (id INTEGER PRIMARY KEY, url TEXT, knowledge_set_id INTEGER);
CREATE TABLE knowledge_sets (id INTEGER PRIMARY KEY, item_json TEXT, requirements_hash TEXT);
CREATE TABLE listings (
    id TEXT PRIMARY KEY, search_id INTEGER, title TEXT,
    detailed_description TEXT, short_description TEXT
);
CREATE TABLE listing_search_hits (
    listing_id TEXT NOT NULL, search_id INTEGER NOT NULL, first_seen_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);
CREATE TABLE listing_fit (
    listing_id TEXT NOT NULL, search_id INTEGER NOT NULL, verdict TEXT NOT NULL,
    reason TEXT, facts_json TEXT, stage TEXT NOT NULL, judged_at TEXT NOT NULL,
    requirements_hash TEXT,
    PRIMARY KEY (listing_id, search_id)
);
"""

MEMORY_SEARCH = "https://www.kleinanzeigen.de/s-pc-zubehoer-software/corsair/k0c225"

WANTS_16GB = {
    "fields": [
        {"id": "stickCount", "buyer_wants": {"min": 2, "max": 2}},
        {"id": "gbPerStick", "buyer_wants": {"min": 16, "max": 16}},
        {"id": "generation", "buyer_wants": {"preferred": ["ddr4"]}},
        {"id": "speedMhz", "buyer_wants": {"min": 3200}},
        {"id": "casLatency", "buyer_wants": {"max": 16}},
        {"id": "hasFunctionalDefect", "buyer_wants": {"match": False}},
    ]
}

WANTS_32GB = {
    "fields": [
        {"id": "stickCount", "buyer_wants": {"min": 2, "max": 2}},
        {"id": "gbPerStick", "buyer_wants": {"min": 32, "max": 32}},
        {"id": "generation", "buyer_wants": {"preferred": ["ddr4"]}},
        {"id": "speedMhz", "buyer_wants": {"min": 3200}},
        {"id": "casLatency", "buyer_wants": {"max": 16}},
        {"id": "hasFunctionalDefect", "buyer_wants": {"match": False}},
    ]
}


def query_verdict_for_search(conn, listing_id, search_id):
    """Resolves verdict using P9 logic (by requirements_hash, fallback to search_id)."""
    sql = """
        SELECT fit.verdict, fit.requirements_hash
          FROM listings l
          LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND (
            (fit.requirements_hash IS NOT NULL AND fit.requirements_hash = (
                SELECT ks_rh.requirements_hash FROM searches s_rh
                JOIN knowledge_sets ks_rh ON ks_rh.id = s_rh.knowledge_set_id
                WHERE s_rh.id = ?
            ))
            OR (fit.requirements_hash IS NULL AND fit.search_id = ?)
          )
         WHERE l.id = ?
    """
    return conn.execute(sql, (search_id, search_id, listing_id)).fetchone()


@pytest.fixture
def db():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA)
    yield c
    c.close()


def test_term_edit_keeps_verdicts(db):
    """When a search is edited (re-aimed), the new search shares the requirements hash.

    The verdict computed for the old search must be immediately visible to the new search.
    """
    hash_16 = requirements_hash(WANTS_16GB["fields"])
    # Seed knowledge set with hash
    db.execute(
        "INSERT INTO knowledge_sets (id, item_json, requirements_hash) VALUES (1, ?, ?)",
        (json.dumps(WANTS_16GB), hash_16),
    )
    # Search 1 (old terms)
    db.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (1, ?, 1)",
        (MEMORY_SEARCH,),
    )
    db.execute(
        "INSERT INTO listings (id, search_id, title) VALUES ('kit-1', 1, ?)",
        ("Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16",),
    )
    db.execute("INSERT INTO listing_search_hits VALUES ('kit-1', 1, '2026-09-01')")

    # Judge search 1
    counts = fit.judge_search(db, 1)
    assert counts["fit"] == 1

    stored = db.execute(
        "SELECT verdict, requirements_hash FROM listing_fit WHERE listing_id='kit-1'"
    ).fetchone()
    assert stored[0] == "fit"
    assert stored[1] == hash_16

    # Now simulate term edit: search 2 created with new terms but same knowledge_set (or same requirements)
    db.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (2, ?, 1)",
        (MEMORY_SEARCH,),
    )
    db.execute("INSERT INTO listing_search_hits VALUES ('kit-1', 2, '2026-09-02')")

    # Before judging search 2, query verdict for search 2
    row = query_verdict_for_search(db, "kit-1", 2)
    assert row is not None
    verdict, req_h = row
    assert verdict == "fit", "Verdict must survive search term edits"
    assert req_h == hash_16


def test_must_edit_invalidates_verdicts(db):
    """When buyer edits requirements (musts), the hash changes and old verdicts are not visible."""
    hash_16 = requirements_hash(WANTS_16GB["fields"])
    hash_32 = requirements_hash(WANTS_32GB["fields"])
    assert hash_16 != hash_32

    # Search 1 has 16GB requirements
    db.execute(
        "INSERT INTO knowledge_sets (id, item_json, requirements_hash) VALUES (1, ?, ?)",
        (json.dumps(WANTS_16GB), hash_16),
    )
    db.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (1, ?, 1)",
        (MEMORY_SEARCH,),
    )
    db.execute(
        "INSERT INTO listings (id, search_id, title) VALUES ('kit-1', 1, ?)",
        ("Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16",),
    )
    db.execute("INSERT INTO listing_search_hits VALUES ('kit-1', 1, '2026-09-01')")

    # Judge search 1
    fit.judge_search(db, 1)

    # Now buyer updates requirements to 32GB per stick
    db.execute(
        "UPDATE knowledge_sets SET item_json = ?, requirements_hash = ? WHERE id = 1",
        (json.dumps(WANTS_32GB), hash_32),
    )

    # Querying verdict for search 1 under updated requirements returns no verdict (NULL)
    row = query_verdict_for_search(db, "kit-1", 1)
    assert row[0] is None, "Old verdict must not be visible after musts edit"


def test_campaigns_with_different_requirements_dont_leak(db):
    """Two campaigns with differing requirements (differ by one field) do not leak verdicts."""
    hash_16 = requirements_hash(WANTS_16GB["fields"])
    hash_32 = requirements_hash(WANTS_32GB["fields"])

    db.execute(
        "INSERT INTO knowledge_sets (id, item_json, requirements_hash) VALUES (1, ?, ?)",
        (json.dumps(WANTS_16GB), hash_16),
    )
    db.execute(
        "INSERT INTO knowledge_sets (id, item_json, requirements_hash) VALUES (2, ?, ?)",
        (json.dumps(WANTS_32GB), hash_32),
    )

    db.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (1, ?, 1)",
        (MEMORY_SEARCH,),
    )
    db.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (2, ?, 2)",
        (MEMORY_SEARCH,),
    )

    # Listing found by both campaigns
    db.execute(
        "INSERT INTO listings (id, search_id, title) VALUES ('kit-shared', 1, ?)",
        ("Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16",),
    )
    db.execute("INSERT INTO listing_search_hits VALUES ('kit-shared', 1, '2026-09-01')")
    db.execute("INSERT INTO listing_search_hits VALUES ('kit-shared', 2, '2026-09-01')")

    # Only judge search 1
    fit.judge_search(db, 1)

    # Campaign 1 sees 'fit'
    v1 = query_verdict_for_search(db, "kit-shared", 1)
    assert v1[0] == "fit"

    # Campaign 2 does NOT see Campaign 1's verdict because its requirements_hash differs
    v2 = query_verdict_for_search(db, "kit-shared", 2)
    assert v2[0] is None, "Campaign 2 must not see Campaign 1's verdict"
