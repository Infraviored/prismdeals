"""Keeping the verdict, not just computing it.

The judgement existed and went nowhere: it ran inside the scoring pipeline,
settled most of a search for nothing, and threw the answer away. So fifty
offers looked exactly like the same list on Kleinanzeigen, with a 4x8 kit
sitting between the matches.
"""

import json
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fit  # noqa: E402

SCHEMA = """
CREATE TABLE searches (id INTEGER PRIMARY KEY, url TEXT, knowledge_set_id INTEGER);
CREATE TABLE knowledge_sets (id INTEGER PRIMARY KEY, item_json TEXT);
CREATE TABLE listings (
    id TEXT PRIMARY KEY, search_id INTEGER, title TEXT,
    detailed_description TEXT, short_description TEXT
);
CREATE TABLE listing_fit (
    listing_id TEXT NOT NULL, search_id INTEGER NOT NULL, verdict TEXT NOT NULL,
    reason TEXT, facts_json TEXT, stage TEXT NOT NULL, judged_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);
"""

MEMORY_SEARCH = "https://www.kleinanzeigen.de/s-pc-zubehoer-software/corsair/k0c225"

WANTS = {
    "fields": [
        {"id": "stickCount", "buyer_wants": {"min": 2, "max": 2}},
        {"id": "gbPerStick", "buyer_wants": {"min": 16, "max": 16}},
        {"id": "generation", "buyer_wants": {"preferred": ["ddr4"]}},
        {"id": "speedMhz", "buyer_wants": {"min": 3200}},
        {"id": "casLatency", "buyer_wants": {"max": 16}},
        {"id": "hasFunctionalDefect", "buyer_wants": {"match": False}},
    ]
}


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA)
    c.execute(
        "INSERT INTO knowledge_sets (id, item_json) VALUES (1, ?)", (json.dumps(WANTS),)
    )
    c.execute(
        "INSERT INTO searches (id, url, knowledge_set_id) VALUES (1, ?, 1)",
        (MEMORY_SEARCH,),
    )
    return c


def add(conn, listing_id, title, description=None):
    conn.execute(
        "INSERT INTO listings (id, search_id, title, detailed_description) VALUES (?, 1, ?, ?)",
        (listing_id, title, description),
    )


def test_a_verdict_is_written_for_every_listing(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    add(conn, "b", "32GB RAM Kit (4x8GB) Corsair Vengeance")
    add(conn, "c", "32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)")

    counts = fit.judge_search(conn, 1)
    assert counts == {"fit": 1, "unclear": 1, "no": 1}

    rows = dict(
        conn.execute(
            "SELECT listing_id, verdict FROM listing_fit WHERE search_id = 1"
        ).fetchall()
    )
    assert rows == {"a": "fit", "b": "no", "c": "unclear"}


def test_a_rejection_says_the_one_fact_that_decided_it(conn):
    """ "Anzahl Module 4 statt 2" beats a list of everything that was fine.

    And it is the buyer's own words: the playbook names every field in them,
    while "stickCount is 4" is the variable name and reads as a stack trace.
    """
    add(conn, "b", "32GB RAM Kit (4x8GB) Corsair Vengeance & Goodram")
    fit.judge_search(conn, 1)
    reason = conn.execute(
        "SELECT reason FROM listing_fit WHERE listing_id = 'b'"
    ).fetchone()[0]
    assert reason == "Anzahl Module 4 statt 2", reason
    assert "stickCount" not in reason


def test_the_description_settles_what_the_title_left_open(conn):
    add(
        conn,
        "c",
        "32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)",
        "Typ: DDR4-3200 MHz, CL16, zwei Module, voll funktionsfähig.",
    )
    counts = fit.judge_search(conn, 1)
    assert counts["fit"] == 1
    stage = conn.execute(
        "SELECT stage FROM listing_fit WHERE listing_id = 'c'"
    ).fetchone()[0]
    assert stage == "description", "and it says which stage answered"


def test_judging_twice_replaces_rather_than_duplicates(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    fit.judge_search(conn, 1)
    fit.judge_search(conn, 1)
    assert conn.execute("SELECT COUNT(*) FROM listing_fit").fetchone()[0] == 1


def test_the_facts_are_kept_so_a_verdict_can_be_argued_with(conn):
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    fit.judge_search(conn, 1)
    facts = json.loads(
        conn.execute(
            "SELECT facts_json FROM listing_fit WHERE listing_id = 'a'"
        ).fetchone()[0]
    )
    assert facts["stickCount"] == 2
    assert facts["speedMhz"] == 3200


def test_a_search_without_requirements_says_so_rather_than_judging(conn):
    """It is the one thing the buyer has to do, so it must not look like a bug."""
    conn.execute("UPDATE searches SET knowledge_set_id = NULL WHERE id = 1")
    add(conn, "a", "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16")
    result = fit.judge_search(conn, 1)
    assert "error" in result and "requirement" in result["error"]
    assert conn.execute("SELECT COUNT(*) FROM listing_fit").fetchone()[0] == 0


def test_a_category_with_no_playbook_says_so(conn):
    conn.execute(
        "UPDATE searches SET url = 'https://www.kleinanzeigen.de/s-x/k0' WHERE id = 1"
    )
    add(conn, "a", "irgendwas")
    result = fit.judge_search(conn, 1)
    assert "error" in result and "playbook" in result["error"]


def test_the_model_s_reading_replaces_the_title_s_guess(conn):
    """Two judgements that disagree are worse than one.

    The pipeline scored a listing 61 while the title stage called it "passt
    nicht", and a buyer reading both learns nothing. Once a model has read the
    whole listing, its facts are the better evidence.
    """
    import playbooks

    add(conn, "a", "Corsair Vengeance LPX 32GB (2x16GB)")
    fit.judge_search(conn, 1)
    assert (
        conn.execute("SELECT verdict FROM listing_fit WHERE listing_id='a'").fetchone()[
            0
        ]
        == "unclear"
    )

    extracted = {
        "criteria": {
            "stickCount": {"value": 2},
            "gbPerStick": {"value": 16},
            # The model answers in the listing's own words. Compared as written,
            # "DDR4" never matched the playbook's "ddr4" and the requirement
            # went silently unsatisfied.
            "generation": {"value": "DDR4"},
            "speedMhz": {"value": 3200},
            "casLatency": {"value": 16},
            "hasFunctionalDefect": {"value": False},
        }
    }
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        extracted,
        WANTS["fields"],
    )
    assert verdict == "fit"

    row = conn.execute(
        "SELECT verdict, stage FROM listing_fit WHERE listing_id='a'"
    ).fetchone()
    assert row == ("fit", "model"), "and it says the model is what answered"


def test_a_fact_sheet_that_contradicts_the_requirements_is_a_no(conn):
    import playbooks

    add(conn, "a", "Corsair Vengeance LPX 32GB (2x16GB)")
    extracted = {
        "criteria": {
            "stickCount": {"value": 2},
            "gbPerStick": {"value": 16},
            "generation": {"value": "DDR4"},
            "speedMhz": {"value": 2666},
            "casLatency": {"value": 16},
            "hasFunctionalDefect": {"value": False},
        }
    }
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        extracted,
        WANTS["fields"],
    )
    assert verdict == "no"


def test_unknown_and_missing_values_are_not_facts(conn):
    import playbooks

    add(conn, "a", "Corsair Vengeance")
    extracted = {
        "criteria": {"speedMhz": {"value": None}, "generation": {"value": "unknown"}}
    }
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        extracted,
        WANTS["fields"],
    )
    assert verdict == "unclear"


def test_a_fault_in_the_description_beats_a_perfect_title(conn):
    """Nobody advertises a defect in the headline.

    The title stage concluded "fit" -- every specification present, and no
    mention of a fault, which the playbook reads as no fault. It then stopped
    looking, so "Ein Riegel defekt, Bastlerware" in the body never got read and
    a broken kit carried a green tick.
    """
    add(
        conn,
        "a",
        "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16",
        "Ein Riegel defekt, stürzt mit Bluescreens ab. Bastlerware.",
    )
    counts = fit.judge_search(conn, 1)
    assert counts["no"] == 1, "a stated fault is a rejection wherever it is written"

    row = conn.execute(
        "SELECT verdict, reason, stage FROM listing_fit WHERE listing_id='a'"
    ).fetchone()
    assert row[0] == "no"
    # The field is a yes/no, so it names the thing rather than a quantity.
    assert row[1] == "Defekt", row[1]
    assert "hasFunctionalDefect" not in row[1]
    assert row[2] == "description"


def test_a_clean_description_leaves_a_match_a_match(conn):
    add(
        conn,
        "a",
        "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16",
        "Voll funktionsfähig, aus einem Aufrüstsatz übrig.",
    )
    assert fit.judge_search(conn, 1)["fit"] == 1


def test_a_stated_defect_survives_a_model_that_says_nothing(conn):
    """An assumption must never outrank a statement.

    The model answers hasFunctionalDefect with null often enough -- "Verkauf
    ungetestet", "Display flackert" are not the word it was trained to expect --
    and the playbook's absent_means then filled the gap with False. A kit the
    seller called Bastlerware came back a candidate, with the green tick written
    over the description reader's own "no".
    """
    import playbooks

    add(
        conn,
        "a",
        "Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16",
        "Ein Riegel defekt, Bastlerware.",
    )
    extracted = {
        "criteria": {
            "stickCount": {"value": 2},
            "gbPerStick": {"value": 16},
            "generation": {"value": "DDR4"},
            "speedMhz": {"value": 3200},
            "casLatency": {"value": 16},
            "hasFunctionalDefect": {"value": None},
        }
    }
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        extracted,
        WANTS["fields"],
        text="Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16\nEin Riegel defekt, Bastlerware.",
    )
    assert verdict == "no"


def test_silence_on_both_sides_still_means_no_defect(conn):
    """The absent_means rule is right where nothing was said -- only there."""
    import playbooks

    add(conn, "a", "Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16")
    extracted = {
        "criteria": {
            "stickCount": {"value": 2},
            "gbPerStick": {"value": 16},
            "generation": {"value": "DDR4"},
            "speedMhz": {"value": 3200},
            "casLatency": {"value": 16},
            "hasFunctionalDefect": {"value": None},
        }
    }
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        extracted,
        WANTS["fields"],
        text="Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16",
    )
    assert verdict == "fit"


@pytest.mark.parametrize(
    "answer,expected",
    [
        ("yes", "no"),
        ("Yes", "no"),
        ("ja", "no"),
        (True, "no"),
        ("no", "fit"),
        (False, "fit"),
    ],
)
def test_the_model_answers_a_boolean_in_words(conn, answer, expected):
    """The prompt asks for yes/no/unknown, so that is what comes back.

    "yes" is not a Python True, and `contradicts` only compares a boolean
    requirement against a boolean -- so it found no contradiction and a kit the
    model had just called defective was stored as a match, with "Defekt Yes"
    written underneath it.
    """
    import playbooks

    add(conn, "a", "Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16")
    verdict = fit.from_extracted(
        conn,
        "a",
        1,
        playbooks.get_playbook("computing/memory"),
        {
            "criteria": {
                "stickCount": {"value": 2},
                "gbPerStick": {"value": 16},
                "generation": {"value": "DDR4"},
                "speedMhz": {"value": 3200},
                "casLatency": {"value": 16},
                "hasFunctionalDefect": {"value": answer},
            }
        },
        WANTS["fields"],
        text="Corsair Vengeance LPX 32GB (2x16) DDR4-3200 CL16",
    )
    assert verdict == expected
