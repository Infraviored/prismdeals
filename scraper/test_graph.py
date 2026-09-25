"""The product graph: taxonomy root, placing, aliases, inherited attributes."""

import json
import sqlite3

import pytest

import db_schema
from graph import facts, place, readers, store, taxonomy


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


def _r1_answer(prompt):
    return {
        "path": [
            {"name": "Yamaha", "kind": "brand", "aliases": ["yamaha"]},
            {
                "name": "R1",
                "kind": "model",
                "aliases": ["yzf-r1", "r1"],
                "generations": [
                    {"name": "RN12", "years": [2004, 2006], "aliases": ["rn12"]},
                    {"name": "RN19", "years": [2007, 2008], "aliases": ["rn19"]},
                    {"name": "RN22", "years": [2009, 2014], "aliases": ["rn22"]},
                ],
            },
            {
                "name": "RN19",
                "kind": "generation",
                "aliases": ["rn19"],
                "years": [2007, 2008],
            },
        ],
        "attributes": [],
    }


@pytest.fixture
def bikes():
    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    target = place.place(conn, "Yamaha R1 RN19", "305", ask=_r1_answer)
    rows = [
        ("a", "YAMAHA R1 RN12 1. Hand - 13.000 km", {"Erstzulassung": "Mai 2005"}),
        (
            "b",
            "Yamaha R1 -wenig Kilometer-",
            {"Erstzulassung": "Juli 2008", "Kilometerstand": "2.152 km"},
        ),
        ("c", "Yamaha WR 125 R - 1. HAND", {}),
        ("d", "Suche Yamaha R1", {}),
        ("e", "R1 Tankdeckel", {}),
    ]
    for n, (lid, title, details) in enumerate(rows):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, ?)",
            (
                lid,
                title,
                f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-305-1",
                json.dumps(details),
            ),
        )
    return conn, target


def _key(conn, node_id):
    return store.node(conn, node_id)["key"].split("motorraeder-roller/")[-1]


def test_a_generation_is_named_or_found_by_the_year(bikes):
    conn, target = bikes
    assert _key(conn, facts.process(conn, "a")) == "yamaha/r1/rn12"
    assert _key(conn, facts.process(conn, "b")) == "yamaha/r1/rn19"
    assert facts.facts_of(conn, "b")["km"] == 2152
    method = conn.execute(
        "SELECT method FROM listing_resolution WHERE listing_id='b'"
    ).fetchone()[0]
    assert method == "years"


def test_an_unknown_model_stays_at_its_brand_and_a_request_says_so(bikes):
    conn, _ = bikes
    assert _key(conn, facts.process(conn, "c")) == "yamaha"
    facts.process(conn, "d")
    assert facts.facts_of(conn, "d")["is_request"] is True


def test_a_model_name_without_its_brand_is_not_that_model(bikes):
    """ "R1 Tankdeckel" names no Yamaha: it is not the R1."""
    conn, _ = bikes
    node = store.node(conn, facts.process(conn, "e"))
    assert node["kind"] == "category"


def test_a_searching_target_counts_as_its_brand(bikes):
    conn, target = bikes
    assert _key(conn, facts.process(conn, "e", prior=[target])) == "yamaha/r1"


def test_a_year_on_the_border_of_two_generations_decides_nothing(bikes):
    """ "Juli 2007" can be a late RN12 or an early RN19."""
    conn, _ = bikes
    model = store.node(
        conn,
        store.node(
            conn, place.find(conn, "RN19", taxonomy.category_node_id(conn, "305"))
        )["parent_id"],
    )
    from graph import resolve

    assert resolve.by_years(conn, model["id"], 2007) is None
    assert store.node(conn, resolve.by_years(conn, model["id"], 2005))["name"] == "RN12"


def test_title_keys_glue_words_but_never_across_punctuation():
    from graph.resolve import title_keys

    assert {"yzfr1", "r1", "cbr1000rr"} <= title_keys("Yamaha YZF-R1 / CBR 1000 RR")
    assert "r1" not in title_keys("Yamaha Raptor YFM 700 R 1.Hand Lof.Zulassung")
    assert "r1" not in title_keys("WR 125 R - 1. HAND")
