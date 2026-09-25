"""Listing attributes from the page's embedded data (detail_params)."""

import os

import detail_params

PAGE = open(
    os.path.join(os.path.dirname(__file__), "testdata", "listing_bidder_params.html"),
    encoding="utf-8",
).read()


def test_a_motorcycle_page_gives_registration_mileage_and_more():
    details = detail_params.display_details(detail_params.bidder_params(PAGE))
    assert details["Erstzulassung"] == "Mai 2005"
    assert details["Kilometerstand"] == "13.000 km"
    assert details["Hubraum"] == "998 ccm"
    assert details["HU bis"] == "April 2027"
    assert details["Anbieter"] == "Privat"


def test_the_visible_list_wins_and_the_data_fills_gaps():
    merged = detail_params.merge_details({"Kilometerstand": "12.900 km"}, PAGE)
    assert merged["Kilometerstand"] == "12.900 km"
    assert merged["Erstzulassung"] == "Mai 2005"


def test_a_page_without_the_object_gives_nothing():
    assert detail_params.bidder_params("<html></html>") == {}
