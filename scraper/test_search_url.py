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
