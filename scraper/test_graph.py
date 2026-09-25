"""The product graph: taxonomy root, placing, aliases, inherited attributes."""

import sqlite3

import pytest

import db_schema
from graph import place, readers, store, taxonomy


@pytest.fixture(scope="module")
def seeded():
    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    return conn


def _cbr_answer(prompt):
    assert "Honda CBR 1000 RR SC59" in prompt
    return {
        "path": [
            {"name": "Honda", "kind": "brand", "aliases": ["honda"]},
            {
                "name": "CBR 1000 RR",
                "kind": "model",
                "aliases": ["cbr1000rr", "Fireblade"],
                "years": [2004, 2016],
            },
            {
                "name": "SC59",
                "kind": "generation",
                "aliases": ["SC 59"],
                "years": [2008, 2011],
            },
        ],
        "attributes": [
            {
                "id": "ABS",
                "label": "ABS",
                "type": "boolean",
                "readers": ["keywords:abs"],
                "at": 1,
            },
            {
                "id": "bad",
                "label": "x",
                "type": "number",
                "readers": ["regex:(unclosed"],
                "at": 0,
            },
        ],
    }


def test_the_taxonomy_is_the_root_layer(seeded):
    moto = taxonomy.category_node_id(seeded, "305")
    assert [n["name"] for n in store.ancestors(seeded, moto)] == [
        "Auto, Rad & Boot",
        "Motorräder & Motorroller",
    ]
    km = store.effective_attributes(seeded, moto)["km"]
    assert km["readers"] == ["details:Kilometerstand"]
    assert km["site_filter"] == "motorraeder_roller.km_i"


def test_placing_builds_the_path_and_names_it(seeded):
    sc59 = place.place(seeded, "Honda CBR 1000 RR SC59", "305", ask=_cbr_answer)
    node = store.node(seeded, sc59)
    assert node["key"] == "auto-rad-boot/motorraeder-roller/honda/cbr-1000-rr/sc59"
    assert (node["years_from"], node["years_to"], node["status"]) == (
        2008,
        2011,
        "proposed",
    )
    info = place.describe(seeded, sc59)
    assert info["name"] == "Honda CBR 1000 RR SC59"
    model = store.node(seeded, node["parent_id"])
    assert "cbr1000rr" in store.aliases(seeded, model["id"])
    attrs = store.effective_attributes(seeded, sc59)
    assert attrs["abs"]["readers"] == ["keywords:abs"]  # inherited from the model
    assert "bad" not in attrs  # a pattern that does not compile is dropped
    assert "km" in attrs  # the category's, inherited


def test_a_known_name_costs_no_model_call(seeded):
    place.place(seeded, "Honda CBR 1000 RR SC59", "305", ask=_cbr_answer)

    def never(prompt):
        raise AssertionError("asked the model for a known node")

    again = place.place(seeded, "honda cbr1000rr sc59", "305", ask=never)
    assert store.node(seeded, again)["name"] == "SC59"


def test_readers_read_details_numbers_and_denials():
    km = {
        "type": "number",
        "label": "Kilometerstand",
        "readers": ["details:Kilometerstand"],
        "absent": None,
    }
    ez = {
        "type": "number",
        "label": "Erstzulassungsjahr",
        "readers": ["details:Erstzulassungsjahr"],
        "absent": None,
    }
    abs_ = {
        "type": "boolean",
        "label": "ABS",
        "readers": ["keywords:abs"],
        "absent": None,
    }
    cl = {
        "type": "number",
        "label": "CL",
        "readers": [r"regex:\bCL\s?(\d{2})\b"],
        "absent": None,
    }
    listing = {
        "title": "Honda CBR 1000 RR SC59, ohne ABS",
        "description": "Kit 2x16GB CL16",
        "details": {"Kilometerstand": "21.000 km", "Erstzulassung": "Mai 2009"},
    }
    assert readers.read(km, listing)[0] == 21000
    assert readers.read(ez, listing)[0] == 2009
    assert readers.read(abs_, listing)[0] is False
    assert readers.read(cl, listing)[0] == 16
