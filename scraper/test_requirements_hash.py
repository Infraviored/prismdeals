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


def test_python_and_node_agree_on_german_requirements():
    """Umlauts, integral floats and mixed-case ids hash alike in both runtimes.

    They did not: Python escaped "grün" and kept 3200.0, Node sorted ids by
    locale -- a verdict written by the judge was invisible to every reader.
    """
    import json as _json
    import os
    import subprocess

    from requirements_hash import requirements_hash

    fields = [
        {"id": "größe", "buyer_wants": {"preferred": ["grün", "weiß"], "min": 3200.0}},
        {"id": "Zustand", "buyer_wants": {"match": True}},
        {"id": "akku", "buyer_wants": {"max": 1.5}},
    ]
    backend = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"
    )
    node = subprocess.run(
        [
            "node",
            "-e",
            "const {requirementsHash}=require('./db/requirements_hash');"
            "process.stdout.write(requirementsHash(JSON.parse(process.argv[1])))",
            _json.dumps(fields),
        ],
        cwd=backend,
        capture_output=True,
        text=True,
        check=True,
    )
    assert node.stdout == requirements_hash(fields)


def test_scoping_to_models_is_part_of_the_hash_as_in_node():
    from requirements_hash import requirements_hash

    scoped = [{"id": "own_km", "buyer_wants": {"max": 5000}, "applies_to": [12, 3]}]
    assert requirements_hash(scoped) == "b29ca27a7e004cba"
    assert (
        requirements_hash([{"id": "own_km", "buyer_wants": {"max": 5000}}])
        == "4632ad3d2c5a2fe2"
    )
