"""Generation codes against first registration (generation)."""

import db_schema
import generation as g

YEARS = (2007, 2008)


def test_split_generation():
    assert g.split_generation("Yamaha R1 RN19") == ("Yamaha R1", "RN19")
    assert g.split_generation("Honda CBR 1000 RR") == ("Honda CBR 1000 RR", None)


def test_another_generation_in_the_title_is_out():
    assert g.judge_generation("YAMAHA R1 RN12 1. Hand", "{}", "RN19", YEARS)[0] == "no"


def test_first_registration_decides_when_the_title_is_silent():
    assert (
        g.judge_generation("Yamaha R1", '{"Erstzulassung": "Mai 2005"}', "RN19", YEARS)[
            0
        ]
        == "no"
    )
    assert (
        g.judge_generation(
            "Yamaha R1", '{"Erstzulassung": "Juni 2008"}', "RN19", YEARS
        )[0]
        is None
    )
    # One year of slack each way: registered a year after it was built.
    assert (
        g.judge_generation(
            "Yamaha R1", '{"Erstzulassung": "März 2009"}', "RN19", YEARS
        )[0]
        is None
    )


def test_nothing_to_go_on_leaves_it_open():
    verdict, reason = g.judge_generation("Yamaha R1 wenig km", "{}", "RN19", YEARS)
    assert verdict == "open" and "RN19" in reason


def test_years_are_asked_once_and_kept(tmp_path):
    conn = db_schema.connect(str(tmp_path / "g.db"))
    calls = []

    def ask(model, code):
        calls.append((model, code))
        return (2007, 2008)

    assert g.years_for(conn, "Yamaha R1", "RN19", ask=ask) == (2007, 2008)
    assert g.years_for(conn, "Yamaha R1", "RN19", ask=ask) == (2007, 2008)
    assert len(calls) == 1
