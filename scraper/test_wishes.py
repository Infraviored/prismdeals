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


def test_denials_after_the_word_and_across_a_list():
    abs_, esp = {"label": "ABS"}, {"label": "ESP"}
    assert wishes.read_wish(abs_, "ABS nicht vorhanden") is False
    assert wishes.read_wish(abs_, "ABS: nein") is False
    assert wishes.read_wish(esp, "Ohne ABS und ESP") is False
    assert wishes.read_wish(abs_, "Nicht gefahren, ABS") is True
    assert wishes.read_wish(abs_, "Kein Kratzer, mit ABS") is True


def test_a_long_word_is_found_inside_a_compound_a_short_one_is_not():
    koffer = {"label": "Koffer"}
    assert wishes.read_wish(koffer, "Alukoffer dabei") is True
    assert wishes.read_wish(koffer, "mit Seitenkoffern") is True
    assert wishes.read_wish({"label": "ABS"}, "Absatz schief") is None


def test_values_as_keywords_let_a_perfect_kit_fit():
    """The setup writes the must's value as its words: "DDR4", 3200, "2x16 GB"."""
    text = "Corsair Vengeance LPX 32GB (2x16GB) DDR4 3200MHz CL16"
    for keywords in (["ddr4"], ["2x16 gb", "2x16gb"], ["3200"], ["16"]):
        field = {"label": "x", "keywords": keywords, "buyer_wants": {"present": True}}
        assert wishes.read_wish(field, text) is True, keywords
    assert wishes.read_wish({"label": "x", "keywords": ["16"]}, "Kit 3160") is None


def test_a_wish_for_absence_is_met_by_a_denial():
    field = {"label": "Unfallschaden", "buyer_wants": {"present": False}}
    assert wishes.read_wish(field, "kein Unfallschaden, Scheckheft") is True
    assert wishes.read_wish(field, "Unfallschaden vorne links") is False
    assert wishes.read_wish(field, "Top Zustand") is None
