"""Keeping a listing current, which the scraper never did.

It only ever added: a listing it had seen before was skipped outright. So a kit
that fell from 130 EUR to 100 went unnoticed, a photograph a later harvest
could have filled in never arrived, and nothing recorded that the listing was
still there. All three are on the result card already, so the update costs
nothing beyond the page the run had to fetch anyway.
"""

import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import listing_updates  # noqa: E402

SCHEMA = """
CREATE TABLE listings (
    id TEXT PRIMARY KEY, title TEXT, price TEXT, price_eur INTEGER,
    images TEXT, last_seen_at TEXT
);
CREATE TABLE listing_price_history (
    listing_id TEXT NOT NULL, price_eur INTEGER, seen_at TEXT NOT NULL
);
"""


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA)
    c.execute(
        "INSERT INTO listings (id, title, price, price_eur, images) VALUES "
        "('a', 'Corsair Vengeance', '130 €', 130, '[]')"
    )
    return c


def test_a_fallen_price_is_written_and_remembered(conn):
    changed = listing_updates.apply(
        conn, {"id": "a", "price_eur": 100, "price": "100 €"}
    )
    assert changed["price_eur"] == (130, 100)

    assert conn.execute(
        "SELECT price_eur, price FROM listings WHERE id='a'"
    ).fetchone() == (
        100,
        "100 €",
    )
    # Both ends of the line: the price it carried and the price it carries.
    assert [h["price_eur"] for h in listing_updates.history(conn, "a")] == [130, 100]


def test_a_price_that_holds_is_not_written_again(conn):
    """Five harvests at the same price are one change, not five observations."""
    for _ in range(5):
        listing_updates.apply(conn, {"id": "a", "price_eur": 100})
    assert [h["price_eur"] for h in listing_updates.history(conn, "a")] == [130, 100]


def test_every_step_of_a_falling_price_is_kept(conn):
    """Three changes inside one second used to collide on a key built from the
    timestamp, and two of them vanished."""
    for price in (120, 110, 100):
        listing_updates.apply(conn, {"id": "a", "price_eur": price})
    assert [h["price_eur"] for h in listing_updates.history(conn, "a")] == [
        130,
        120,
        110,
        100,
    ]


def test_a_missing_photograph_is_filled_in(conn):
    changed = listing_updates.apply(
        conn, {"id": "a", "price_eur": 130, "images": ["https://img/1.jpg"]}
    )
    assert "images" in changed
    stored = json.loads(
        conn.execute("SELECT images FROM listings WHERE id='a'").fetchone()[0]
    )
    assert stored == ["https://img/1.jpg"]


def test_photographs_already_collected_are_not_replaced_by_one_thumbnail(conn):
    """A detail fetch collects six; the card carries one. Overwriting would be
    a loss dressed as an update."""
    conn.execute(
        "UPDATE listings SET images = ? WHERE id='a'", (json.dumps(["a", "b", "c"]),)
    )
    changed = listing_updates.apply(
        conn, {"id": "a", "price_eur": 130, "images": ["thumb"]}
    )
    assert "images" not in changed
    stored = json.loads(
        conn.execute("SELECT images FROM listings WHERE id='a'").fetchone()[0]
    )
    assert stored == ["a", "b", "c"]


def test_a_withdrawn_price_does_not_overwrite_the_number_with_nothing(conn):
    """ "VB" replacing a number is a change of meaning, not a gap."""
    changed = listing_updates.apply(conn, {"id": "a", "price_eur": None, "price": "VB"})
    assert "price_withdrawn" in changed
    assert (
        conn.execute("SELECT price_eur FROM listings WHERE id='a'").fetchone()[0] == 130
    )


def test_being_seen_is_recorded_even_when_nothing_changed(conn):
    listing_updates.apply(conn, {"id": "a", "price_eur": 130})
    assert conn.execute("SELECT last_seen_at FROM listings WHERE id='a'").fetchone()[0]


def test_a_listing_that_is_not_stored_is_not_invented(conn):
    assert listing_updates.apply(conn, {"id": "unknown", "price_eur": 50}) is None


def test_the_first_change_gives_the_line_both_its_ends(conn):
    """Recording only the new price leaves a single dot. A trail needs two
    prices, so the chart would appear only on the second change -- long after
    the interesting one."""
    listing_updates.apply(conn, {"id": "a", "price_eur": 100})
    assert [h["price_eur"] for h in listing_updates.history(conn, "a")] == [130, 100]


def test_the_opening_price_is_written_once_and_never_again(conn):
    listing_updates.apply(conn, {"id": "a", "price_eur": 120})
    listing_updates.apply(conn, {"id": "a", "price_eur": 100})
    assert [h["price_eur"] for h in listing_updates.history(conn, "a")] == [
        130,
        120,
        100,
    ]
