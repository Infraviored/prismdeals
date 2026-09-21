"""What a buyer set up is what the scorer weighs.

The pipeline scored 10 of 1266 stored listings, all of them exactly 50, because
it refuses a listing whose knowledge set names no fields -- and all three stored
knowledge sets are empty objects, written by a wizard that never filled them.

The intent does not need a wizard. Somebody who picks Notebooks and sets
"16 GB, condition good" has said what matters, and it rides in the search URL.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import intent_from_filters  # noqa: E402
import playbooks  # noqa: E402
import search_url  # noqa: E402

LAPTOPS = playbooks.get_playbook("electronics/laptops")


def test_a_number_filter_becomes_a_lower_bound():
    """Nobody filters for "exactly 16 GB and no more"."""
    fields = intent_from_filters.intent_fields(LAPTOPS, ["notebooks.ram_s:16gb"])
    assert fields == [
        {"id": "ramGb", "importance": "high", "buyer_wants": {"min": 16.0}}
    ]


def test_a_size_slug_gives_up_its_number():
    fields = intent_from_filters.intent_fields(
        LAPTOPS, ["notebooks.screen_size_s:15_6_zoll"]
    )
    assert fields[0]["buyer_wants"] == {"min": 15.6}


def test_each_field_type_gets_the_vocabulary_scoring_actually_reads():
    """scoring.py reads `min` on a number, `preferred` on an enum and `present`
    on text. Writing `match` on a text field is silently ignored, which is how a
    brand preference can look set and do nothing."""
    fields = intent_from_filters.intent_fields(
        LAPTOPS,
        ["notebooks.ram_s:16gb", "global.zustand:gut", "notebooks.brand_s:apple"],
    )
    wants = {f["id"]: f["buyer_wants"] for f in fields}
    assert wants["ramGb"] == {"min": 16.0}
    assert wants["conditionGrade"] == {"preferred": ["gut"]}
    assert wants["brand"] == {"present": True}


def test_a_filter_the_playbook_does_not_model_is_dropped_not_invented():
    """Kleinanzeigen still applies it when the search runs; it just has no fact
    to be scored against."""
    fields = intent_from_filters.intent_fields(LAPTOPS, ["notebooks.versand_s:versand"])
    assert fields == []


def test_a_search_without_filters_yields_no_intent():
    intent = intent_from_filters.intent_for_search(
        LAPTOPS,
        "https://www.kleinanzeigen.de/s-muenchen/laptop/k0c278l6411r30",
        search_url.parse_tail,
    )
    assert intent["fields"] == []


def test_a_filtered_search_yields_the_intent_it_expresses():
    intent = intent_from_filters.intent_for_search(
        LAPTOPS,
        "https://www.kleinanzeigen.de/s-muenchen/laptop/k0c278l6411r30"
        "+notebooks.ram_s:16gb+global.zustand:gut",
        search_url.parse_tail,
    )
    assert [f["id"] for f in intent["fields"]] == ["ramGb", "conditionGrade"]
    assert intent["dimensions_enabled"] is False


def test_the_same_field_twice_is_taken_once():
    fields = intent_from_filters.intent_fields(
        LAPTOPS, ["notebooks.ram_s:8gb", "notebooks.ram_s:16gb"]
    )
    assert len(fields) == 1


def test_nothing_at_all_is_answered_with_nothing():
    assert intent_from_filters.intent_fields(None, ["notebooks.ram_s:16gb"]) == []
    assert intent_from_filters.intent_fields(LAPTOPS, []) == []
    assert intent_from_filters.intent_fields(LAPTOPS, ["malformed"]) == []
