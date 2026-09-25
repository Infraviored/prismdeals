"""Requirements in the buyer's own words (wishes, fit._own_words)."""

import fit
import wishes

ABS = {
    "id": "own_abs",
    "label": "ABS",
    "importance": "low",
    "buyer_wants": {"present": True},
}


def test_a_wish_is_read_as_words_with_negation():
    assert wishes.read_wish(ABS, "Honda CBR mit ABS") is True
    assert wishes.read_wish(ABS, "Honda cbr1000rr, SC59, ohne ABS, 24.900 km") is False
    assert wishes.read_wish(ABS, "Honda CBR C-ABS Version") is True
    assert wishes.read_wish(ABS, "Honda CBR, Fabrikat") is None  # "abs" inside a word


def test_a_number_wish_is_compared():
    ps = {"id": "own_ps", "label": "mindestens 150 PS", "buyer_wants": {"min": 150}}
    assert wishes.read_wish(ps, "Leistung 178 PS, Top") is True
    assert wishes.read_wish(ps, "Leistung 98 PS") is False


def test_an_unmentioned_wish_never_changes_the_verdict():
    facts, verdict, _ = fit._own_words([ABS], "Honda CBR 1000 RR, Top Zustand")
    assert verdict is None and facts == {}


def test_a_must_in_own_words_decides():
    must = {**ABS, "importance": "high"}
    assert fit._own_words([must], "ohne ABS")[1] == "reject"
    assert fit._own_words([must], "Top Zustand")[1] == "unclear"
    assert fit._own_words([must], "mit ABS")[1] is None
