"""The model a model list names, read from titles (hunt_identity)."""

import hunt_identity as h

MODELS = ["Yamaha R1 RN19", "Honda CBR 1000 RR"]


def test_titles_that_name_one_of_the_models():
    for title in [
        "YAMAHA R1 RN12 1. Hand",
        "Honda Cbr 1000rr",
        "Honda CBR1000RR SC57 Fireblade",
        "Yamaha YZF-R1 2008",
        "Honda CBR 1000 RR Fireblade SC57 LED",
    ]:
        assert h.names_a_model(title, MODELS), title


def test_a_loose_search_result_is_not_the_model():
    # Kleinanzeigen returned this for "yamaha r1"; glued across " - 1." it read "r1".
    assert not h.names_a_model("Yamaha WR 125 R - 1. HAND", MODELS)


def test_a_request_is_not_an_offer():
    assert h.is_request("Suche Honda CBR 1000RR Fireblade")
    assert h.is_request("  gesucht: Yamaha R1")
    assert not h.is_request("Honda CBR 1000RR, suche Tausch")


def test_model_keys_drop_brand_and_generation():
    assert h.model_keys("Yamaha R1 RN19") == {"r1"}
    assert h.model_keys("Honda CBR 1000 RR") == {"cbr1000rr"}
