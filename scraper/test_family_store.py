import sqlite3
import pytest

import db_schema
import family_store
import search_url


BRIMNES = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:60/"
    "ikea-brimnes-kleiderschrank/k0l13533r25"
)
MATRATZE = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/matratze-140x200/k0l7091r26"
)
LAPTOPS = (
    "https://www.kleinanzeigen.de/s-notebooks/muenchen/preis::450/laptop/k0c278l6411"
)


class DummyCircle:
    def __init__(self, location_id, radius_km, label):
        self.location_id = location_id
        self.radius_km = radius_km
        self.label = label


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    db_schema.apply_schema(connection)
    yield connection
    connection.close()


def test_route_without_family_produces_bit_identical_urls():
    """Acceptance criterion from docs/plan-search-families.md:

    A route without a family must produce bit-identical URLs to the existing
    with_location behavior across all real-world test URLs from the plan.
    """
    circles = [
        DummyCircle("7091", 26, "86899 Landsberg (Lech)"),
        DummyCircle("7278", 29, "87746 Erkheim"),
        DummyCircle("8083", 28, "88299 Leutkirch im Allgäu"),
    ]

    for base in (BRIMNES, MATRATZE, LAPTOPS):
        legacy_urls = [
            search_url.with_location(base, c.location_id, c.radius_km) for c in circles
        ]
        expanded_urls = [
            url for _, url, _ in family_store.expand(base, terms=None, circles=circles)
        ]
        assert expanded_urls == legacy_urls


def test_cross_product_expansion():
    """Cartesian product: N terms × M circles -> N × M search URLs."""
    terms = ["Brother MFC-L2740DW", "HP LaserJet Pro MFP M426fdw"]
    circles = [
        DummyCircle("7091", 26, "Landsberg"),
        DummyCircle("7278", 29, "Erkheim"),
        DummyCircle("8083", 28, "Leutkirch"),
    ]
    expanded = list(family_store.expand(MATRATZE, terms, circles))
    assert len(expanded) == 6

    urls = [item[1] for item in expanded]
    assert all(
        "brother-mfc-l2740dw" in u or "hp-laserjet-pro-mfp-m426fdw" in u for u in urls
    )
    assert any("l7091r26" in u for u in urls)
    assert any("l7278r29" in u for u in urls)
    assert any("l8083r28" in u for u in urls)

    # Family without circles: N terms × 1 place -> N search URLs
    single_place = list(family_store.expand(MATRATZE, terms, circles=None))
    assert len(single_place) == 2
    assert (
        single_place[0][1]
        == "https://www.kleinanzeigen.de/s-inning-am-ammersee/brother-mfc-l2740dw/k0l7091r26"
    )
    assert (
        single_place[1][1]
        == "https://www.kleinanzeigen.de/s-inning-am-ammersee/hp-laserjet-pro-mfp-m426fdw/k0l7091r26"
    )


def test_search_reuse_and_conflicts(conn):
    """Reusing an existing search with differing metadata reports conflicts transparently."""
    cursor = conn.cursor()
    cursor.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Camp 1')")
    cursor.execute("INSERT INTO campaigns (id, name) VALUES (2, 'Camp 2')")
    cursor.execute("INSERT INTO knowledge_sets (id, name) VALUES (1, 'KS 1')")
    cursor.execute("INSERT INTO knowledge_sets (id, name) VALUES (2, 'KS 2')")

    # Pre-existing search with campaign 1, knowledge_set 1, disabled
    cursor.execute(
        "INSERT INTO searches (campaign_id, name, url, enabled, knowledge_set_id) "
        "VALUES (1, 'Pre-existing', 'https://www.kleinanzeigen.de/s-inning-am-ammersee/brother-mfc-l2740dw/k0l7091r26', 0, 1)"
    )
    pre_id = cursor.lastrowid

    # Create family with campaign 2, knowledge_set 2
    family_id, count, conflicts = family_store.save_family(
        conn,
        name="Printers",
        base_url=MATRATZE,
        terms=["Brother MFC-L2740DW"],
        campaign_id=2,
        knowledge_set_id=2,
    )

    assert count == 1
    assert len(conflicts) == 1
    conflict = conflicts[0]
    assert conflict["search_id"] == pre_id
    assert "campaign 1 instead of 2" in conflict["reasons"]
    assert "knowledge set 1 instead of 2" in conflict["reasons"]
    assert "disabled" in conflict["reasons"]


def test_recompute_enabled_with_two_owners(conn):
    """A search shared by two families stays enabled as long as at least one owner is active.
    A manually created search without owners is never touched.
    """
    cursor = conn.cursor()
    cursor.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Camp 1')")

    # Manual search without owners
    cursor.execute(
        "INSERT INTO searches (campaign_id, name, url, enabled) "
        "VALUES (1, 'Manual search', 'https://www.kleinanzeigen.de/s-manual/k0', 1)"
    )
    manual_id = cursor.lastrowid

    # Family 1 with term
    fam1_id, _, _ = family_store.save_family(
        conn,
        name="Family 1",
        base_url=MATRATZE,
        terms=["Brother MFC-L2740DW"],
    )
    # Family 2 with identical term at identical location
    fam2_id, _, _ = family_store.save_family(
        conn,
        name="Family 2",
        base_url=MATRATZE,
        terms=["Brother MFC-L2740DW"],
    )

    shared_search_id = cursor.execute(
        "SELECT search_id FROM search_family_searches WHERE family_id = ?",
        (fam1_id,),
    ).fetchone()[0]

    # Both families active -> search is enabled
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (shared_search_id,)
        ).fetchone()[0]
        == 1
    )

    # Disable Family 1 -> search is STILL enabled because Family 2 owns it
    family_store.update_family(conn, fam1_id, enabled=0)
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (shared_search_id,)
        ).fetchone()[0]
        == 1
    )

    # Disable Family 2 -> now no active owners -> search disabled
    family_store.update_family(conn, fam2_id, enabled=0)
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (shared_search_id,)
        ).fetchone()[0]
        == 0
    )

    # Re-enable Family 1 -> search enabled again
    family_store.update_family(conn, fam1_id, enabled=1)
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (shared_search_id,)
        ).fetchone()[0]
        == 1
    )

    # Calling recompute_enabled on the manual search does not switch it off
    family_store.recompute_enabled(conn, [manual_id])
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (manual_id,)
        ).fetchone()[0]
        == 1
    )


def test_listing_search_hits_records_all_matches_without_overwriting_search_id(conn):
    """Point 1 from docs/plan-search-families.md:
    A listing found through a second search records a new hit in listing_search_hits
    while keeping listings.search_id (first seen search).
    """
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO searches (id, name, url, enabled) VALUES (1, 'Search 1', 'https://example.com/s1', 1)"
    )
    cursor.execute(
        "INSERT INTO searches (id, name, url, enabled) VALUES (2, 'Search 2', 'https://example.com/s2', 1)"
    )

    # First scrape finds listing L100 via search 1
    now1 = "2026-09-14T20:00:00Z"
    cursor.execute(
        """
        INSERT OR IGNORE INTO listings (id, title, price, location, url, search_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("L100", "Laser Printer", "50 €", "München", "https://example.com/item/100", 1),
    )
    cursor.execute(
        """
        INSERT OR IGNORE INTO listing_search_hits (listing_id, search_id, first_seen_at)
        VALUES (?, ?, ?)
        """,
        ("L100", 1, now1),
    )

    # Second scrape finds listing L100 via search 2
    now2 = "2026-09-14T21:00:00Z"
    cursor.execute(
        """
        INSERT OR IGNORE INTO listings (id, title, price, location, url, search_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("L100", "Laser Printer", "50 €", "München", "https://example.com/item/100", 2),
    )

    cursor.execute(
        """
        INSERT OR IGNORE INTO listing_search_hits (listing_id, search_id, first_seen_at)
        VALUES (?, ?, ?)
        """,
        ("L100", 2, now2),
    )

    # listings.search_id must still be search 1
    row = cursor.execute("SELECT search_id FROM listings WHERE id = 'L100'").fetchone()
    assert row[0] == 1

    # listing_search_hits must have two rows for L100
    hits = cursor.execute(
        "SELECT search_id, first_seen_at FROM listing_search_hits WHERE listing_id = 'L100' ORDER BY search_id"
    ).fetchall()
    assert len(hits) == 2
    assert hits[0] == (1, now1)
    assert hits[1] == (2, now2)
