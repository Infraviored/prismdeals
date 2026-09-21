"""The cascade, tested against titles the search really returned.

Every string below is verbatim from the 87 offers a search for "corsair
vengeance 32gb" answered with. The point of the sieve is that searching for
exactly what you want finds nothing -- the precise query returned 0 -- so you
search wide and narrow afterwards, cheapest test first.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import sieve  # noqa: E402
from specs.ddr4_kit import two_by_sixteen_ddr4  # noqa: E402

SPEC = two_by_sixteen_ddr4()


def judge(title, already=None):
    verdict, met, reasons = SPEC.judge(title, already)
    return verdict, reasons


def test_the_exact_thing_is_a_candidate_from_the_title_alone():
    verdict, _ = judge("Corsair Vengeance LPX 32 GB DDR4-3200 CL16 – 2×16 GB")
    assert verdict == "candidate"


def test_four_eight_gigabyte_sticks_are_rejected_however_they_are_written():
    """32 GB as 4x8 is the commonest offer in this search and the one thing the
    buyer does not want. Sellers write it five different ways."""
    for title in [
        "Corsair Vengeance Pro 32GB (4x8) DDR RAM",
        "Corsair Vengeance LP  32Gb  8Gb mal 4",
        "32 GB Corsair Vengeance LPX DDR4 RAM (4x 8GB) 3000 MHz CL15",
        "32GB DDR4 RAM Corsair Vengeance LPX 4x8GB 2666MHz CL16",
        "4x 8GB Corsair Vengeance LPX DDR4 3000MHz RAM (32GB)",
    ]:
        assert judge(title)[0] == "reject", title


def test_a_number_glued_to_a_unit_still_counts():
    """ "4x8GB" and "3000MHz" have no word boundary after the digit, so a \\b
    anchored pattern missed both -- the commonest way sellers write them."""
    assert judge("Corsair Vengeance LPX 32GB (2x16GB) DDR4 3000MHz RAM")[0] == "reject"
    assert judge("Corsair Vengeance LPX 32GB 4x8GB DDR4")[0] == "reject"


def test_the_wrong_generation_and_the_wrong_form_factor_are_rejected():
    assert judge("DDR3 RAM 32GB Corsair Vengeance 1600MHz")[0] == "reject"
    assert judge("32GB Corsair Vengeance SODIMM DDR4 (2x 16GB)")[0] == "reject"


def test_broken_memory_is_rejected_even_at_the_exact_specification():
    assert (
        judge("Teildefekt Corsair Vengeance 32GB (2x 16GB) DDR4-3200 CL16")[0]
        == "reject"
    )


def test_an_empty_box_is_rejected_but_a_boxed_kit_is_not():
    """Two good offers at 110 and 125 EUR were thrown away by a rule that
    matched the word "Verpackung" on its own. "Die äußere Verpackung ist
    vorhanden" means the memory comes boxed."""
    assert judge("Corsair Vengeance 32GB - nur die Verpackung")[0] == "reject"
    verdict, _ = judge(
        "Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16\n"
        "Die äußere Verpackung (Karton) sowie das Plastik-Gehäuse sind vorhanden."
    )
    assert verdict == "candidate"


def test_a_stated_wrong_speed_is_a_no_not_an_unknown():
    """Left unclear, it would cost a page fetch and then a model call to learn
    what the title already said."""
    assert judge("Corsair Vengeance LPX 32GB (2x16GB) DDR4-3600 CL18")[0] == "reject"


def test_a_description_that_contradicts_the_title_raises_a_doubt_not_a_verdict():
    """ "Kann vor Ort getestet werden allerdings kann mein Testsystem nur
    2666MHz" is the seller's mainboard, not the memory -- and it sat under a
    title that plainly said 3200. Rejecting on it threw away a kit that the
    photograph later proved was exactly right."""
    settled = {"layout", "generation", "speed", "latency"}
    verdict, reasons = judge(
        "32GB DDR4 (2x16) Corsair Vengeance RGB Pro 3200 MHz CL16\n"
        "Kann vor Ort getestet werden allerdings kann mein Testsystem nur 2666MHz",
        already=settled,
    )
    assert verdict == "unclear"
    assert any("contradicted" in r for r in reasons)


def test_a_title_missing_the_timing_is_unclear_rather_than_wrong():
    verdict, _ = judge("32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)")
    assert verdict == "unclear"


def test_the_price_limit_is_applied_before_any_rule():
    listings = [
        {
            "title": "Corsair Vengeance LPX 32GB (2x16GB) DDR4-3200 CL16",
            "price_eur": 400,
        }
    ]
    rejected, candidates, unclear = sieve.sift(SPEC, listings, lambda l: l["title"])
    assert len(rejected) == 1 and not candidates and not unclear
