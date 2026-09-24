"""Unit tests for scraper.requirements_hash."""

from requirements_hash import requirements_hash


def test_empty_or_none_returns_none():
    assert requirements_hash(None) is None
    assert requirements_hash([]) is None


def test_hash_determinism():
    fields = [
        {"id": "ramGb", "buyer_wants": {"min": 16}},
        {"id": "condition", "buyer_wants": {"match": "good"}},
    ]
    h1 = requirements_hash(fields)
    h2 = requirements_hash(fields)
    assert h1 is not None
    assert len(h1) == 16
    assert h1 == h2


def test_order_invariance():
    f1 = [
        {"id": "ramGb", "buyer_wants": {"min": 16}},
        {"id": "brand", "buyer_wants": {"match": "Corsair"}},
    ]
    f2 = [
        {"id": "brand", "buyer_wants": {"match": "Corsair"}},
        {"id": "ramGb", "buyer_wants": {"min": 16}},
    ]
    assert requirements_hash(f1) == requirements_hash(f2)


def test_ignores_non_buyer_wants_fields():
    # Only id and buyer_wants define the requirements version
    f1 = [
        {
            "id": "ramGb",
            "buyer_wants": {"min": 16},
            "importance": "high",
            "label": "RAM",
        },
    ]
    f2 = [
        {
            "id": "ramGb",
            "buyer_wants": {"min": 16},
            "importance": "low",
            "label": "Memory",
        },
    ]
    assert requirements_hash(f1) == requirements_hash(f2)


def test_differing_must_produces_differing_hash():
    f1 = [
        {"id": "ramGb", "buyer_wants": {"min": 16}},
    ]
    f2 = [
        {"id": "ramGb", "buyer_wants": {"min": 32}},
    ]
    assert requirements_hash(f1) != requirements_hash(f2)


def test_differing_field_set_produces_differing_hash():
    f1 = [
        {"id": "ramGb", "buyer_wants": {"min": 16}},
    ]
    f2 = [
        {"id": "ramGb", "buyer_wants": {"min": 16}},
        {"id": "brand", "buyer_wants": {"match": "Corsair"}},
    ]
    assert requirements_hash(f1) != requirements_hash(f2)
