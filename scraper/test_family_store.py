import sqlite3
import pytest

import db_schema
import family_store
import route_search
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

    # Pre-existing search with campaign 1, disabled
    cursor.execute(
        "INSERT INTO searches (campaign_id, name, url, enabled) "
        "VALUES (1, 'Pre-existing', 'https://www.kleinanzeigen.de/s-inning-am-ammersee/brother-mfc-l2740dw/k0l7091r26', 0)"
    )
    pre_id = cursor.lastrowid

    # Create family with campaign 2
    family_id, count, conflicts = family_store.save_family(
        conn,
        name="Printers",
        base_url=MATRATZE,
        terms=["Brother MFC-L2740DW"],
        campaign_id=2,
    )

    assert count == 1
    assert len(conflicts) == 1
    conflict = conflicts[0]
    assert conflict["search_id"] == pre_id
    assert "campaign 1 instead of 2" in conflict["reasons"]
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


def test_term_keyword_update_reattaches_searches(conn):
    """Finding 2: Updating term keyword text must detach old search and attach new search."""
    cursor = conn.cursor()
    fam_id, count, _ = family_store.save_family(
        conn,
        name="Printers",
        base_url=MATRATZE,
        terms=[{"term": "MFC-L2740DW", "label": "Model 2740"}],
    )
    term_row = cursor.execute(
        "SELECT id, term FROM search_family_terms WHERE family_id = ?", (fam_id,)
    ).fetchone()
    term_id = term_row[0]
    old_sid = cursor.execute(
        "SELECT search_id FROM search_family_searches WHERE family_id = ? AND term_id = ?",
        (fam_id, term_id),
    ).fetchone()[0]
    old_url = cursor.execute(
        "SELECT url FROM searches WHERE id = ?", (old_sid,)
    ).fetchone()[0]
    assert "mfc-l2740dw" in old_url

    # Update term keyword to MFC-L2750DW
    family_store.update_family(
        conn,
        fam_id,
        terms=[{"id": term_id, "term": "MFC-L2750DW", "label": "Model 2750"}],
    )

    new_sid = cursor.execute(
        "SELECT search_id FROM search_family_searches "
        "WHERE family_id = ? AND term_id = ? AND active = 1",
        (fam_id, term_id),
    ).fetchone()[0]
    new_url = cursor.execute(
        "SELECT url FROM searches WHERE id = ?", (new_sid,)
    ).fetchone()[0]
    assert "mfc-l2750dw" in new_url
    assert new_sid != old_sid

    # The old search is no longer run by this family -- but the link stays, so
    # the listings it found remain reachable. Deleting it left the search row
    # with no owner at all, and recompute_enabled never switches an unowned row:
    # it kept being scraped forever, and the family lost its own history.
    old_link = cursor.execute(
        "SELECT active FROM search_family_searches WHERE search_id = ?", (old_sid,)
    ).fetchone()
    assert old_link is not None, "the link to the old search must survive"
    assert old_link[0] == 0, "but it must no longer be active"
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (old_sid,)
        ).fetchone()[0]
        == 0
    ), "and the search itself must stop being scraped"


def test_disabled_term_on_route_family_disables_search(conn):
    """Finding 3: Disabling a term on a route-attached family must disable its search row."""
    import family_route
    from test_route_pipeline import FakeOsrm, suggest

    cursor = conn.cursor()
    fam_id, _, _ = family_store.save_family(
        conn,
        name="Route Family",
        base_url=MATRATZE,
        terms=[{"term": "Model A", "enabled": 1}, {"term": "Model B", "enabled": 1}],
    )
    family_route.set_route(
        conn,
        fam_id,
        "86899",
        "78462",
        client=FakeOsrm(),
        resolver=route_search.LocationResolver(fetch=suggest),
    )

    term_b_id = cursor.execute(
        "SELECT id FROM search_family_terms WHERE family_id = ? AND term = 'model-b'",
        (fam_id,),
    ).fetchone()[0]
    sid_b = cursor.execute(
        "SELECT search_id FROM search_family_searches "
        "WHERE family_id = ? AND term_id = ? AND active = 1",
        (fam_id, term_b_id),
    ).fetchone()[0]
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (sid_b,)
        ).fetchone()[0]
        == 1
    )

    # Disable Model B
    term_a_id = cursor.execute(
        "SELECT id FROM search_family_terms WHERE family_id = ? AND term = 'model-a'",
        (fam_id,),
    ).fetchone()[0]
    family_store.update_family(
        conn,
        fam_id,
        terms=[
            {"id": term_a_id, "term": "Model A", "enabled": 1},
            {"id": term_b_id, "term": "Model B", "enabled": 0},
        ],
    )

    # Search B must now be disabled (enabled = 0)
    assert (
        cursor.execute(
            "SELECT enabled FROM searches WHERE id = ?", (sid_b,)
        ).fetchone()[0]
        == 0
    )


def test_update_family_base_url_rewrites_searches(conn):
    """Updating base_url updates search_families and rewrites all attached search URLs."""
    cursor = conn.cursor()
    fam_id, count, _ = family_store.save_family(
        conn,
        name="Drucker Test",
        base_url="https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30",
        terms=["Brother MFC-L2740DW"],
    )
    assert count == 1
    orig_search = cursor.execute(
        "SELECT s.id, s.url FROM searches s "
        "JOIN search_family_searches sfs ON sfs.search_id = s.id "
        "WHERE sfs.family_id = ? AND sfs.active = 1",
        (fam_id,),
    ).fetchone()
    assert orig_search[1] == (
        "https://www.kleinanzeigen.de/s-landsberg-am-lech/brother-mfc-l2740dw/k0l7091r30"
    )

    # Change radius from 30 to 50 km and add price filter preis:10:150
    new_base = "https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/drucker/k0l7091r50"
    family_store.update_family(
        conn,
        fam_id,
        base_url=new_base,
    )

    # Check search_families row
    stored_base = cursor.execute(
        "SELECT base_url FROM search_families WHERE id = ?", (fam_id,)
    ).fetchone()[0]
    assert stored_base == new_base

    # Check rewritten searches row
    new_search = cursor.execute(
        "SELECT s.id, s.url, s.enabled FROM searches s "
        "JOIN search_family_searches sfs ON sfs.search_id = s.id "
        "WHERE sfs.family_id = ? AND sfs.active = 1",
        (fam_id,),
    ).fetchone()
    assert new_search[1] == (
        "https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/brother-mfc-l2740dw/k0l7091r50"
    )
    assert new_search[2] == 1


def test_re_aiming_a_family_does_not_leave_searches_running_forever(conn):
    """Every edit of a town, a radius or a price used to add searches nobody wanted.

    update_family's base_url path detached each term and attached it again under
    the new URL. The old `searches` rows survived with no owner at all, and
    recompute_enabled deliberately never switches an unowned row -- it reads one
    as hand-made. So the scrape schedule grew by N on every edit, permanently,
    while the family's own listings vanished from its results because
    listing_search_hits still pointed at the detached rows.
    """
    cursor = conn.cursor()
    fam_id, _, _ = family_store.save_family(
        conn,
        name="Drucker",
        base_url="https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30",
        terms=["Brother MFC-L2740DW", "Canon i-SENSYS MF445dw"],
    )

    before = [
        r[0]
        for r in cursor.execute(
            "SELECT search_id FROM search_family_searches WHERE family_id = ? AND active = 1",
            (fam_id,),
        ).fetchall()
    ]
    assert len(before) == 2

    family_store.update_family(
        conn,
        fam_id,
        base_url="https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r50",
    )

    after = [
        r[0]
        for r in cursor.execute(
            "SELECT search_id FROM search_family_searches WHERE family_id = ? AND active = 1",
            (fam_id,),
        ).fetchall()
    ]
    assert len(after) == 2, "the family still runs two searches, not four"
    assert set(after).isdisjoint(before), "and they are the re-aimed ones"

    for old in before:
        assert (
            cursor.execute(
                "SELECT enabled FROM searches WHERE id = ?", (old,)
            ).fetchone()[0]
            == 0
        ), f"search {old} is nobody's and must not keep being scraped"

    # The history stays reachable: the link is inactive, not gone.
    kept = cursor.execute(
        "SELECT COUNT(*) FROM search_family_searches WHERE family_id = ?", (fam_id,)
    ).fetchone()[0]
    assert kept == 4, "two re-aimed plus two kept for their history"


def test_converting_a_plain_campaign_keeps_its_search_as_a_retired_predecessor(conn):
    """The Corsair incident: a campaign made of one plain search was saved from
    the setup screen with one filter changed. The new family got a new search and
    the old one -- 50 listings, 50 verdicts -- fell out of the campaign view,
    which looked to the buyer like everything had been deleted.

    The old search must become a retired member of the new family, so the view
    can keep showing it until the new search has run once.
    """
    old_url = (
        "https://www.kleinanzeigen.de/s-pc-zubehoer-software/preis::150/"
        "corsair-vengeance-32gb/k0c225"
    )
    conn.execute("INSERT INTO campaigns (id, name) VALUES (7, 'Corsair')")
    conn.execute(
        "INSERT INTO searches (id, campaign_id, name, url, enabled) VALUES (45, 7, 'Corsair', ?, 1)",
        (old_url,),
    )
    conn.commit()

    new_base = old_url.replace("k0c225", "k0c225+pc_zubehoer_software.versand_s:ja")
    family_id, _, _ = family_store.save_family(
        conn,
        "Corsair",
        new_base,
        [{"term": "corsair vengeance 32gb", "label": "corsair vengeance 32gb"}],
        campaign_id=7,
    )

    rows = conn.execute(
        "SELECT search_id, active FROM search_family_searches WHERE family_id = ? ORDER BY search_id",
        (family_id,),
    ).fetchall()
    assert (45, 0) in rows, rows
    active = [sid for sid, a in rows if a == 1]
    assert len(active) == 1 and active[0] != 45
    # Retired means no longer crawled.
    assert conn.execute("SELECT enabled FROM searches WHERE id = 45").fetchone()[0] == 0


def test_changing_back_to_an_earlier_url_turns_its_search_on_again(conn):
    """A filter set and reset: the second edit lands on the first search again.

    Its link row was already there with active = 0, and "INSERT OR IGNORE"
    left it off. Live, the Honda search of the R1 / CBR hunt stopped being
    crawled after such an edit, with nothing on screen saying so.
    """
    cursor = conn.cursor()
    r30 = "https://www.kleinanzeigen.de/s-landsberg-am-lech/motorrad/k0l7091r30"
    r50 = "https://www.kleinanzeigen.de/s-landsberg-am-lech/motorrad/k0l7091r50"
    fam_id, _, _ = family_store.save_family(
        conn, name="R1", base_url=r30, terms=["yamaha r1"]
    )
    family_store.update_family(conn, fam_id, base_url=r50)
    family_store.update_family(conn, fam_id, base_url=r30)

    active = cursor.execute(
        """SELECT s.url, s.enabled FROM search_family_searches sfs
             JOIN searches s ON s.id = sfs.search_id
            WHERE sfs.family_id = ? AND sfs.active = 1""",
        (fam_id,),
    ).fetchall()
    assert len(active) == 1
    assert active[0][0].endswith("r30") and active[0][1] == 1
