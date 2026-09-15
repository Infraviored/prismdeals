"""Tests for Phase 0 (Canonical source), Phase 2a (Price), and Phase 2b (Freshness).

Verifies:
1. Canonical listing representation and source tracking.
2. Giveaway "Zu verschenken" -> price_eur 0, empty string -> price_eur None.
3. UPSERT on conflict(id) strictly preserves existing title, price, and details
   while updating last_seen_at.
4. Positive detail harvest stamps last_seen_at.
5. Negative detail harvest (404/410/notice) stamps delisted_at.
"""

import sqlite3

import db_schema
import result_list
import scraper


def test_canonical_listing_structure():
    parsed = {
        "id": "12345",
        "url": "https://www.kleinanzeigen.de/s-anzeige/12345",
        "title": "ThinkPad T14",
        "description": "Like new",
        "price_eur": 450,
        "location": "Landsberg (Lech)",
        "state": "Bayern",
    }
    canonical = result_list.as_canonical(parsed)

    assert isinstance(canonical, result_list.CanonicalListing)
    assert canonical.id == "12345"
    assert canonical.source == "kleinanzeigen"
    assert canonical.source_id == "12345"
    assert canonical.price_eur == 450
    assert canonical.price == "450 €"
    assert canonical.location == "Bayern - Landsberg (Lech)"
    assert canonical.place == "Landsberg (Lech)"
    assert canonical.state == "Bayern"

    d = canonical.to_dict()
    assert d["source"] == "kleinanzeigen"
    assert d["source_id"] == "12345"
    assert d["price_eur"] == 450
    assert d["price"] == "450 €"


def test_giveaway_parses_to_zero_and_empty_to_null():
    giveaway_html = """
    <ul id="srchrslt-adtable">
      <article data-adid="111" data-href="/s-anzeige/111">
        <div class="aditem-main--middle--price-shipping--price">
          <p class="aditem-main--middle--price-shipping--price">
            Zu verschenken
          </p>
        </div>
      </article>
      <article data-adid="222" data-href="/s-anzeige/222">
        <div class="aditem-main--middle--price-shipping--price">
          <p>no price here</p>
        </div>
      </article>
    </ul>
    """
    listings = result_list.parse(giveaway_html)
    assert len(listings) == 2

    # 1. Giveaway
    free_ad = listings[0]
    assert free_ad["id"] == "111"
    assert free_ad["price_eur"] == 0
    db_free = result_list.as_db_listing(free_ad)
    assert db_free["price_eur"] == 0
    assert db_free["price"] == "Zu verschenken"

    # 2. Empty / unstated price
    empty_ad = listings[1]
    assert empty_ad["id"] == "222"
    assert empty_ad["price_eur"] is None
    db_empty = result_list.as_db_listing(empty_ad)
    assert db_empty["price_eur"] is None
    assert db_empty["price"] == ""


def test_as_canonical_location_no_double_prefix():
    """as_canonical must not double-prefix the state when location already includes it.

    Guards against the bug where a DB-stored location like
    "Bayern - Landsberg (Lech)" passed back through as_canonical produced
    "Bayern - Bayern - Landsberg (Lech)", and where place was incorrectly
    set to the composite string instead of the bare town name.
    """
    # Fresh parse: location = bare town, state = state name -> should compose
    fresh = {
        "id": "200",
        "url": "https://www.kleinanzeigen.de/s-anzeige/200",
        "price_eur": 100,
        "location": "Landsberg (Lech)",
        "state": "Bayern",
    }
    c_fresh = result_list.as_canonical(fresh)
    assert c_fresh.location == "Bayern - Landsberg (Lech)"
    assert c_fresh.place == "Landsberg (Lech)"

    # Round-trip: pass the already-composed location back through as_canonical
    stored = {
        "id": "200",
        "url": "https://www.kleinanzeigen.de/s-anzeige/200",
        "price_eur": 100,
        "location": "Bayern - Landsberg (Lech)",  # as stored in DB
        "state": "Bayern",
        "place": "Landsberg (Lech)",  # as stored in DB
    }
    c_stored = result_list.as_canonical(stored)
    assert c_stored.location == "Bayern - Landsberg (Lech)", (
        f"Double-prefix detected: got '{c_stored.location}'"
    )
    assert c_stored.place == "Landsberg (Lech)", (
        f"place should be bare town, got '{c_stored.place}'"
    )


def test_upsert_preserves_title_and_price_and_updates_last_seen(tmp_path):
    """The core contract of Phase 2b:
    Known listings MUST NOT overwrite title, price, or description on rediscoveries.
    Only last_seen_at is updated, and delisted_at is cleared (listing is alive again).
    """
    db_path = tmp_path / "upsert_test.db"
    conn = db_schema.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("INSERT INTO campaigns (id, name) VALUES (1, 'C1')")
    cursor.execute(
        "INSERT INTO searches (id, campaign_id, url, enabled) VALUES (1, 1, 'http://test', 1)"
    )
    cursor.execute(
        "INSERT INTO searches (id, campaign_id, url, enabled) VALUES (2, 1, 'http://test2', 1)"
    )

    t1 = "2026-01-01T12:00:00+00:00"
    t2 = "2026-01-02T15:30:00+00:00"
    t_delisted = "2026-01-01T23:00:00+00:00"

    # Initial insert - listing also has a delisted_at stamp (was flagged gone)
    cursor.execute(
        """
        INSERT INTO listings (
            id, source, source_id, title, price, price_eur,
            location, url, short_description, detailed_description,
            search_id, last_seen_at, delisted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            delisted_at = NULL
    """,
        (
            "ad-100",
            "kleinanzeigen",
            "ad-100",
            "Original Title",
            "100 €",
            100,
            "Berlin",
            "http://example.com/100",
            "Short",
            "Detailed",
            1,
            t1,
            t_delisted,
        ),
    )
    conn.commit()

    # Second insert of the same ID with conflicting title and price;
    # simulates re-discovering the listing in a later crawl.
    cursor.execute(
        """
        INSERT INTO listings (
            id, source, source_id, title, price, price_eur,
            location, url, short_description, detailed_description,
            search_id, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            delisted_at = NULL
    """,
        (
            "ad-100",
            "kleinanzeigen",
            "ad-100",
            "OVERWRITTEN TITLE",
            "999 €",
            999,
            "Munich",
            "http://example.com/100",
            "Changed Short",
            "Changed Detailed",
            2,
            t2,
        ),
    )
    conn.commit()

    cursor.execute(
        "SELECT title, price, price_eur, location, search_id, last_seen_at, delisted_at FROM listings WHERE id = ?",
        ("ad-100",),
    )
    row = cursor.fetchone()

    assert row[0] == "Original Title", "Title was overwritten on conflict!"
    assert row[1] == "100 €", "Price string was overwritten on conflict!"
    assert row[2] == 100, "Price EUR was overwritten on conflict!"
    assert row[3] == "Berlin", "Location was overwritten on conflict!"
    assert row[4] == 1, "search_id was overwritten on conflict!"
    assert row[5] == t2, "last_seen_at was not updated!"
    assert row[6] is None, "delisted_at was not cleared on rediscovery!"
    conn.close()


def test_harvest_stamps_last_seen_at_on_positive_fetch(tmp_path, monkeypatch):
    """Positive detail fetch stamps last_seen_at confirming listing is active."""
    db_path = tmp_path / "harvest_positive.db"
    conn = db_schema.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Test')")
    cursor.execute(
        "INSERT INTO searches (id, campaign_id, url, enabled) VALUES (1, 1, 'http://test', 1)"
    )
    cursor.execute(
        """
        INSERT INTO listings (id, title, search_id, url, full_info_obtained, last_seen_at)
        VALUES ('ad-pos', 'Test Item', 1, 'http://test/ad-pos', 0, NULL)
    """
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr(scraper.db_schema, "default_path", lambda: str(db_path))
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_LISTINGS", 0)
    monkeypatch.setattr(
        scraper,
        "parse_listing_details_requests",
        lambda url, session=None: {
            "detailed_description": "Full details here",
            "details": {"Brand": "Lenovo"},
            "images": ["http://test/img.jpg"],
        },
    )

    scraper.harvest_descriptions()

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM listings WHERE id = 'ad-pos'").fetchone()

    assert row["full_info_obtained"] == 1
    assert row["last_seen_at"] is not None
    assert row["delisted_at"] is None
    conn.close()


def test_harvest_stamps_delisted_at_on_delisted_signal(tmp_path, monkeypatch):
    """Negative detail fetch (404/delisted notice) stamps delisted_at."""
    db_path = tmp_path / "harvest_delisted.db"
    conn = db_schema.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Test')")
    cursor.execute(
        "INSERT INTO searches (id, campaign_id, url, enabled) VALUES (1, 1, 'http://test', 1)"
    )
    cursor.execute(
        """
        INSERT INTO listings (id, title, search_id, url, full_info_obtained, last_seen_at, delisted_at)
        VALUES ('ad-dead', 'Sold Item', 1, 'http://test/ad-dead', 0, '2026-01-01T00:00:00Z', NULL)
    """
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr(scraper.db_schema, "default_path", lambda: str(db_path))
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_LISTINGS", 0)
    monkeypatch.setattr(
        scraper,
        "parse_listing_details_requests",
        lambda url, session=None: {"delisted": True},
    )

    scraper.harvest_descriptions()

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM listings WHERE id = 'ad-dead'").fetchone()

    assert row["full_info_obtained"] == 1
    assert row["delisted_at"] is not None
    assert row["last_seen_at"] == "2026-01-01T00:00:00Z"
    conn.close()
