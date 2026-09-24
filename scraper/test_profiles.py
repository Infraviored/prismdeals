import pytest

import profiles

CORSAIR = (
    "https://www.kleinanzeigen.de/s-anzeige/"
    "corsair-vengeance-arbeitsspeicher-rgb-pro-32gb-2x16gb-/3517306856-225-8308"
)
NOTEBOOKS = "https://www.kleinanzeigen.de/s-notebooks/k0c278l6411"
ALL_CATEGORIES = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/matratze-140x200/k0l7091r26"
)
WITH_FILTERS = (
    "https://www.kleinanzeigen.de/s-muenchen/preis:100:500/"
    "thinkpad/k0c278l6411r30+notebooks.ram_s:16gb"
)


def test_every_category_of_the_taxonomy_has_a_profile():
    missing = [
        (cid, c["name"])
        for cid, c in profiles.taxonomy().items()
        if profiles.profile_for_category(cid) is None
    ]
    assert missing == []


def test_every_assigned_id_exists_in_the_taxonomy():
    # A typo in the table would otherwise silently assign nothing.
    assert set(profiles.CATEGORY_PROFILE) <= set(profiles.taxonomy())


def test_no_category_is_assigned_twice():
    ids = [c for cats in profiles._ASSIGNMENTS.values() for c in cats]
    assert len(ids) == len(set(ids))


def test_listing_url_states_its_category():
    assert profiles.category_from_url(CORSAIR) == "225"
    assert profiles.profile_for_category("225").key == "spec"


def test_search_url_category_is_read_from_the_tail():
    assert profiles.category_from_url(NOTEBOOKS) == "278"
    assert profiles.category_from_url(WITH_FILTERS) == "278"


def test_search_over_all_categories_has_none():
    assert profiles.category_from_url(ALL_CATEGORIES) is None


def test_a_c_inside_a_slug_is_not_a_category():
    # "c64" is no Kleinanzeigen category; the real one is in the tail.
    url = "https://www.kleinanzeigen.de/s-commodore-c64/k0c234"
    assert profiles.category_from_url(url) == "234"
    # And a search over all categories stays without one, however its query reads.
    url = "https://www.kleinanzeigen.de/s-muenchen/commodore-c64/k0l6411"
    assert profiles.category_from_url(url) is None


@pytest.mark.parametrize(
    "url",
    [
        # Model numbers that are also real category ids: 220 campers, 25 prams, 23 toys.
        "https://www.kleinanzeigen.de/s-mercedes-c220/k0",
        "https://www.kleinanzeigen.de/s-muenchen/c220/k0l6411",
        "https://www.kleinanzeigen.de/s-muenchen/sony-a7-c25/k0l6411r50",
        "https://www.kleinanzeigen.de/s-c23-roller/k0",
    ],
)
def test_a_model_number_that_is_also_a_category_id_is_not_one(url):
    assert profiles.category_from_url(url) is None


def test_the_category_page_form_is_read():
    # The taxonomy's own url_path form, "/s-<slug>/c<id>".
    assert (
        profiles.category_from_url(
            "https://www.kleinanzeigen.de/s-familie-kind-baby/c17"
        )
        == "17"
    )


def test_children_inherit_their_branch():
    # Mietwohnungen (c203) is not listed itself; Immobilien (c195) is.
    assert "203" not in profiles.CATEGORY_PROFILE
    profile = profiles.profile_for_category("203")
    assert profile.key == "out_of_scope"
    assert profile.judged is False


def test_listing_wins_over_search():
    # A search over all categories found a RAM kit: the listing decides.
    profile, category, source = profiles.profile_for(
        listing_url=CORSAIR, search_url=ALL_CATEGORIES
    )
    assert (profile.key, category, source) == ("spec", "225", "listing")
    # Even when the search names a different category, the listing knows better.
    profile, category, source = profiles.profile_for(
        listing_url=CORSAIR, search_url=NOTEBOOKS
    )
    assert (profile.key, category, source) == ("spec", "225", "listing")


def test_search_is_the_fallback():
    profile, category, source = profiles.profile_for(search_url=NOTEBOOKS)
    assert (profile.key, category, source) == ("performance_tech", "278", "search")


def test_nothing_known_means_open():
    profile, category, source = profiles.profile_for(search_url=ALL_CATEGORIES)
    assert (profile.key, category, source) == ("open", None, None)


def test_unknown_category_is_not_guessed():
    assert profiles.profile_for_category("99999") is None
    assert profiles.profile_for_category(None) is None


@pytest.mark.parametrize(
    "category, key",
    [
        ("305", "vehicle"),  # Motorräder
        ("81", "large_furniture"),  # Schlafzimmer, also where mattresses are filed
        ("278", "performance_tech"),  # Laptops
        ("157", "collectible"),  # Uhren & Schmuck
        ("21", "hygiene_safety"),  # Kindersitze
    ],
)
def test_the_examples_of_the_product_core(category, key):
    assert profiles.profile_for_category(category).key == key


def test_research_depth_follows_the_profile():
    assert profiles.PROFILES["vehicle"].research == "deep"
    assert profiles.PROFILES["large_furniture"].research_headings == ()
    assert "Quellen" in profiles.PROFILES["vehicle"].research_headings
    for p in profiles.PROFILES.values():
        assert len(p.weights) == len(profiles.AXES)
        if p.research_headings:
            assert p.research_headings[-1] == "Quellen"


def test_backend_copy_of_the_profiles_is_current():
    """The backend weighs listings from backend/db/profiles.json. Regenerate it
    with `python scraper/profiles.py --export > backend/db/profiles.json`."""
    import json
    import os

    path = os.path.join(
        os.path.dirname(profiles.TAXONOMY_PATH), "..", "backend", "db", "profiles.json"
    )
    with open(path, encoding="utf-8") as f:
        assert json.load(f) == json.loads(json.dumps(profiles.export()))
