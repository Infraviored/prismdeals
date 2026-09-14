import sqlite3
import pytest

import db_schema
import family_store
import route_search
import route_store
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


def test_route_replan_with_all_disabled_terms(conn):
    """Finding 1: Route replan with all disabled terms must not crash on NOT NULL term_id."""
    import route_store

    cursor = conn.cursor()
    fam_id, _, _ = family_store.save_family(
        conn,
        name="Printers",
        base_url=MATRATZE,
        terms=[{"term": "MFC-L2740DW", "enabled": 0}],
    )
    cursor.execute(
        "INSERT INTO route_searches (name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at, family_id) "
        "VALUES ('Test Route', ?, 'A', 'B', 20, 10, '{}', '2026-09-14T20:00:00Z', ?)",
        (MATRATZE, fam_id),
    )
    route_id = cursor.lastrowid

    class DummyPlan:
        circles = [DummyCircle("7091", 20, "Landsberg")]

    conflicts = route_store.attach_circles(conn, route_id, DummyPlan())
    assert conflicts == []


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
        "SELECT search_id FROM search_family_searches WHERE family_id = ? AND term_id = ?",
        (fam_id, term_id),
    ).fetchone()[0]
    new_url = cursor.execute(
        "SELECT url FROM searches WHERE id = ?", (new_sid,)
    ).fetchone()[0]
    assert "mfc-l2750dw" in new_url
    assert new_sid != old_sid

    # Old search is no longer owned by this family
    assert (
        cursor.execute(
            "SELECT 1 FROM search_family_searches WHERE search_id = ?", (old_sid,)
        ).fetchone()
        is None
    )


def test_disabled_term_on_route_family_disables_search(conn):
    """Finding 3: Disabling a term on a route-attached family must disable its search row."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO route_searches (name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at) "
        'VALUES (\'Route\', ?, \'A\', \'B\', 20, 10, \'{"circles": [{"location_id": "7091", "radius_km": 20, "label": "Landsberg"}]}\', \'2026-09-14T20:00:00Z\')',
        (MATRATZE,),
    )
    route_id = cursor.lastrowid

    fam_id, _, _ = family_store.save_family(
        conn,
        name="Route Family",
        base_url=MATRATZE,
        terms=[{"term": "Model A", "enabled": 1}, {"term": "Model B", "enabled": 1}],
        route_search_id=route_id,
    )

    term_b_id = cursor.execute(
        "SELECT id FROM search_family_terms WHERE family_id = ? AND term = 'model-b'",
        (fam_id,),
    ).fetchone()[0]
    sid_b = cursor.execute(
        "SELECT search_id FROM search_family_searches WHERE family_id = ? AND term_id = ?",
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


def test_delete_family_cleans_up_route_circles(conn):
    """Finding 4: Deleting a family cleans up its circles from route_search_circles."""
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO route_searches (name, base_url, origin, destination, radius_km, half_width_km, plan_json, created_at) "
        'VALUES (\'Route\', ?, \'A\', \'B\', 20, 10, \'{"circles": [{"location_id": "7091", "radius_km": 20, "label": "Landsberg"}]}\', \'2026-09-14T20:00:00Z\')',
        (MATRATZE,),
    )
    route_id = cursor.lastrowid

    fam_id, _, _ = family_store.save_family(
        conn,
        name="Family with Route",
        base_url=MATRATZE,
        terms=["Model X"],
        route_search_id=route_id,
    )
    assert (
        cursor.execute(
            "SELECT COUNT(*) FROM route_search_circles WHERE route_search_id = ?",
            (route_id,),
        ).fetchone()[0]
        > 0
    )

    # Delete family
    family_store.delete_family(conn, fam_id)

    # Multiplied searches from this family are removed from route_search_circles
    assert (
        cursor.execute(
            "SELECT COUNT(*) FROM route_search_circles WHERE route_search_id = ?",
            (route_id,),
        ).fetchone()[0]
        == 0
    )


def test_preview_distinguishes_prefix_terms(conn):
    """Finding 7: Terms where one is a prefix of another are not confused in preview."""
    terms = ["ThinkPad T14", "ThinkPad T14s"]
    preview = family_store.preview_family(conn, LAPTOPS, terms)
    t14s_url = next(u for u in preview["urls"] if "thinkpad-t14s" in u["url"])
    assert t14s_url["term"] == "ThinkPad T14s"
    t14_url = next(
        u
        for u in preview["urls"]
        if "thinkpad-t14/" in u["url"] or "thinkpad-t14-" in u["url"]
    )
    assert t14_url["term"] == "ThinkPad T14"


class MockRoute:
    distance_km = 50.0
    duration_min = 40
    polyline = [(48.0, 11.0), (48.1, 11.5)]


def test_route_preserves_circles_on_family_delete_and_term_removal(conn):
    """A route with N circles whose family includes the route's original search term
    retains exactly its original N circles with family_id IS NULL and enabled = 1
    when a family term is removed or when the family is deleted.
    """
    cursor = conn.cursor()
    circles = [
        route_search.Circle(
            centre=(48.0, 11.0),
            postal_code="82266",
            location_id="7091",
            label="Inning",
            snap_km=0.0,
            radius_km=25.0,
            url="https://www.kleinanzeigen.de/s-inning-am-ammersee/matratze-140x200/k0l7091r25",
        ),
        route_search.Circle(
            centre=(48.1, 11.5),
            postal_code="80331",
            location_id="6411",
            label="München",
            snap_km=0.0,
            radius_km=25.0,
            url="https://www.kleinanzeigen.de/s-muenchen/matratze-140x200/k0l6411r25",
        ),
    ]
    plan = route_search.RoutePlan(
        route=MockRoute(),
        circles=circles,
        radius_km=25.0,
        half_width_km=10.0,
    )
    route_id, _ = route_store.save_plan(
        conn, plan, base_url=MATRATZE, origin="Inning", destination="München"
    )

    initial_circles = cursor.execute(
        "SELECT search_id, location_id, label, radius_km, family_id "
        "FROM route_search_circles WHERE route_search_id = ? ORDER BY search_id",
        (route_id,),
    ).fetchall()
    assert len(initial_circles) == 2
    for c in initial_circles:
        assert c[4] is None  # family_id IS NULL

    orig_sids = [c[0] for c in initial_circles]
    for sid in orig_sids:
        assert (
            cursor.execute(
                "SELECT enabled FROM searches WHERE id = ?", (sid,)
            ).fetchone()[0]
            == 1
        )

    # Attach family with terms including the route's original term ('matratze 140x200')
    fam_id, _, _ = family_store.save_family(
        conn,
        name="Matratzen & Drucker",
        base_url=MATRATZE,
        terms=["matratze 140x200", "Brother MFC-L2740DW"],
        route_search_id=route_id,
    )

    # Route now has 4 circles: 2 belonging to route (family_id NULL), 2 to family (family_id = fam_id)
    after_save = cursor.execute(
        "SELECT search_id, location_id, label, radius_km, family_id "
        "FROM route_search_circles WHERE route_search_id = ? ORDER BY search_id",
        (route_id,),
    ).fetchall()
    assert len(after_save) == 4
    assert sum(1 for c in after_save if c[4] is None) == 2
    assert sum(1 for c in after_save if c[4] == fam_id) == 2

    # 1. Update family: remove route's original term 'matratze 140x200' from family
    # The route's original 2 circles MUST remain untouched and enabled = 1
    family_store.update_family(
        conn,
        fam_id,
        terms=[{"term": "Brother MFC-L2740DW", "enabled": 1}],
    )
    after_term_removal = cursor.execute(
        "SELECT search_id, location_id, label, radius_km, family_id "
        "FROM route_search_circles WHERE route_search_id = ? ORDER BY search_id",
        (route_id,),
    ).fetchall()
    for c in initial_circles:
        assert c in after_term_removal
    for sid in orig_sids:
        assert (
            cursor.execute(
                "SELECT enabled FROM searches WHERE id = ?", (sid,)
            ).fetchone()[0]
            == 1
        )

    # 2. Delete family completely
    # The route MUST retain exactly its original 2 circles and enabled = 1
    family_store.delete_family(conn, fam_id)
    final_circles = cursor.execute(
        "SELECT search_id, location_id, label, radius_km, family_id "
        "FROM route_search_circles WHERE route_search_id = ? ORDER BY search_id",
        (route_id,),
    ).fetchall()
    assert final_circles == initial_circles
    for sid in orig_sids:
        assert (
            cursor.execute(
                "SELECT enabled FROM searches WHERE id = ?", (sid,)
            ).fetchone()[0]
            == 1
        )
