"""Hunts as queries: targets placed, conditions on attributes, the crawl derived."""

import json
import sqlite3

import pytest

import db_schema
from graph import hunts, llm, store, taxonomy
from test_graph import _cbr_answer


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    db_schema.apply_schema(c)
    taxonomy.seed(c)
    return c


def _answers(prompt, **_):
    """The placing answer, or readers for whatever facts the prompt asks about."""
    if "Er verlangt diese Merkmale" in prompt:
        labels = [
            line[2:].split(" (der Käufer will")[0]
            for line in prompt.splitlines()
            if line.startswith("- ") and (":" not in line or "(der Käufer will" in line)
        ]
        return {
            "attributes": [
                {
                    "label": label,
                    "id": label.lower(),
                    "type": "boolean",
                    "readers": [f"keywords:{label.lower()}"],
                }
                for label in labels
            ]
        }
    return _cbr_answer(prompt)


def _doc(**over):
    doc = {
        "name": "Supersportler",
        "text": "CBR SC59 unter 5000 km",
        "category_code": "305",
        "frame": {"max_price": 9000, "location_id": 6411, "radius_km": 200},
        "targets": [
            {
                "typed": "Honda CBR 1000 RR SC59",
                "conditions": [
                    {
                        "label": "Kilometerstand",
                        "op": "max",
                        "value": 5000,
                        "importance": "must",
                    }
                ],
            }
        ],
        "conditions": [{"label": "Heizgriffe", "op": "present", "importance": "wish"}],
    }
    doc.update(over)
    return doc


def test_a_hunt_is_its_targets_conditions_and_crawl(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    ((node_id, name),) = conn.execute(
        "SELECT node_id, name FROM hunt_targets"
    ).fetchall()
    assert store.node(conn, node_id)["key"].endswith("/honda/cbr-1000-rr/sc59")
    assert name == "Honda CBR 1000 RR SC59"
    rows = conn.execute(
        "SELECT node_id, attr_id, op, value_json, importance FROM hunt_conditions ORDER BY id"
    ).fetchall()
    # The km condition reads the site's own attribute; the wish added one.
    assert rows[0] == (node_id, "km", "max", "5000", "must")
    assert rows[1][:2] == (None, "heizgriffe")
    assert "heizgriffe" in store.effective_attributes(conn, node_id)
    # The SC59 is searched as the CBR, the km filter narrows the URL only when
    # it applies to every target -- this one is scoped, so it does not.
    ((term,),) = conn.execute("SELECT label FROM search_family_terms").fetchall()
    assert term == "Honda CBR 1000 RR"
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "c305" in url and "r200" in url and "km_i" not in url


def test_a_must_for_all_targets_narrows_the_crawl_url(conn):
    doc = _doc(
        targets=[{"typed": "Honda CBR 1000 RR SC59"}],
        conditions=[
            {
                "label": "Kilometerstand",
                "op": "max",
                "value": 30000,
                "importance": "must",
            }
        ],
    )
    cid = hunts.save(conn, doc, ask=_answers)
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "+motorraeder_roller.km_i:,30000" in url


def test_saving_again_keeps_the_family_and_the_name_is_unique(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    node_id = conn.execute("SELECT node_id FROM hunt_targets").fetchone()[0]
    hunts.save(
        conn,
        _doc(targets=[{"node_id": node_id, "typed": "SC59"}], conditions=[]),
        campaign_id=cid,
        ask=_answers,
    )
    assert conn.execute("SELECT COUNT(*) FROM search_families").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM hunt_conditions").fetchone()[0] == 0
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, _doc(), ask=_answers)


def test_a_condition_needs_its_value(conn):
    bad = _doc(
        conditions=[{"label": "Kilometerstand", "op": "max", "importance": "must"}]
    )
    with pytest.raises(hunts.HuntError):
        hunts.save(conn, bad, ask=_answers)


def test_refine_asks_once_about_listings_above_the_target(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    for n, title in enumerate(["Honda Fireblade Rot", "Honda Superblade Tank"]):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, '{}')",
            (f"x{n}", title, f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-305-1"),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (f"x{n}", sid),
        )
    calls = []

    def answer(prompt, **_):
        calls.append(prompt)
        return [{"i": 0, "key": None}, {"i": 1, "key": None}]

    # "Fireblade" is an alias of the CBR: named, not asked. The other is at
    # Honda, above the target, and asked -- once.
    assert hunts.refine(conn, cid, ask=answer)["asked"] == 1
    assert hunts.refine(conn, cid, ask=answer)["asked"] == 0
    assert len(calls) == 1
    methods = dict(
        conn.execute("SELECT listing_id, method FROM listing_resolution").fetchall()
    )
    assert methods == {"x0": "alias", "x1": "rejected"}


def test_deleting_a_hunt_keeps_what_it_found(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    conn.execute(
        "INSERT INTO listings (id, title, search_id) VALUES ('x', 'Honda CBR', ?)",
        (sid,),
    )
    conn.execute(
        "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('x', ?, 0)",
        (sid,),
    )
    assert hunts.delete(conn, cid)["deleted"]
    assert conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0] == 1
    assert conn.execute("SELECT enabled, campaign_id FROM searches").fetchone() == (
        0,
        None,
    )
    assert conn.execute("SELECT COUNT(*) FROM search_families").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM hunt_targets").fetchone()[0] == 0


def test_the_crawl_plan_fetches_the_never_fetched_first(conn):
    import datetime

    from graph import crawlplan

    cid = hunts.save(
        conn,
        _doc(
            targets=[
                {"typed": "Honda CBR 1000 RR SC59"},
                {"typed": "Honda CBR 1000 RR"},
            ]
        ),
        ask=_answers,
    )
    units = crawlplan.plan(conn)
    assert len(units) == 1  # both targets are searched as the CBR: one unit
    conn.execute("UPDATE searches SET last_scraped_at = '2026-09-25T10:00:00+00:00'")
    hunts.save(
        conn,
        _doc(name="Zweite", targets=[{"typed": "Yamaha R1"}]),
        ask=lambda p, **_: _answers(p)
        if "Er verlangt" in p
        else {
            "path": [
                {"name": "Yamaha", "kind": "brand"},
                {"name": "R1", "kind": "model"},
            ]
        },
    )
    now = datetime.datetime(2026, 9, 25, 12, tzinfo=datetime.timezone.utc)
    order = [u["url"] for u in crawlplan.plan(conn, now=now)]
    assert "yamaha-r1" in order[0] and "honda" in order[1]
    assert [u["url"] for u in crawlplan.plan(conn, campaign_id=cid)] == [order[1]]


def test_a_class_that_is_its_category_is_the_category(conn):
    from graph import place

    def never(prompt, **_):
        raise AssertionError("no model call")

    laptops = taxonomy.category_node_id(conn, "278")
    assert place.place(conn, "Laptop", "278", ask=never) == laptops
    # A model that names the category as a class is taken the same way.
    moto = place.place(
        conn,
        "Motorrad",
        "305",
        ask=lambda p, **_: {
            "path": [{"name": "Motorräder & Motorroller", "kind": "class"}]
        },
    )
    assert moto == taxonomy.category_node_id(conn, "305")


def test_a_kind_of_goods_is_found_in_compounds_and_by_the_art_field(conn):
    from graph import facts

    cid = hunts.save(
        conn,
        {
            "name": "Matratze",
            "category_code": "81",
            "frame": {"max_price": 50, "location_id": 6358, "radius_km": 26},
            "targets": [{"typed": "Matratze"}],
            "conditions": [
                {"label": "Art", "op": "eq", "value": "Matratzen", "importance": "must"}
            ],
        },
        ask=lambda p, **_: {
            "path": [{"name": "Matratze", "kind": "class", "aliases": ["Matratze"]}]
        },
    )
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "art_s:matratzen" in url and "/matratze/" not in url
    target = hunts.target_ids(conn, cid)[0]
    rows = [
        ("m1", "Kaltschaummatratze 90x200", {}),
        ("m2", "Boxspring Topper neuwertig", {"Art": "Matratzen"}),
        ("m3", "Lattenrost 90x200", {"Art": "Lattenroste"}),
    ]
    for n, (lid, title, details) in enumerate(rows):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, ?)",
            (
                lid,
                title,
                f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-81-1",
                json.dumps(details),
            ),
        )
    assert facts.process(conn, "m1") == target
    assert facts.process(conn, "m2") == target
    assert facts.process(conn, "m3") == taxonomy.category_node_id(conn, "81")


def test_a_class_step_that_is_the_category_is_dropped(conn):
    from graph import place, store

    node = place.place(
        conn,
        "Yamaha R1",
        "305",
        ask=lambda p, **_: {
            "path": [
                {
                    "name": "Motorräder & Motorroller",
                    "kind": "class",
                    "aliases": ["Motorrad"],
                },
                {"name": "Yamaha", "kind": "brand"},
                {"name": "R1", "kind": "model"},
            ],
            "attributes": [
                {
                    "id": "abs",
                    "label": "ABS",
                    "type": "boolean",
                    "readers": ["keywords:abs"],
                    "at": 2,
                }
            ],
        },
    )
    moto = taxonomy.category_node_id(conn, "305")
    assert [n["kind"] for n in store.ancestors(conn, node)][-2:] == ["brand", "model"]
    assert store.node(conn, node)["parent_id"] != moto
    assert place.find(conn, "Motorrad", moto) == moto


def test_merging_a_targeted_node_moves_the_hunt_with_it(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    target = hunts.target_ids(conn, cid)[0]
    twin = store.create_node(
        conn,
        store.node(conn, target)["parent_id"],
        "generation",
        "SC59 Fireblade",
        "test",
    )
    store.merge(conn, target, twin)
    assert hunts.target_ids(conn, cid) == [twin]
    assert (
        conn.execute(
            "SELECT COUNT(*) FROM hunt_conditions WHERE node_id = ?", (twin,)
        ).fetchone()[0]
        == 1
    )


def test_an_in_condition_on_a_site_filter_narrows_the_crawl(conn):
    doc = _doc(
        targets=[{"typed": "Honda CBR 1000 RR SC59"}],
        conditions=[
            {
                "label": "Getriebe",
                "op": "in",
                "value": ["Manuell"],
                "importance": "must",
            }
        ],
    )
    cid = hunts.save(conn, doc, ask=_answers)
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "+motorraeder_roller.shift_s:manuell" in url


def test_deleting_a_hunt_keeps_the_searches_another_hunt_owns(conn):
    """Two hunts derive the same URL row; deleting one must not switch it off."""
    from graph import crawlplan

    a = hunts.save(conn, _doc(name="A"), ask=_answers)
    b = hunts.save(
        conn, _doc(name="B", targets=[{"typed": "Honda CBR 1000 RR"}]), ask=_answers
    )
    ((sid, enabled),) = conn.execute("SELECT id, enabled FROM searches").fetchall()
    assert enabled == 1
    hunts.delete(conn, a)
    assert conn.execute(
        "SELECT enabled, campaign_id FROM searches WHERE id = ?", (sid,)
    ).fetchone() == (1, None)
    assert [u["search_id"] for u in crawlplan.plan(conn)] == [sid]
    # The last owner gone: nothing wants it, it stops.
    hunts.delete(conn, b)
    assert conn.execute(
        "SELECT enabled FROM searches WHERE id = ?", (sid,)
    ).fetchone() == (0,)


def test_a_named_existing_attribute_is_used_not_redefined(conn):
    """ "Laufleistung" the model names as the site's "km": no second "km" at the
    model node shadowing the site's detail reader and filter."""
    from graph import facts

    def ask(prompt, **_):
        if "Er verlangt" in prompt:
            assert "km: Kilometerstand" in prompt
            return {
                "attributes": [
                    {
                        "label": "Laufleistung",
                        "id": "km",
                        "type": "number",
                        "unit": "km",
                        "readers": ["number"],
                    }
                ]
            }
        return _answers(prompt)

    doc = _doc(
        targets=[
            {
                "typed": "Honda CBR 1000 RR SC59",
                "conditions": [
                    {
                        "label": "Laufleistung",
                        "op": "max",
                        "value": 5000,
                        "importance": "must",
                    }
                ],
            }
        ],
        conditions=[],
    )
    cid = hunts.save(conn, doc, ask=ask)
    target = hunts.target_ids(conn, cid)[0]
    km = store.effective_attributes(conn, target)["km"]
    assert km["site_filter"] == "motorraeder_roller.km_i"
    assert km["readers"] == ["details:Kilometerstand"]
    assert conn.execute("SELECT attr_id, label FROM hunt_conditions").fetchall() == [
        ("km", "Laufleistung")
    ]
    conn.execute(
        "INSERT INTO listings (id, title, url, details) VALUES ('1', 'Honda CBR 1000 RR',"
        " 'https://www.kleinanzeigen.de/s-anzeige/x/1-305-1', ?)",
        (json.dumps({"Kilometerstand": "45.000 km"}),),
    )
    facts.process(conn, "1")
    assert facts.facts_of(conn, "1")["km"] == 45000


def test_an_option_is_stored_as_its_label_whichever_the_screen_sent(conn):
    doc = _doc(
        targets=[{"typed": "Honda CBR 1000 RR SC59"}],
        conditions=[
            {"label": "Art", "op": "eq", "value": "motorrad", "importance": "must"},
            {
                "label": "Getriebe",
                "op": "in",
                "value": ["Manuell", "automatik"],
                "importance": "wish",
            },
        ],
    )
    cid = hunts.save(conn, doc, ask=_answers)
    rows = conn.execute(
        "SELECT attr_id, value_json FROM hunt_conditions WHERE campaign_id = ? ORDER BY id",
        (cid,),
    ).fetchall()
    assert rows == [("type", '"Motorräder"'), ("shift", '["Manuell", "Automatik"]')]
    ((url,),) = conn.execute("SELECT url FROM searches").fetchall()
    assert "+motorraeder_roller.type_s:motorrad" in url
    bad = _doc(
        name="Andere",
        conditions=[
            {"label": "Art", "op": "eq", "value": "Cruiser", "importance": "must"}
        ],
    )
    with pytest.raises(hunts.HuntError, match="Cruiser"):
        hunts.save(conn, bad, ask=_answers)


def test_a_range_on_a_choice_is_refused(conn):
    doc = {
        "name": "Laptop",
        "category_code": "278",
        "frame": {},
        "targets": [{"typed": "Lenovo ThinkPad T14"}],
        "conditions": [
            {
                "label": "Speicher (GB)",
                "op": "min",
                "value": 512,
                "importance": "must",
            }
        ],
    }
    ask = lambda p, **_: {  # noqa: E731
        "path": [
            {"name": "Lenovo", "kind": "brand"},
            {"name": "ThinkPad T14", "kind": "model"},
        ]
    }
    with pytest.raises(hunts.HuntError, match="Auswahl"):
        hunts.save(conn, doc, ask=ask)


def test_the_art_filter_is_found_by_its_label_not_its_id(conn):
    """Baby- & Kinderkleidung: "Art" is type_s, and art_s is "Mädchen & Jungen"."""
    from graph import facts

    cid = hunts.save(
        conn,
        {
            "name": "Hosen",
            "category_code": "22",
            "frame": {"location_id": 6358, "radius_km": 26},
            "targets": [{"typed": "Hosen"}],
            "conditions": [
                {
                    "label": "Art",
                    "op": "eq",
                    "value": "hosen_jeans",
                    "importance": "must",
                }
            ],
        },
        ask=lambda p, **_: {"path": [{"name": "Hosen", "kind": "class"}]},
    )
    ((url,),) = conn.execute(
        "SELECT url FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchall()
    assert "type_s:hosen_jeans" in url and "/hosen/" not in url
    target = hunts.target_ids(conn, cid)[0]
    conn.execute(
        "INSERT INTO listings (id, title, url, details) VALUES ('k', 'Paket Kinder 110',"
        " 'https://www.kleinanzeigen.de/s-anzeige/x/1-22-1', ?)",
        (json.dumps({"Art": "Hosen & Jeans", "Mädchen & Jungen": "Jungen"}),),
    )
    assert facts.process(conn, "k") == target


def test_a_site_filter_needs_the_attribute_at_every_target(conn):
    """A must only one target can read does not narrow the shared crawl."""
    conditions = [
        {
            "node_id": None,
            "attr_id": "abs",
            "op": "eq",
            "value": "ja",
            "importance": "must",
        }
    ]
    cbr = hunts.save(conn, _doc(), ask=_answers)
    target = hunts.target_ids(conn, cbr)[0]
    store.set_attribute(
        conn,
        target,
        "abs",
        "ABS",
        "enum",
        ["keywords:abs"],
        "test",
        options=["ja"],
        site_filter="motorraeder_roller.abs_s",
    )
    other = taxonomy.category_node_id(conn, "305")  # reads no ABS at all
    assert hunts._site_filters(conn, conditions, [target]) == [
        "motorraeder_roller.abs_s:ja"
    ]
    assert hunts._site_filters(conn, conditions, [target, other]) == []


def test_a_listing_the_model_calls_no_product_is_rejected_for_good(conn):
    """{"key": null}: an accessory. Stored as "rejected" where it was, and no
    name learned later moves it."""
    from graph import facts

    cid = hunts.save(conn, _doc(), ask=_answers)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    conn.execute(
        "INSERT INTO listings (id, title, url, details) VALUES ('t', 'Honda Superblade Tankpad',"
        " 'https://www.kleinanzeigen.de/s-anzeige/x/1-305-1', '{}')"
    )
    conn.execute(
        "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES ('t', ?, 0)",
        (sid,),
    )
    hunts.refine(conn, cid, ask=lambda p, **_: [{"i": 0, "key": None}])
    honda = conn.execute("SELECT node_id FROM listing_resolution").fetchone()[0]
    assert store.node(conn, honda)["kind"] == "brand"
    assert conn.execute("SELECT method FROM listing_resolution").fetchone() == (
        "rejected",
    )
    # A name learned later for the CBR does not undo the answer.
    cbr = store.node(conn, hunts.target_ids(conn, cid)[0])["parent_id"]
    store.add_alias(conn, cbr, "Superblade", "name", "learned")
    facts.process(conn, "t", prior=hunts.target_ids(conn, cid))
    assert conn.execute(
        "SELECT node_id, method FROM listing_resolution"
    ).fetchone() == (honda, "rejected")


def test_refine_asks_again_about_what_the_answer_left_out(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    (sid,) = conn.execute("SELECT id FROM searches").fetchone()
    for n, title in enumerate(["Honda Superblade Tank", "Honda Irgendwas"]):
        conn.execute(
            "INSERT INTO listings (id, title, url, details) VALUES (?, ?, ?, '{}')",
            (f"y{n}", title, f"https://www.kleinanzeigen.de/s-anzeige/x/{n}-305-1"),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (f"y{n}", sid),
        )
    hunts.refine(conn, cid, ask=lambda p, **_: [{"i": 0, "key": None}])
    methods = dict(
        conn.execute("SELECT listing_id, method FROM listing_resolution").fetchall()
    )
    assert methods == {"y0": "rejected", "y1": "alias"}
    assert (
        hunts.refine(conn, cid, ask=lambda p, **_: [{"i": 0, "key": None}])["asked"]
        == 1
    )


def test_a_reader_that_misreads_real_titles_is_asked_again_then_dropped(conn):
    from graph import place

    moto = taxonomy.category_node_id(conn, "305")
    for n, title in enumerate(["Kit 2x8GB DDR4", "RAM 2x16GB", "4x4GB Kit", "2x32GB"]):
        conn.execute("INSERT INTO listings (id, title) VALUES (?, ?)", (f"s{n}", title))
        conn.execute(
            "INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at) VALUES (?, ?, 1, 'alias', '')",
            (f"s{n}", moto),
        )
    wrong = r"regex:(\d+)\s?x"  # reads the module count, not the size
    right = r"regex:\d+\s?x\s?(\d+)\s?GB"
    asked = []

    def answer(prompt, **_):
        asked.append(prompt)
        reader = wrong if len(asked) == 1 else right
        return {
            "attributes": [
                {
                    "label": "Modulgröße",
                    "id": "modulgroesse",
                    "type": "number",
                    "readers": [reader],
                    "examples": {"0": 32, "1": 4, "2": 16, "3": 8},
                }
            ]
        }

    defined = place.define_attributes(conn, moto, ["Modulgröße"], ask=answer)
    assert len(asked) == 2 and "liest aus" in asked[1]  # right on the second try
    assert defined == {"Modulgröße": "modulgroesse"}
    assert store.effective_attributes(conn, moto)["modulgroesse"]["readers"] == [right]

    asked.clear()
    stuck = place.define_attributes(
        conn,
        moto,
        ["Anzahl"],
        ask=lambda p, **_: {
            "attributes": [
                {
                    "label": "Anzahl",
                    "id": "anzahl",
                    "type": "number",
                    "readers": [wrong.replace("(\\d+)\\s?x", "x(\\d+)")],
                    "examples": {"0": 2},
                }
            ]
        },
    )
    assert stuck == {}


def test_a_cut_off_attribute_answer_is_asked_again(conn):
    from graph import place

    moto = taxonomy.category_node_id(conn, "305")
    conn.execute("INSERT INTO listings (id, title) VALUES ('s0', 'RAM 2x16GB')")
    conn.execute(
        "INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at) VALUES ('s0', ?, 1, 'alias', '')",
        (moto,),
    )
    asked = []

    def answer(prompt, **_):
        asked.append(prompt)
        if len(asked) == 1:
            raise llm.NoJSON("Die KI-Antwort war kein JSON.")
        return {
            "attributes": [
                {
                    "label": "Modulgröße",
                    "id": "modulgroesse",
                    "type": "number",
                    "readers": [r"regex:\d+\s?x\s?(\d+)\s?GB"],
                    "examples": {"0": 16},
                }
            ]
        }

    defined = place.define_attributes(conn, moto, ["Modulgröße"], ask=answer)
    assert defined == {"Modulgröße": "modulgroesse"}
    assert len(asked) == 2 and "kein vollständiges JSON" in asked[1]

    def cut_off(prompt, **_):
        raise llm.NoJSON("Die KI-Antwort war kein JSON.")

    with pytest.raises(llm.NoJSON):
        place.define_attributes(conn, moto, ["Farbe"], ask=cut_off)


def test_readers_are_not_checked_on_what_is_only_something_for_the_product(conn):
    from graph import place

    moto = taxonomy.category_node_id(conn, "305")
    for n, (title, method) in enumerate(
        [("Honda CBR 2008", "alias"), ("Auspuff CBR", "rejected")]
    ):
        conn.execute("INSERT INTO listings (id, title) VALUES (?, ?)", (f"s{n}", title))
        conn.execute(
            "INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at) VALUES (?, ?, 1, ?, '')",
            (f"s{n}", moto, method),
        )
    assert place._samples(conn, moto) == ["Honda CBR 2008"]


def test_a_reader_that_misses_a_rare_format_is_kept_one_that_misses_most_is_not(conn):
    from graph import place

    moto = taxonomy.category_node_id(conn, "305")
    titles = [
        "Matratze 90x200",
        "Matratze 140x200",
        "Matratze 1,40m x 2,00m",
        "Matratze 80x200",
    ]
    for n, title in enumerate(titles):
        conn.execute("INSERT INTO listings (id, title) VALUES (?, ?)", (f"s{n}", title))
        conn.execute(
            "INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at) VALUES (?, ?, 1, 'alias', '')",
            (f"s{n}", moto),
        )

    def answer(label, reader):
        def ask(prompt, **_):
            order = [
                line.split(": ", 1)[1]
                for line in prompt.splitlines()
                if line[:1].isdigit() and ": " in line and "Matratze" in line
            ]
            return {
                "attributes": [
                    {
                        "label": label,
                        "id": store.slug(label),
                        "type": "text",
                        "readers": [reader],
                        "examples": {
                            str(i): t.split(" ", 1)[1] for i, t in enumerate(order)
                        },
                    }
                ]
            }

        return ask

    kept = place.define_attributes(
        conn, moto, ["Größe"], ask=answer("Größe", r"regex:\b(\d{2,3}x\d{3})\b")
    )
    assert kept == {"Größe": "groesse"}
    dropped = place.define_attributes(
        conn, moto, ["Maß"], ask=answer("Maß", r"regex:\b(140x\d{3})\b")
    )
    assert dropped == {}


def test_a_bound_over_numbered_options_lets_the_fitting_options_through():
    from graph.hunts import _ordinal

    options = [{"value": v, "label": v} for v in ("0", "1", "2", "3", "4")] + [
        {"value": "more_than_4", "label": "Mehr als 4"}
    ]
    assert _ordinal(options, {"op": "min", "value": 2}) == ["2", "3", "4", "Mehr als 4"]
    assert _ordinal(options, {"op": "max", "value": 1}) == ["0", "1"]
    mixed = [{"value": v, "label": v} for v in ("512 GB", "1 TB", "Andere")]
    assert _ordinal(mixed, {"op": "min", "value": 1}) is None
    assert (
        _ordinal([{"value": "a", "label": "Schwarz"}], {"op": "min", "value": 1})
        is None
    )


def test_a_search_of_mostly_accessories_gets_more_pages(conn):
    from graph import crawlplan

    cid = hunts.save(
        conn, _doc(targets=[{"typed": "Honda CBR 1000 RR SC59"}]), ask=_answers
    )
    (unit,) = crawlplan.plan(conn, campaign_id=cid)
    assert unit["pages"] == crawlplan.BASE_PAGES  # nothing found yet
    moto = taxonomy.category_node_id(conn, "305")
    for n in range(10):
        conn.execute("INSERT INTO listings (id, title) VALUES (?, 'x')", (f"p{n}",))
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (f"p{n}", unit["search_id"]),
        )
        conn.execute(
            "INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at) VALUES (?, ?, 1, ?, '')",
            (f"p{n}", moto, "alias" if n < 7 else "rejected"),
        )
    assert crawlplan.pages(conn, unit["search_id"]) == 3  # 7 of 10 useful
    conn.execute(
        "UPDATE listing_resolution SET method = 'rejected' WHERE listing_id != 'p0'"
    )
    assert crawlplan.pages(conn, unit["search_id"]) == crawlplan.MAX_PAGES
