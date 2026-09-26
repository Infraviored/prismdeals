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


def _cbr_answer(prompt, **_):
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
    # Placing invents no facts: only the category's, inherited.
    assert "abs" not in attrs and "km" in attrs


def test_a_known_name_costs_no_model_call(seeded):
    place.place(seeded, "Honda CBR 1000 RR SC59", "305", ask=_cbr_answer)

    def never(prompt, **_):
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


def _r1_answer(prompt, **_):
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


def test_a_year_names_the_generation_built_then_and_only_then_the_one_before(bikes):
    """2007: the RN19's own first year, not a late RN12. 2025: no R1 was built
    then, so a registration one year after the RN49 is an RN49."""
    conn, _ = bikes
    model = store.node(
        conn,
        store.node(
            conn, place.find(conn, "RN19", taxonomy.category_node_id(conn, "305"))
        )["parent_id"],
    )
    from graph import resolve

    name = lambda y: store.node(conn, resolve.by_years(conn, model["id"], y))["name"]  # noqa: E731
    assert name(2007) == "RN19"
    assert name(2005) == "RN12"
    assert name(2015) == "RN22"


def test_a_number_is_read_after_a_long_label():
    from graph.numbers import read_number

    assert read_number("arbeitsspeicher: 32 gb, ssd 1 tb", "Arbeitsspeicher GB") == 32


def test_title_keys_glue_words_but_never_across_punctuation():
    from graph.resolve import title_keys

    assert {"yzfr1", "r1", "cbr1000rr"} <= title_keys("Yamaha YZF-R1 / CBR 1000 RR")
    assert "r1" not in title_keys("Yamaha Raptor YFM 700 R 1.Hand Lof.Zulassung")
    assert "r1" not in title_keys("WR 125 R - 1. HAND")


def _laptops():
    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    x1 = {
        "path": [
            {"name": "Lenovo", "kind": "brand", "aliases": ["Lenovo"]},
            {
                "name": "ThinkPad X1 Carbon",
                "kind": "model",
                "aliases": ["X1 Carbon"],
                "generations": [
                    {"name": "Gen 9", "years": [2021, 2021], "aliases": ["Gen 9"]},
                    {"name": "Gen 10", "years": [2022, None], "aliases": ["Gen 10"]},
                ],
            },
        ],
        "attributes": [],
    }
    t14 = {
        "path": [
            {"name": "Lenovo", "kind": "brand"},
            {"name": "ThinkPad T14", "kind": "model", "aliases": ["T14"]},
        ],
        "attributes": [],
    }
    place.place(conn, "Lenovo ThinkPad X1 Carbon", "278", ask=lambda p, **_: x1)
    place.place(conn, "Lenovo ThinkPad T14", "278", ask=lambda p, **_: t14)
    return conn


def _resolved(conn, title, prior=()):
    from graph import resolve

    node_id, _, _ = resolve.resolve(
        conn,
        {"title": title, "url": "https://www.kleinanzeigen.de/s-anzeige/x/1-278-1"},
        prior,
    )
    return store.node(conn, node_id)["key"].split("notebooks/")[-1]


def test_a_generation_counts_only_next_to_its_model():
    """ "Gen 9" is the X1 Carbon's only where the X1 Carbon is named or searched."""
    conn = _laptops()
    assert _resolved(conn, "Lenovo ThinkPad T14 Gen 9 i7") == "lenovo/thinkpad-t14"
    assert _resolved(conn, "Lenovo Thinkpad L13 gen 10") == "lenovo"
    assert (
        _resolved(conn, "Lenovo ThinkPad X1 Carbon Gen 9")
        == "lenovo/thinkpad-x1-carbon/gen-9"
    )
    x1 = place.find(conn, "X1 Carbon", taxonomy.category_node_id(conn, "278"))
    assert _resolved(conn, "Lenovo Gen 9 wie neu", prior=[x1]) == (
        "lenovo/thinkpad-x1-carbon/gen-9"
    )


def test_a_current_generation_has_no_last_year():
    from graph import resolve

    conn = _laptops()
    x1 = place.find(conn, "X1 Carbon", taxonomy.category_node_id(conn, "278"))
    gen10 = next(c for c in store.children(conn, x1) if c["name"] == "Gen 10")
    assert (gen10["years_from"], gen10["years_to"]) == (2022, None)
    name = lambda y: store.node(conn, resolve.by_years(conn, x1, y))["name"]  # noqa: E731
    assert name(2021) == "Gen 9"  # exact first: not a late Gen 9 +1
    assert name(2022) == "Gen 10"
    assert name(2025) == "Gen 10"


def test_a_learned_alias_must_be_in_the_title_and_not_the_brand():
    from graph import resolve

    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    cbr = place.place(
        conn,
        "Honda CBR 1000 RR",
        "305",
        ask=lambda p, **_: {
            "path": [
                {"name": "Honda", "kind": "brand", "aliases": ["Honda"]},
                {"name": "CBR 1000 RR", "kind": "model", "aliases": ["CBR1000RR"]},
            ]
        },
    )
    honda = store.node(conn, cbr)["parent_id"]
    key = store.node(conn, cbr)["key"]
    listings = [
        {"id": "1", "title": "Honda Fireblade 2009"},
        {"id": "2", "title": "Honda Blade Rot"},
        {"id": "3", "title": "Honda SuperFB"},
    ]
    out = resolve.resolve_with_model(
        conn,
        listings,
        honda,
        ask=lambda p, **_: [
            {"i": 0, "key": key, "alias": "Honda"},  # the brand: every Honda a CBR
            {"i": 1, "key": key, "alias": "Fireblade"},  # not in this title
            {"i": 2, "key": key, "alias": "FB"},  # too short
        ],
    )
    assert out == {"1": cbr, "2": cbr, "3": cbr}
    assert set(store.aliases(conn, cbr)) == {"cbr1000rr", "hondacbr1000rr"}
    assert (
        _key(
            conn,
            resolve.resolve(
                conn,
                {
                    "title": "Honda CB 500 F",
                    "url": "https://www.kleinanzeigen.de/s-anzeige/x/1-305-1",
                },
            )[0],
        )
        == "honda"
    )
    # A new path: its aliases, too, only as the title writes them.
    out = resolve.resolve_with_model(
        conn,
        [{"id": "4", "title": "Honda Hornet 600 PC41"}],
        honda,
        ask=lambda p, **_: [
            {
                "i": 0,
                "path": [
                    {"name": "Honda", "kind": "brand", "aliases": ["Honda"]},
                    {
                        "name": "CB 600 F",
                        "kind": "model",
                        "aliases": ["Hornet", "Honda", "CB600"],
                    },
                ],
            }
        ],
    )
    hornet = out["4"]
    assert _key(conn, hornet) == "honda/cb-600-f"
    assert set(store.aliases(conn, hornet)) == {"cb600f", "hornet"}


def test_an_unusable_batch_answer_is_no_answer_and_writes_nothing():
    from graph import llm, resolve

    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    moto = taxonomy.category_node_id(conn, "305")
    before = conn.execute("SELECT COUNT(*) FROM nodes").fetchone()
    for answer in (
        [{"i": 0, "path": ["CB 500"]}],
        [{"i": 0, "path": [{"name": "Honda", "kind": "brand"}]}, "x"],
        [{"i": 0, "path": [{"name": "X", "kind": "category"}]}],
        [{"i": 0, "key": "no/such/node"}],
        [{"i": 0}],
        {"i": 0},
    ):
        with pytest.raises(llm.NoModel):
            resolve.resolve_with_model(
                conn,
                [{"id": "1", "title": "Honda CB 500"}],
                moto,
                ask=lambda p, **_: answer,
            )
    assert conn.execute("SELECT COUNT(*) FROM nodes").fetchone() == before


def test_a_malformed_placing_answer_is_no_answer():
    from graph import llm

    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    taxonomy.seed(conn)
    for answer in (
        [{"path": []}],
        {"path": "Yamaha"},
        {"path": ["Yamaha"]},
        {"path": [{"name": "R1", "kind": "model", "years": [2004, "heute"]}]},
        {"path": [{"name": "R1", "kind": "model", "generations": ["RN19"]}]},
    ):
        with pytest.raises(llm.NoModel):
            place.place(conn, "Yamaha R1", "305", ask=lambda p, **_: answer)


def test_a_denial_stands_before_the_whole_word():
    assert readers._keywords(["koffer"], "Mit Topcase, ohne Alukoffer")[0] is False
    assert readers._keywords(["koffer"], "Mit Alukoffer")[0] is True
    assert readers._keywords(["abs"], "ABS: nein")[0] is False


def test_the_more_specific_name_wins_over_the_searching_target(bikes):
    """ "SC59 Facelift" names the facelift, even when the hunt searches the SC59."""
    conn, _ = bikes
    from graph import resolve

    moto = taxonomy.category_node_id(conn, "305")
    honda = store.create_node(conn, moto, "brand", "Honda", "test")
    store.add_alias(conn, honda, "Honda", "name", "test")
    cbr = store.create_node(conn, honda, "model", "CBR 1000 RR", "test")
    store.add_alias(conn, cbr, "CBR1000RR", "name", "test")
    sc59 = store.create_node(
        conn, cbr, "generation", "SC59", "test", years_from=2008, years_to=2011
    )
    store.add_alias(conn, sc59, "SC59", "code", "test")
    facelift = store.create_node(
        conn, cbr, "generation", "SC59 Facelift", "test", years_from=2012, years_to=2016
    )
    store.add_alias(conn, facelift, "SC59 Facelift", "code", "test")
    # The hunt typed the target's whole name; that alias must not outweigh
    # the facelift's own name.
    store.add_alias(conn, sc59, "Honda CBR1000RR SC59", "name", "user")
    listing = {
        "title": "Honda CBR1000RR sc59 Facelift, Fireblade",
        "url": "https://www.kleinanzeigen.de/s-anzeige/x/1-305-1",
    }
    assert resolve.resolve(conn, listing, prior=[sc59])[0] == facelift


def test_a_named_generation_the_year_contradicts_yields_to_the_sibling_it_fits(bikes):
    conn, _ = bikes
    moto = taxonomy.category_node_id(conn, "305")
    honda = store.create_node(conn, moto, "brand", "Honda", "test")
    store.add_alias(conn, honda, "Honda", "name", "test")
    cbr = store.create_node(conn, honda, "model", "CBR 1000 RR", "test")
    store.add_alias(conn, cbr, "CBR1000RR", "name", "test")
    sc59 = store.create_node(
        conn, cbr, "generation", "SC59", "test", years_from=2008, years_to=2011
    )
    store.add_alias(conn, sc59, "SC59", "code", "test")
    facelift = store.create_node(
        conn, cbr, "generation", "SC59 Facelift", "test", years_from=2012, years_to=2016
    )
    conn.execute(
        "INSERT INTO listings (id, title, url, details) VALUES ('f1', 'Honda CBR1000RR, SC59, Facelift, ABS', 'https://www.kleinanzeigen.de/s-anzeige/x/9-305-1', ?)",
        (json.dumps({"Erstzulassung": "Mai 2013"}),),
    )
    assert facts.process(conn, "f1") == facelift


def test_a_short_label_is_not_a_prefix_of_a_longer_detail():
    art = {
        "type": "text",
        "label": "Art",
        "readers": ["details:Art"],
        "options": None,
        "absent": None,
    }
    listing = {
        "title": "",
        "description": "",
        "details": {"Artikelzustand": "Gebraucht", "Art": "Laserdrucker"},
    }
    assert readers.read(art, listing)[0] == "Laserdrucker"
    listing["details"] = {"Artikelzustand": "Gebraucht"}
    assert readers.read(art, listing) is None
