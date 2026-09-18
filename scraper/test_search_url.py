import pytest
import search_url


MATRATZE = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/matratze-140x200/k0l7091r26"
)
NOTEBOOKS_NO_QUERY = "https://www.kleinanzeigen.de/s-notebooks/k0c278l6411"
PRICE_FILTER_NO_QUERY = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:100/k0l7091r31"
)
PRICE_FILTER_WITH_QUERY = (
    "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:60/"
    "ikea-brimnes-kleiderschrank/k0l13533r25"
)


def test_slugify_normalises_models_and_queries():
    assert search_url.slugify("Brother MFC-L2740DW") == "brother-mfc-l2740dw"
    assert search_url.slugify("matratze 140x200") == "matratze-140x200"
    assert (
        search_url.slugify("ikea brimnes kleiderschrank")
        == "ikea-brimnes-kleiderschrank"
    )
    assert (
        search_url.slugify("  HP LaserJet Pro MFP M426fdw!  ")
        == "hp-laserjet-pro-mfp-m426fdw"
    )
    assert search_url.slugify("Canon i-SENSYS MF426dw") == "canon-i-sensys-mf426dw"
    assert search_url.slugify("Kühlschrank Weiß") == "kuehlschrank-weiss"
    assert search_url.slugify("") == ""


def test_with_query_replaces_existing_keyword():
    """Measured on production searches: replacing the segment before the tail."""
    rewritten = search_url.with_query(MATRATZE, "Brother MFC-L2740DW")
    assert (
        rewritten
        == "https://www.kleinanzeigen.de/s-inning-am-ammersee/brother-mfc-l2740dw/k0l7091r26"
    )

    rewritten_filter = search_url.with_query(
        PRICE_FILTER_WITH_QUERY, "Brother MFC-L2740DW"
    )
    assert rewritten_filter == (
        "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:60/"
        "brother-mfc-l2740dw/k0l13533r25"
    )


def test_with_query_inserts_when_no_query_was_present():
    """When the segment before tail starts with 's-', it is an area/category root, not a term."""
    rewritten = search_url.with_query(NOTEBOOKS_NO_QUERY, "Brother MFC-L2740DW")
    assert (
        rewritten
        == "https://www.kleinanzeigen.de/s-notebooks/brother-mfc-l2740dw/k0c278l6411"
    )

    area_only = "https://www.kleinanzeigen.de/s-muenchen/k0l6411r10"
    assert (
        search_url.with_query(area_only, "laptop")
        == "https://www.kleinanzeigen.de/s-muenchen/laptop/k0l6411r10"
    )


def test_with_query_inserts_behind_facet_filter():
    """When the segment before tail contains ':', it is a filter facet (e.g. preis:10:100)."""
    rewritten = search_url.with_query(PRICE_FILTER_NO_QUERY, "brother-mfc-l2740dw")
    assert rewritten == (
        "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:100/"
        "brother-mfc-l2740dw/k0l7091r31"
    )

    provider_filter = "https://www.kleinanzeigen.de/s-augsburg/anbieter:privat/k0l7091"
    assert search_url.with_query(provider_filter, "Brother MFC-L2740DW") == (
        "https://www.kleinanzeigen.de/s-augsburg/anbieter:privat/brother-mfc-l2740dw/k0l7091"
    )


def test_broken_urls_and_empty_terms_are_refused():
    with pytest.raises(ValueError, match="rewriteable"):
        search_url.with_query("https://www.kleinanzeigen.de/s-notebooks/", "laptop")

    with pytest.raises(ValueError, match="empty search term"):
        search_url.with_query(MATRATZE, "")

    with pytest.raises(ValueError, match="empty search term"):
        search_url.with_query(MATRATZE, "   ")


def test_with_query_replaces_term_starting_with_s_dash():
    """Model names starting with s- (e.g. s-pen, s-line, s-works) are terms, not root slugs."""
    s_pen_url = "https://www.kleinanzeigen.de/s-muenchen/s-pen/k0l6411"
    rewritten = search_url.with_query(s_pen_url, "apple-pencil")
    assert rewritten == "https://www.kleinanzeigen.de/s-muenchen/apple-pencil/k0l6411"


def test_parse_price_extracts_filters():
    assert search_url.parse_price(PRICE_FILTER_NO_QUERY) == {"min": 10, "max": 100}
    assert search_url.parse_price(
        "https://www.kleinanzeigen.de/s-notebooks/preis::1500/rtx4060/k0c278"
    ) == {"min": None, "max": 1500}
    assert search_url.parse_price(
        "https://www.kleinanzeigen.de/s-landsberg/preis:50:/k0l7091"
    ) == {"min": 50, "max": None}
    assert search_url.parse_price(MATRATZE) is None


def test_with_price_inserts_updates_and_removes():
    # Insert when absent
    with_p = search_url.with_price(MATRATZE, 10, 100)
    assert (
        with_p
        == "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:10:100/matratze-140x200/k0l7091r26"
    )

    # Insert max price only
    with_max = search_url.with_price(MATRATZE, max_price=500)
    assert (
        with_max
        == "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis::500/matratze-140x200/k0l7091r26"
    )

    # Update existing price
    updated = search_url.with_price(PRICE_FILTER_WITH_QUERY, 20, 80)
    assert updated == (
        "https://www.kleinanzeigen.de/s-inning-am-ammersee/preis:20:80/"
        "ikea-brimnes-kleiderschrank/k0l13533r25"
    )

    # Remove price when both are None
    removed = search_url.with_price(PRICE_FILTER_WITH_QUERY, None, None)
    assert removed == (
        "https://www.kleinanzeigen.de/s-inning-am-ammersee/"
        "ikea-brimnes-kleiderschrank/k0l13533r25"
    )


def test_compose_and_decompose_search_url():
    drucker_url = "https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30"
    dec = search_url.decompose_search_url(drucker_url)
    assert dec == {
        "location_slug": "landsberg-am-lech",
        "location_id": "7091",
        "radius": 30,
        "min_price": None,
        "max_price": None,
        "query": "drucker",
        "category": None,
    }

    recomposed = search_url.compose_search_url(
        location_slug=dec["location_slug"],
        location_id=dec["location_id"],
        radius=dec["radius"],
        query=dec["query"],
    )
    assert recomposed == drucker_url

    with_price_url = search_url.compose_search_url(
        location_slug="landsberg-am-lech",
        location_id="7091",
        radius=30,
        min_price=10,
        max_price=150,
        query="drucker",
    )
    assert (
        with_price_url
        == "https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/drucker/k0l7091r30"
    )
    assert search_url.decompose_search_url(with_price_url) == {
        "location_slug": "landsberg-am-lech",
        "location_id": "7091",
        "radius": 30,
        "min_price": 10,
        "max_price": 150,
        "query": "drucker",
        "category": None,
    }
