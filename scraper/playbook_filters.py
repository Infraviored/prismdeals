"""Mapping between category playbook fields and Kleinanzeigen taxonomy filters.

Kleinanzeigen supports URL-level filtering on specific attributes (e.g. `km_i`, `ez_i`,
`ram_s`, `brand_s`). Where such a filter exists on the site, the field belongs to
the search URL and should NOT be asked as a manual requirement in the requirements
sheet.

This module provides the canonical mapping and helper functions to:
1. Identify fields that should be excluded from requirements sheets.
2. Translate between playbook field IDs and taxonomy filter keys.
"""

import json
import os

_MAPPINGS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "playbook_filters.json",
)


def _load_mappings():
    if os.path.exists(_MAPPINGS_FILE):
        try:
            with open(_MAPPINGS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                return data.get("mappings", {})
        except Exception:
            pass
    # Static fallback
    return {
        "vehicles/motorcycles": {
            "mileageKm": "motorraeder_roller.km_i",
            "firstRegistrationYear": "motorraeder_roller.ez_i",
            "displacementCcm": "motorraeder_roller.hubraum_i",
            "powerKw": "motorraeder_roller.leistung_i",
            "make": "motorraeder_roller.marke_s",
        },
        "electronics/laptops": {
            "ramGb": "notebooks.ram_s",
            "screenInches": "notebooks.screen_size_s",
            "modelYear": "notebooks.model_year_s",
            "storageGb": "notebooks.storage_s",
            "cpuModel": "notebooks.processor_s",
            "brand": "notebooks.brand_s",
            "conditionGrade": "global.zustand",
        },
        "vehicles/cars": {
            "make": "autos.marke_s",
            "mileageKm": "autos.km_i",
            "firstRegistrationYear": "autos.ez_i",
            "powerKw": "autos.power_i",
            "transmission": "autos.shift_s",
            "fuelType": "autos.fuel_s",
            "tuvUntil": "autos.tuevy_i",
            "serviceHistoryDocumented": "autos.full_service_history_b",
            "accidentFree": "autos.schaden_s",
        },
        "electronics/phones": {
            "brand": "handy_telekom.art_s",
            "conditionGrade": "global.zustand",
        },
        "computing/memory": {
            "productLine": "pc_zubehoer_software.art_s",
            "conditionGrade": "global.zustand",
        },
    }


PLAYBOOK_FIELD_TO_FILTER = _load_mappings()

# Inverted mapping: playbook_key -> {filter_key: field_id}
FILTER_TO_FIELD = {
    pb_key: {filter_key: field_id for field_id, filter_key in fields.items()}
    for pb_key, fields in PLAYBOOK_FIELD_TO_FILTER.items()
}


def taxonomy_filtered_field_ids(playbook_key):
    """Field IDs the search URL can filter on, so the sheet does not ask them.

    A `*.art_s` filter is the site's sub-category ("Speicher" among
    "Grafikkarten", "Monitore"), not the field's value: memory's productLine
    ("Vengeance") mapped there, and the Corsair hunt lost its product-line
    requirement from the sheet. Those stay askable.
    """
    return {
        field_id
        for field_id, filter_key in PLAYBOOK_FIELD_TO_FILTER.get(
            playbook_key, {}
        ).items()
        if not filter_key.endswith(".art_s") or playbook_key == "electronics/phones"
    }


def filter_for_field(playbook_key, field_id):
    """Returns the taxonomy filter key for a playbook field ID, or None."""
    return PLAYBOOK_FIELD_TO_FILTER.get(playbook_key, {}).get(field_id)


def field_for_filter(playbook_key, filter_key):
    """Returns the playbook field ID for a taxonomy filter key, or None."""
    return FILTER_TO_FIELD.get(playbook_key, {}).get(filter_key)
