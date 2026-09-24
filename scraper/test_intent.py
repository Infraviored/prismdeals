"""Tests for intent parsing and post-processing (Package P4).

Asserts post-processing invariants over 20 recorded utterances replayed offline:
  - Exact intent_json contract shape
  - hunt_type validation against VALID_HUNT_TYPES enum
  - Confidence bounded in [0.0, 1.0]
  - Filter mapping to Kleinanzeigen taxonomy keys
  - Unmapped filters becoming musts
  - Budget verification: never inventing a budget
  - Offline fallback without model
"""

import json
import os
import sys
import pytest

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_CURRENT_DIR)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

from intent import (
    fallback_intent,
    parse_intent,
)
from intent_taxonomy import (
    VALID_HUNT_TYPES,
    find_category,
    map_filters_to_taxonomy,
)

FIXTURES_PATH = os.path.join(_CURRENT_DIR, "testdata", "intent_fixtures.json")


def load_fixtures():
    with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_fixture_file_has_20_utterances():
    fixtures = load_fixtures()
    assert len(fixtures) == 20
    # Must span RAM, motorcycles (models and class), laptops, mattress, wardrobe, armchair, tools, kids' bike, child seat, TV
    required_keys = [
        "ram_corsair",
        "motorcycle_models",
        "motorcycle_class",
        "laptop_oled",
        "mattress_fit",
        "wardrobe_fit",
        "armchair_taste",
        "tools_opportunity",
        "kids_bike_fit",
        "child_seat_fit",
        "tv_features",
    ]
    for k in required_keys:
        assert k in fixtures, f"Missing required utterance fixture: {k}"


@pytest.mark.parametrize("fixture_id", list(load_fixtures().keys()))
def test_fixture_replay_post_processing(fixture_id):
    """Replays each recorded raw LLM response offline and asserts post-processing."""
    fixtures = load_fixtures()
    entry = fixtures[fixture_id]

    text = entry["text"]
    cat = entry["category"]
    raw_resp = entry["raw_response"]

    # Replay offline using the recorded raw LLM completion
    intent = parse_intent(text, category=cat, raw_response_override=raw_resp)

    # 1. Contract keys
    expected_keys = {
        "text",
        "hunt_type",
        "confidence",
        "class",
        "models",
        "musts",
        "prefs",
        "filters",
        "use",
        "sizes",
        "budget",
    }
    assert set(intent.keys()) == expected_keys

    # 2. hunt_type validity
    assert intent["hunt_type"] in VALID_HUNT_TYPES

    # 3. Confidence range
    assert isinstance(intent["confidence"], (int, float))
    assert 0.0 <= intent["confidence"] <= 1.0

    # 4. Musts structure
    assert isinstance(intent["musts"], list)
    for m in intent["musts"]:
        assert isinstance(m, dict)
        assert "id" in m and "label" in m and "type" in m and "want" in m
        assert m["type"] in ("number", "enum", "boolean", "text")
        assert isinstance(m["want"], dict)

    # 5. Prefs structure
    assert isinstance(intent["prefs"], list)

    # 6. Models structure
    assert isinstance(intent["models"], list)

    # 7. Budget structure
    if intent["budget"] is not None:
        assert isinstance(intent["budget"], dict)
        assert "min" in intent["budget"] and "max" in intent["budget"]

    # 8. Filter taxonomy mapping: all keys in filters must belong to category or global
    cat_info = find_category(cat)
    cat_filter_keys = (
        {f["key"] for f in cat_info.get("filters", [])} if cat_info else set()
    )
    global_keys = {
        "preis",
        "global.zustand",
        "global.farbe",
        "anbieter",
        "anzeige",
        "direktkaufen",
        "paketdienst",
    }
    allowed_keys = cat_filter_keys | global_keys

    for flt_k in intent["filters"]:
        assert flt_k in allowed_keys, (
            f"Filter {flt_k} was not mapped to allowed taxonomy keys"
        )


def test_budget_never_invented():
    """Plan rule: never invent a budget if not mentioned in original text."""
    text_without_budget = "Vintage Sessel Mid-Century Leder braun"

    # LLM hallucinating a budget
    hallucinated_output = {
        "hunt_type": "taste",
        "confidence": 0.9,
        "class": None,
        "models": [],
        "musts": [],
        "prefs": [],
        "filters": {},
        "use": [],
        "sizes": {},
        "budget": {"min": None, "max": 250},  # Hallucinated!
    }

    intent = parse_intent(
        text_without_budget,
        category="88",
        raw_response_override=json.dumps(hallucinated_output),
    )
    assert intent["budget"] is None, (
        "Hallucinated budget was not stripped by budget guard"
    )

    # With actual budget in text
    text_with_budget = "Vintage Sessel Mid-Century Leder braun bis 250 €"
    intent_valid = parse_intent(
        text_with_budget,
        category="88",
        raw_response_override=json.dumps(hallucinated_output),
    )
    assert intent_valid["budget"] == {"min": None, "max": 250}


def test_unknown_filters_become_musts():
    """Plan rule: unknown filters that cannot be mapped to taxonomy become musts."""
    cat_info = find_category("278")  # Notebooks category

    raw_filters = {
        "ram": "32 GB",  # Known -> notebooks.ram_s
        "watercooled": True,  # Unknown filter on laptops -> must
        "custom_paint": "midnight",  # Unknown filter on laptops -> must
    }

    mapped, extra_musts = map_filters_to_taxonomy(raw_filters, cat_info)

    assert "notebooks.ram_s" in mapped
    assert "watercooled" not in mapped
    assert "custom_paint" not in mapped

    assert len(extra_musts) == 2
    must_ids = {m["id"] for m in extra_musts}
    assert "filter_watercooled" in must_ids
    assert "filter_custom_paint" in must_ids

    water_must = next(m for m in extra_musts if m["id"] == "filter_watercooled")
    assert water_must["type"] == "boolean"
    assert water_must["want"] == {"present": True}


def test_hunt_type_invalid_enum_falls_back():
    """Invalid hunt_type enum falls back to category default."""
    bad_output = {
        "hunt_type": "unknown_fantasy_type",
        "confidence": 0.9,
        "class": None,
        "models": [],
        "musts": [],
        "prefs": [],
        "filters": {},
        "use": [],
        "sizes": {},
        "budget": None,
    }
    intent = parse_intent(
        "Lenovo ThinkPad",
        category="278",
        raw_response_override=json.dumps(bad_output),
    )
    assert intent["hunt_type"] == "features"  # category 278 default


def test_fallback_without_model():
    """Deterministic fallback handles category defaults and keyword constraints."""
    # RAM kit -> exact
    res_ram = fallback_intent(
        "Corsair 2x16 GB DDR4-3200 CL16 bis 150 €", category="225"
    )
    assert res_ram["hunt_type"] == "exact"
    assert res_ram["budget"] == {"min": None, "max": 150}
    assert any(
        m["id"] == "dimensions" and m["want"]["match"] == "2x16"
        for m in res_ram["musts"]
    )

    # Wardrobe -> fit
    res_wardrobe = fallback_intent("Kleiderschrank 120 cm breit", category="81")
    assert res_wardrobe["hunt_type"] == "fit"
    assert any(
        m["id"] == "size_cm" and m["want"]["max"] == 120.0
        for m in res_wardrobe["musts"]
    )

    # Supersportler -> class
    res_moto = fallback_intent("1000cc Supersportler bis 7000 €", category="305")
    assert res_moto["hunt_type"] == "class"
    assert res_moto["budget"] == {"min": None, "max": 7000}

    # Two models with 'oder' -> shortlist
    res_shortlist = fallback_intent("Yamaha R1 oder Honda CBR1000RR", category="305")
    assert res_shortlist["hunt_type"] == "shortlist"


def test_a_budget_the_buyer_never_typed_is_dropped():
    from intent import verify_and_sanitize_budget

    # The text says "bis" and "€", but not 9000.
    assert verify_and_sanitize_budget({"max": 9000}, "R1 bis 7.000 €") is None
    assert verify_and_sanitize_budget({"max": 7000}, "R1 bis 7.000 €") == {
        "min": None,
        "max": 7000,
    }
    assert verify_and_sanitize_budget({"max": 7000}, "R1 bis 7k") == {
        "min": None,
        "max": 7000,
    }


def test_malformed_musts_from_the_model_are_dropped():
    from intent import sanitize_requirements

    kept = sanitize_requirements(
        [
            {"id": "ramGb", "label": "RAM", "type": "number", "want": {"min": 32}},
            {"label": "no id", "want": {"min": 1}},
            {"id": "x", "label": "no want"},
            "OLED",
        ]
    )
    assert [m["id"] for m in kept] == ["ramGb"]
