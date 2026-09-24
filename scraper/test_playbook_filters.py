"""Table-driven tests for playbook fields to taxonomy filters mapping."""

import json
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import playbook_filters  # noqa: E402
import playbooks  # noqa: E402

TAXONOMY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "kleinanzeigen_taxonomy.json",
)


@pytest.fixture(scope="module")
def taxonomy_category_filters():
    with open(TAXONOMY_PATH, encoding="utf-8") as f:
        data = json.load(f)
    mapping = {}
    for c in data.get("categories", []):
        cat_key = "c" + str(c["id"])
        mapping[cat_key] = {filt["key"]: filt for filt in c.get("filters", [])}
    return mapping


@pytest.mark.parametrize(
    "playbook_key", sorted(playbook_filters.PLAYBOOK_FIELD_TO_FILTER.keys())
)
def test_all_mapped_fields_exist_in_playbook(playbook_key):
    playbook = playbooks.get_playbook(playbook_key)
    assert playbook is not None, f"Playbook {playbook_key} does not exist"
    field_ids = {f["id"] for f in playbook.get("fields", [])}

    mapped = playbook_filters.PLAYBOOK_FIELD_TO_FILTER[playbook_key]
    for field_id in mapped.keys():
        assert field_id in field_ids, (
            f"Mapped field '{field_id}' does not exist in playbook '{playbook_key}'"
        )


@pytest.mark.parametrize(
    "playbook_key", sorted(playbook_filters.PLAYBOOK_FIELD_TO_FILTER.keys())
)
def test_all_mapped_filters_exist_in_taxonomy(playbook_key, taxonomy_category_filters):
    playbook = playbooks.get_playbook(playbook_key)
    assert playbook is not None
    cat_codes = playbook.get("category_codes", ())
    assert len(cat_codes) > 0, f"No category codes for {playbook_key}"

    # Gather all filter keys for all categories associated with this playbook
    available_filters = set()
    for code in cat_codes:
        available_filters.update(taxonomy_category_filters.get(code, {}).keys())

    mapped = playbook_filters.PLAYBOOK_FIELD_TO_FILTER[playbook_key]
    for field_id, filter_key in mapped.items():
        assert filter_key in available_filters, (
            f"Filter '{filter_key}' (mapped from {field_id}) not found in taxonomy for {cat_codes}"
        )


def test_motorcycle_playbook_filters_table():
    """Verify motorcycles c305 taxonomy filter mappings."""
    mapping = playbook_filters.PLAYBOOK_FIELD_TO_FILTER["vehicles/motorcycles"]
    expected = {
        "mileageKm": "motorraeder_roller.km_i",
        "firstRegistrationYear": "motorraeder_roller.ez_i",
        "displacementCcm": "motorraeder_roller.hubraum_i",
        "powerKw": "motorraeder_roller.leistung_i",
        "make": "motorraeder_roller.marke_s",
    }
    for field, filter_key in expected.items():
        assert mapping.get(field) == filter_key


def test_laptop_playbook_filters_table():
    """Verify laptops c278 taxonomy filter mappings."""
    mapping = playbook_filters.PLAYBOOK_FIELD_TO_FILTER["electronics/laptops"]
    assert mapping["ramGb"] == "notebooks.ram_s"
    assert mapping["screenInches"] == "notebooks.screen_size_s"
    assert mapping["storageGb"] == "notebooks.storage_s"
    assert mapping["modelYear"] == "notebooks.model_year_s"


def test_memory_keeps_its_product_line_askable():
    import playbook_filters

    # pc_zubehoer_software.art_s is "Speicher" vs "Monitore", not "Vengeance".
    assert "productLine" not in playbook_filters.taxonomy_filtered_field_ids(
        "computing/memory"
    )
    assert "mileageKm" in playbook_filters.taxonomy_filtered_field_ids(
        "vehicles/motorcycles"
    )
