"""What a buyer set up is what the scorer weighs.

The pipeline scored 10 of 1266 stored listings, all of them exactly 50, because
it refuses a listing whose knowledge set names no fields -- and all three stored
knowledge sets are empty objects, written by a wizard that never filled them.

Two vocabularies meet in this module and neither is the other's. The tests below
exist because every mismatch between them fails silently: a filter key that does
not exist produces no intent, and a value the playbook's enum does not contain
scores half marks whatever the listing says.
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import intent_from_filters  # noqa: E402
import playbooks  # noqa: E402
import search_url  # noqa: E402

LAPTOPS = playbooks.get_playbook("electronics/laptops")
CARS = playbooks.get_playbook("vehicles/cars")

TAXONOMY = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "kleinanzeigen_taxonomy.json",
)


def _taxonomy_keys():
    with open(TAXONOMY, encoding="utf-8") as handle:
        data = json.load(handle)
    keys = {}
    for category in data["categories"]:
        for f in category.get("filters", []):
            keys.setdefault(f["key"], [o["value"] for o in (f.get("options") or [])])
    return keys


# --- The guard against silent mismatches ----------------------------------


@pytest.mark.parametrize("playbook_key", sorted(intent_from_filters.FILTER_TO_FIELD))
def test_every_mapping_names_a_filter_the_site_really_offers(playbook_key):
    """A renamed or invented filter key produces no intent and no error.

    Three of the original entries were wrong this way -- handy_telekom.brand_s,
    handy_telekom.storage_s and autos.baujahr_i do not exist -- so two of the
    three categories silently kept skipping every listing.
    """
    known = _taxonomy_keys()
    for filter_key in intent_from_filters.FILTER_TO_FIELD[playbook_key]:
        assert filter_key in known, f"{playbook_key}: no such filter {filter_key}"


@pytest.mark.parametrize("playbook_key", sorted(intent_from_filters.FILTER_TO_FIELD))
def test_every_mapping_names_a_field_the_playbook_really_has(playbook_key):
    playbook = playbooks.get_playbook(playbook_key)
    assert playbook, f"no playbook {playbook_key}"
    ids = {f["id"] for f in playbook["fields"]}
    for filter_key, field_id in intent_from_filters.FILTER_TO_FIELD[
        playbook_key
    ].items():
        assert field_id in ids, (
            f"{playbook_key}: no field {field_id} (from {filter_key})"
        )


def test_every_condition_the_site_emits_has_a_word_in_every_playbook():
    """Otherwise a buyer's condition filter quietly scores half marks."""
    site_values = _taxonomy_keys()["global.zustand"]
    for options, table in intent_from_filters.CONDITION_VALUES.items():
        for value in site_values:
            assert value in table, f"{options}: no translation for {value}"
            assert table[value] is not None


# --- Numbers, where reading the shape wrong inverts the meaning ------------


def test_a_terabyte_is_not_one_gigabyte():
    """ "1tb" carries the same digit as "1gb" and means a thousand times more.
    Read as 1, a 128 GB machine satisfies a buyer who asked for a terabyte."""
    fields = intent_from_filters.intent_fields(LAPTOPS, ["notebooks.storage_s:1tb"])
    assert fields[0]["buyer_wants"] == {"min": 1024.0}


def test_an_upper_bound_stays_an_upper_bound():
    """ "up_to_12" read as a minimum is exactly backwards: an 11-inch laptop
    would score zero and a 17-inch one full marks."""
    fields = intent_from_filters.intent_fields(
        LAPTOPS, ["notebooks.screen_size_s:up_to_12"]
    )
    assert fields[0]["buyer_wants"] == {"max": 12.0}


def test_a_range_keeps_both_ends():
    """A mileage cap of 80,000 km read as a floor of 10,000 lets a 300,000 km
    car score full marks."""
    fields = intent_from_filters.intent_fields(CARS, ["autos.km_i:10000,80000"])
    assert fields[0]["buyer_wants"] == {"min": 10000.0, "max": 80000.0}


def test_a_plain_size_is_a_lower_bound():
    """Nobody filters for "exactly 16 GB and no more"."""
    fields = intent_from_filters.intent_fields(LAPTOPS, ["notebooks.ram_s:16gb"])
    assert fields[0]["buyer_wants"] == {"min": 16.0}


def test_a_decimal_slug_gives_up_its_number():
    fields = intent_from_filters.intent_fields(
        LAPTOPS, ["notebooks.screen_size_s:15_6_zoll"]
    )
    assert fields[0]["buyer_wants"] == {"min": 15.6}


# --- Vocabulary, where using the wrong word does nothing at all ------------


def test_the_site_s_condition_is_translated_into_the_playbook_s_words():
    fields = intent_from_filters.intent_fields(LAPTOPS, ["global.zustand:like_new"])
    assert fields[0]["buyer_wants"] == {"preferred": ["neuwertig"]}
    assert (
        fields[0]["buyer_wants"]["preferred"][0]
        in [f for f in LAPTOPS["fields"] if f["id"] == "conditionGrade"][0]["options"]
    )


def test_each_field_type_gets_the_vocabulary_scoring_actually_reads():
    """scoring.py reads `min` on a number, `preferred` on an enum and `present`
    on text. Writing `match` on a text field is silently ignored."""
    fields = intent_from_filters.intent_fields(
        LAPTOPS,
        ["notebooks.ram_s:16gb", "global.zustand:ok", "notebooks.brand_s:apple"],
    )
    wants = {f["id"]: f["buyer_wants"] for f in fields}
    assert wants["ramGb"] == {"min": 16.0}
    assert wants["conditionGrade"] == {"preferred": ["gut"]}
    assert wants["brand"] == {"present": True}


def test_a_value_the_playbook_enum_does_not_contain_is_dropped():
    """Better no intent for the field than one that can never be satisfied."""
    assert intent_from_filters.intent_fields(LAPTOPS, ["global.zustand:erfunden"]) == []


def test_a_filter_the_playbook_does_not_model_is_dropped_not_invented():
    assert intent_from_filters.intent_fields(LAPTOPS, ["notebooks.versand_s:ja"]) == []


# --- Whole searches --------------------------------------------------------


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
        "+notebooks.ram_s:16gb+global.zustand:ok",
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
