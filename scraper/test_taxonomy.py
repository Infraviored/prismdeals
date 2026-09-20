"""Unit tests for Kleinanzeigen taxonomy and filter harvesting."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_taxonomy_data():
    json_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "kleinanzeigen_taxonomy.json",
    )
    assert os.path.exists(json_path), f"Taxonomy JSON file not found at {json_path}"
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_taxonomy_structure_and_stats():
    data = get_taxonomy_data()
    assert data.get("version") == "1.0"
    assert "generated_at" in data
    assert "stats" in data
    assert data["stats"]["total_categories"] >= 150
    assert data["stats"]["categories_with_filters"] >= 150
    assert "global_filters" in data
    assert "url_grammar" in data
    assert len(data["categories"]) == data["stats"]["total_categories"]


def test_global_filters_completeness():
    data = get_taxonomy_data()
    gf = data["global_filters"]
    assert "price" in gf
    assert "poster_type" in gf
    assert "ad_type" in gf
    assert "direct_buy" in gf
    assert "carrier" in gf
    assert gf["price"]["url_syntax"] == "/preis:{min}:{max}/"
    assert gf["poster_type"]["url_syntax"] == "/anbieter:{value}/"


def test_notebooks_category_depth():
    data = get_taxonomy_data()
    cats = {c["id"]: c for c in data["categories"]}

    assert "278" in cats
    nb = cats["278"]
    assert nb["slug"] == "notebooks"
    assert "Laptops" in nb["name"] or "Notebooks" in nb["name"]
    assert nb["parent_id"] == "161"
    assert "Elektronik" in nb["breadcrumbs"][0]

    filter_keys = {f["key"] for f in nb["filters"]}
    expected_keys = {
        "notebooks.type_s",
        "notebooks.brand_s",
        "notebooks.operating_system_s",
        "notebooks.screen_size_s",
        "notebooks.model_year_s",
        "notebooks.processor_s",
        "notebooks.ram_s",
        "notebooks.storage_s",
        "notebooks.versand_s",
        "global.farbe",
        "global.zustand",
        "preis",
        "direktkaufen",
        "anbieter",
        "anzeige",
        "paketdienst",
    }
    assert expected_keys.issubset(filter_keys)

    # Check specific values
    brands = next(f for f in nb["filters"] if f["key"] == "notebooks.brand_s")
    brand_vals = {o["value"] for o in brands["options"]}
    assert {"apple", "lenovo", "hp", "dell", "asus"}.issubset(brand_vals)

    ram = next(f for f in nb["filters"] if f["key"] == "notebooks.ram_s")
    ram_vals = {o["value"] for o in ram["options"]}
    assert {"8gb", "16gb", "32gb"}.issubset(ram_vals)


def test_bedroom_and_wardrobe_category_depth():
    data = get_taxonomy_data()
    cats = {c["id"]: c for c in data["categories"]}

    assert "81" in cats
    bedroom = cats["81"]
    assert bedroom["parent_id"] == "80"
    assert "Haus & Garten" in bedroom["breadcrumbs"][0]

    art_filter = next(f for f in bedroom["filters"] if f["key"] == "schlafzimmer.art_s")
    art_vals = {o["value"] for o in art_filter["options"]}
    assert {"schraenke", "matratzen", "betten", "lattenroste", "nachttische"}.issubset(
        art_vals
    )

    material = next(f for f in bedroom["filters"] if f["key"] == "global.material")
    mat_vals = {o["value"] for o in material["options"]}
    assert {"wood", "solid_wood", "fabric", "metal", "glass"}.issubset(mat_vals)


def test_pc_accessories_and_printers_depth():
    data = get_taxonomy_data()
    cats = {c["id"]: c for c in data["categories"]}

    assert "225" in cats
    pc_acc = cats["225"]
    assert pc_acc["parent_id"] == "161"

    art_filter = next(
        f for f in pc_acc["filters"] if f["key"] == "pc_zubehoer_software.art_s"
    )
    art_vals = {o["value"] for o in art_filter["options"]}
    assert "drucker_scanner" in art_vals


def test_car_and_real_estate_advanced_filters():
    data = get_taxonomy_data()
    cats = {c["id"]: c for c in data["categories"]}

    # Autos
    assert "216" in cats
    autos = cats["216"]
    auto_keys = {f["key"] for f in autos["filters"]}
    assert "autos.marke_s" in auto_keys
    assert "autos.km_i" in auto_keys
    assert "autos.ez_i" in auto_keys
    assert "autos.air_conditioning_b" in auto_keys
    assert "autos.trailer_coupling_b" in auto_keys

    # Mietwohnungen
    assert "203" in cats
    flats = cats["203"]
    flat_keys = {f["key"] for f in flats["filters"]}
    assert "wohnung_mieten.qm_d" in flat_keys
    assert "wohnung_mieten.zimmer_d" in flat_keys
    assert "wohnung_mieten.wohnungstyp_s" in flat_keys
    assert "wohnung_mieten.furnished_b" in flat_keys
