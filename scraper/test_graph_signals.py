"""Signals: proposed once from the offers found, readers checked, shared per node."""

import json
import sqlite3

import pytest

import db_schema
from graph import hunts, signals, store, taxonomy


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    db_schema.apply_schema(c)
    taxonomy.seed(c)
    return c


def _hunt(conn, n_offers, every=3):
    moto = taxonomy.category_node_id(conn, "305")
    honda = store.create_node(conn, moto, "brand", "Honda", "test")
    store.add_alias(conn, honda, "Honda", "name", "test")
    cbr = store.create_node(conn, honda, "model", "CBR 1000 RR", "test")
    store.add_alias(conn, cbr, "CBR1000RR", "name", "test")
    cid = hunts.save(
        conn,
        {
            "name": "CBR",
            "category_code": "305",
            "frame": {},
            "targets": [{"typed": "CBR", "node_id": cbr}],
            "conditions": [],
        },
    )
    (sid,) = conn.execute(
        "SELECT id FROM searches WHERE campaign_id = ?", (cid,)
    ).fetchone()
    for n in range(n_offers):
        title = f"Honda CBR1000RR {'Rennstrecke ' if n % every == 0 else ''}Nr {n}"
        conn.execute(
            "INSERT INTO listings (id, title, url, details, detailed_description) VALUES (?, ?, ?, '{}', ?)",
            (
                str(1000 + n),
                title,
                f"https://www.kleinanzeigen.de/s-anzeige/x/{1000 + n}-305-1",
                "Gepflegt.",
            ),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, 0)",
            (str(1000 + n), sid),
        )
    return cid, cbr


def _titles(prompt):
    return [
        line.split(": ", 1)[1]
        for line in prompt.splitlines()
        if line[:1].isdigit() and ": " in line
    ]


def _kind(prompt):
    """Every offer is the product itself; None for any other question."""
    if prompt.startswith("Gesucht:"):
        return [{"i": i, "is": "self"} for i in range(len(_titles(prompt)))]
    return None


def _answer(calls):
    def ask(prompt, **_):
        calls.append(prompt)
        if _kind(prompt):
            return _kind(prompt)
        if "Was unterscheidet diese Angebote" in prompt:
            return {
                "signals": [
                    {
                        "label": "Rennstrecke",
                        "kind": "yesno",
                        "polarity": "minus",
                        "weight": 2,
                    }
                ]
            }
        titles = _titles(prompt)
        return {
            "attributes": [
                {
                    "label": "Rennstrecke",
                    "id": "rennstrecke",
                    "type": "boolean",
                    "readers": ["keywords:rennstrecke"],
                    "examples": {
                        str(i): (True if "Rennstrecke" in t else None)
                        for i, t in enumerate(titles)
                    },
                }
            ]
        }

    return ask


def test_signals_are_proposed_once_with_their_frequency_and_read_on_the_offers(conn):
    cid, cbr = _hunt(conn, 24)
    calls = []
    out = hunts.refine(conn, cid, ask=_answer(calls))
    assert out["signals"] == 1
    row = conn.execute(
        "SELECT attr_id, polarity, default_weight, found, total FROM node_signals"
    ).fetchone()
    assert row == ("rennstrecke", "minus", -2, 8, 24)
    # Read on the hunt's offers at once.
    (value,) = conn.execute(
        "SELECT value_json FROM listing_facts WHERE listing_id = '1000' AND attr_id = 'rennstrecke'"
    ).fetchone()
    assert json.loads(value) is True
    # Fresh: the next refine asks nothing.
    before = len(calls)
    hunts.refine(conn, cid, ask=_answer(calls))
    assert len(calls) == before


def test_a_yesno_every_offer_states_is_no_signal(conn):
    cid, _ = _hunt(conn, 24, every=1)
    assert hunts.refine(conn, cid, ask=_answer([]))["signals"] == 0
    assert not conn.execute("SELECT 1 FROM node_signals").fetchall()


def test_too_few_offers_propose_nothing(conn):
    cid, _ = _hunt(conn, 5)
    assert (
        hunts.refine(conn, cid, ask=lambda p, **_: _kind(p) or pytest.fail("asked"))[
            "signals"
        ]
        == 0
    )


def test_a_malformed_signal_answer_is_no_answer(conn):
    from graph import llm

    from graph import facts

    cid, _ = _hunt(conn, 24)
    for n in range(24):
        facts.process(conn, str(1000 + n))
    for bad in (
        {"signals": "x"},
        {
            "signals": [
                {"label": "A", "kind": "yesno", "polarity": "value", "weight": 1}
            ]
        },
    ):
        with pytest.raises(llm.NoModel):
            signals.propose(conn, cid, ask=lambda p, **_: bad)


def test_an_empty_answer_is_not_asked_again_every_crawl(conn):
    from graph import facts

    cid, _ = _hunt(conn, 24)
    for n in range(24):
        facts.process(conn, str(1000 + n))
    calls = []

    def nothing(prompt, **_):
        calls.append(prompt)
        return {"signals": []}

    assert signals.propose(conn, cid, ask=nothing) == ([], True)
    assert signals.propose(conn, cid, ask=nothing) == ([], False)
    assert len(calls) == 1


def test_a_null_weight_is_the_default():
    c = hunts.clean_condition(
        {"label": "ABS", "op": "present", "importance": "wish", "weight": None}
    )
    assert c["weight"] == 2


def test_a_model_outage_during_signals_keeps_the_refine(conn):
    from graph import llm

    cid, _ = _hunt(conn, 24)

    def down(prompt, **_):
        if _kind(prompt):
            return _kind(prompt)
        raise llm.NoModel("KI nicht erreichbar.")

    out = hunts.refine(conn, cid, ask=down)
    assert out["signals"] == 0 and out["listings"] == 24
