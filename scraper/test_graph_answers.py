"""Model answers that cannot be used are no answer: NoModel, never a crash or a guess."""

import sqlite3

import pytest

import db_schema
from graph import draft, hunts, knowledge, llm, taxonomy
from test_graph_hunts import _answers, _doc


@pytest.fixture
def conn():
    c = sqlite3.connect(":memory:")
    db_schema.apply_schema(c)
    taxonomy.seed(c)
    return c


def _drafting(answer):
    def ask(prompt, **_):
        if "In welcher Kleinanzeigen-Kategorie" in prompt:
            return {"category_code": "305"}
        return answer

    return ask


def test_a_draft_reads_numbers_as_written(conn):
    doc = draft.draft(
        conn,
        "CBR unter 5000 km bis 9000 €",
        ask=_drafting(
            {
                "name": "CBR",
                "max_price": "9000",
                "targets": [
                    {
                        "typed": "Honda CBR 1000 RR",
                        "conditions": [
                            {
                                "label": "Kilometerstand",
                                "op": "max",
                                "value": "5.000 km",
                                "importance": "must",
                            }
                        ],
                    }
                ],
                "conditions": [
                    {
                        "label": "Leistung",
                        "op": "min",
                        "value": "100",
                        "importance": "wish",
                    }
                ],
            }
        ),
    )
    assert doc["frame"]["max_price"] == 9000
    assert doc["targets"][0]["conditions"][0]["value"] == 5000
    assert doc["conditions"][0]["value"] == 100


@pytest.mark.parametrize(
    "answer",
    [
        {
            "targets": [
                {
                    "typed": "CBR",
                    "conditions": [
                        {
                            "label": "km",
                            "op": "max",
                            "value": "viele",
                            "importance": "must",
                        }
                    ],
                }
            ]
        },
        {"targets": [{"typed": "CBR"}], "max_price": "teuer"},
        {"targets": ["CBR"]},
        {"targets": "CBR"},
        {"targets": [{"typed": "CBR", "conditions": "keine"}]},
        ["CBR"],
    ],
)
def test_a_draft_answer_that_cannot_be_used_is_no_answer(conn, answer):
    with pytest.raises(llm.NoModel):
        draft.draft(conn, "CBR", ask=_drafting(answer))


def test_a_category_answer_that_is_no_object_is_no_answer(conn):
    with pytest.raises(llm.NoModel):
        draft.draft(conn, "CBR", ask=lambda p, **_: ["305"])


def test_a_brief_answer_that_is_no_object_is_no_answer(conn, monkeypatch):
    cid = hunts.save(conn, _doc(), ask=_answers)
    monkeypatch.setattr(knowledge, "research_value", lambda median, profile: "deep")
    with pytest.raises(llm.NoModel):
        knowledge.brief(conn, cid, ask=lambda p, max_tokens=0: ["Regler prüfen"])


def test_a_claim_without_a_known_kind_weight_or_check_is_not_filed(conn):
    cid = hunts.save(conn, _doc(), ask=_answers)
    target = hunts.target_ids(conn, cid)[0]
    from graph import store

    key = store.node(conn, target)["key"]
    good = {
        "node": key,
        "kind": "weakness",
        "statement": "Der Regler brennt durch.",
        "check_path": "ask",
        "weight": "costly",
        "sources": [],
    }
    rows = knowledge.classify(
        conn,
        cid,
        "Antwort",
        ask=lambda p, max_tokens=0: [
            good,
            "Freitext statt Objekt",
            {**good, "statement": "A", "kind": "gerücht"},
            {**good, "statement": "B", "weight": "schlimm"},
            {**good, "statement": "C", "check_path": "fühlen"},
        ],
        url_checker=lambda u: True,
    )
    assert [r["statement"] for r in rows] == ["Der Regler brennt durch."]


@pytest.mark.parametrize(
    "answer", [["abs"], {"attributes": ["abs"]}, {"attributes": {"label": "ABS"}}]
)
def test_an_attribute_answer_that_cannot_be_used_is_no_answer(conn, answer):
    from graph import place

    cid = hunts.save(conn, _doc(conditions=[]), ask=_answers)
    target = hunts.target_ids(conn, cid)[0]
    with pytest.raises(llm.NoModel):
        place.define_attributes(conn, target, ["ABS"], ask=lambda p, **_: answer)


def test_regex_backslashes_survive_a_model_that_writes_them_once():
    from graph import llm, place

    raw = llm.parse_json(
        '{"attributes": [{"label": "Takt", "id": "takt", "type": "number", '
        '"readers": ["regex:\\b(\\d{4})\\s?MHz"]}]}'
    )
    (attr,) = place._clean_attributes(raw, 1)
    assert attr["readers"] == [r"regex:\b(\d{4})\s?MHz"]


def test_a_measure_read_without_its_unit_is_the_same_value():
    from graph.place import _same

    assert _same("90 x 200", "90 x 200 cm")
    assert _same("90x200", "90x200 cm")
    assert not _same("90 x 10", "90 x 10 x 200")
    assert not _same("Schwarz", "Schwarz-Weiß")
    assert _same("Schwarz", "schwarz")
    assert _same("3200", "3200 MHz")
    assert not _same("RTX 3080", "RTX 3080 Ti")
    assert not _same("90x200", "90x200 Kaltschaum")


def test_json_with_words_around_and_mixed_escapes_parses():
    from graph import llm

    raw = 'Hier ist das JSON:\n{"readers": ["regex:\\\\d+", "regex:\\s?(\\d)"]}'
    assert llm.parse_json(raw) == {"readers": ["regex:\\d+", "regex:\\s?(\\d)"]}
    assert llm.parse_json('{"r": "regex:\\\\d+"}') == {"r": "regex:\\d+"}


def test_a_reader_that_reads_none_of_the_few_titles_stating_it_fails():
    from graph.place import _failures

    attr = {
        "label": "Farbe",
        "type": "text",
        "options": None,
        "readers": ["regex:(nie)"],
    }
    samples = [f"Titel {i}" for i in range(12)]
    examples = {str(i): None for i in range(12)} | {"0": "Rot", "1": "Blau"}
    assert _failures(attr, samples, examples)
