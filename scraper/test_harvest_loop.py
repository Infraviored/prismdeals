"""The loop that a one-line predicate change opened, and the two cuts that close it.

Harvesting and AI evaluation were both writing `full_info_obtained`, and the
harvester was stamping `last_description_changed_at` on every fetch. Together
those closed a circle:

    harvest sets full_info_obtained = 1, stamps the timestamp
      -> the AI finds a criterion the seller never stated, sets it back to 0
        -> the next crawl re-harvests, because 0 means "not fetched"
          -> which stamps the timestamp again
            -> which is exactly what the AI work queue selects on
              -> forever, at one HTTP request and one model call per cycle

It did not fire while only ten listings had ever been evaluated. It would have
fired on the first real run.
"""

import ast
import os
import sqlite3

import pytest

import scraper

HERE = os.path.dirname(os.path.abspath(__file__))


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "t.db"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE searches (
            id INTEGER PRIMARY KEY, campaign_id INTEGER, url TEXT, enabled INTEGER);
        CREATE TABLE listings (
            id TEXT PRIMARY KEY, url TEXT, title TEXT, search_id INTEGER,
            detailed_description TEXT, details TEXT, images TEXT,
            full_info_obtained INTEGER DEFAULT 0,
            last_description_changed_at TEXT, last_ai_evaluated_at TEXT,
            llm_processed INTEGER DEFAULT 0);
        INSERT INTO searches VALUES (1, 1, 'http://x', 1);
    """)
    conn.commit()
    conn.close()
    monkeypatch.setattr(scraper.db_schema, "default_path", lambda: str(path))
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_LISTINGS", 0)
    return path


def add_listing(path, **columns):
    conn = sqlite3.connect(path)
    base = dict(
        id="l1",
        url="http://x/1",
        title="A wardrobe",
        search_id=1,
        detailed_description="",
        details="{}",
        images="[]",
        full_info_obtained=0,
        last_description_changed_at=None,
        last_ai_evaluated_at=None,
        llm_processed=0,
    )
    base.update(columns)
    conn.execute(
        "INSERT OR REPLACE INTO listings ({}) VALUES ({})".format(
            ", ".join(base), ", ".join("?" * len(base))
        ),
        list(base.values()),
    )
    conn.commit()
    conn.close()


def row(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    r = conn.execute("SELECT * FROM listings WHERE id = 'l1'").fetchone()
    conn.close()
    return r


def test_the_ai_worker_never_writes_the_harvesters_column():
    """`full_info_obtained` means 'we fetched the detail page'.

    The worker was using it for 'the extraction was complete' — a second meaning
    in one column, and the first link of the loop. Checked structurally rather
    than by running the worker, because it needs a model.
    """
    source = open(os.path.join(HERE, "agent_worker.py"), encoding="utf-8").read()
    tree = ast.parse(source)

    written = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        sql = node.value
        if "UPDATE listings" in sql and "full_info_obtained" in sql:
            written.append(node.lineno)

    assert written == [], (
        "agent_worker.py writes full_info_obtained in an UPDATE at lines "
        f"{written}. That column belongs to the harvester; extraction "
        "completeness lives in the facts envelope as _full_info_obtained."
    )


def test_harvesting_unchanged_text_does_not_requeue_the_ai(db, monkeypatch):
    """The second link: the stamp the AI work queue reads.

    `last_description_changed_at` is named for a change and is selected on as
    `last_description_changed_at > last_ai_evaluated_at`. Stamped on every
    fetch, a re-harvest puts the listing back in the queue even though its text
    never moved.
    """
    add_listing(
        db,
        detailed_description="Solid oak, two doors.",
        full_info_obtained=0,
        last_description_changed_at="2026-01-01T00:00:00+00:00",
        last_ai_evaluated_at="2026-01-02T00:00:00+00:00",
    )
    monkeypatch.setattr(
        scraper,
        "parse_listing_details_requests",
        lambda url, session=None: {
            "detailed_description": "Solid oak, two doors.",
            "details": {"Art": "Schrank"},
            "images": ["http://img/1.jpg"],
        },
    )

    scraper.harvest_descriptions()
    after = row(db)

    assert after["full_info_obtained"] == 1, "the page was fetched; say so"
    assert after["last_description_changed_at"] == "2026-01-01T00:00:00+00:00", (
        "the description did not change, so the stamp must not move — moving it "
        "puts the listing back in the AI queue for no reason"
    )
    assert after["last_description_changed_at"] < after["last_ai_evaluated_at"], (
        "which is what the work queue actually tests"
    )


def test_a_changed_description_does_stamp(db, monkeypatch):
    """The other half: a real change must still be noticed."""
    add_listing(
        db,
        detailed_description="Solid oak, two doors.",
        last_description_changed_at="2026-01-01T00:00:00+00:00",
        last_ai_evaluated_at="2026-01-02T00:00:00+00:00",
    )
    monkeypatch.setattr(
        scraper,
        "parse_listing_details_requests",
        lambda url, session=None: {
            "detailed_description": "Solid oak, two doors. Price reduced.",
            "details": {},
            "images": [],
        },
    )

    scraper.harvest_descriptions()
    after = row(db)

    assert after["detailed_description"].endswith("Price reduced.")
    assert after["last_description_changed_at"] > after["last_ai_evaluated_at"], (
        "a genuine change must re-queue the listing for evaluation"
    )


def test_a_complete_listing_is_not_harvested_again(db, monkeypatch):
    """What the predicate change was for in the first place.

    A listing with no detail table and no gallery parses to exactly `{}` and
    `[]`. The old predicate read that as 'never fetched' and re-fetched it every
    cycle — 44 listings on the live database, forever.
    """
    add_listing(db, details="{}", images="[]", full_info_obtained=1)
    calls = []
    monkeypatch.setattr(
        scraper,
        "parse_listing_details_requests",
        lambda url, session=None: calls.append(url)
        or {"detailed_description": "", "details": {}, "images": []},
    )

    scraper.harvest_descriptions()

    assert calls == [], "a fetched listing must not be fetched again"
