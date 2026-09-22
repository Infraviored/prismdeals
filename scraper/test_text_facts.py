"""Reading what a listing already says, before anyone pays to ask.

Every string here is a title the search for "corsair vengeance 32gb" really
returned. Between a search and a model call there is a free step: read the
seller's own words. A title like "32GB DDR3 CORSAIR VENGEANCE (4x8GB)" states
four facts, three of which fail a buyer who wants two DDR4 sticks, and a model
asked about it would return the same four at a thousand times the cost.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import playbooks  # noqa: E402
import text_facts  # noqa: E402

MEMORY = playbooks.get_playbook("computing/memory")

WANTS = [
    {"id": "stickCount", "buyer_wants": {"min": 2, "max": 2}},
    {"id": "gbPerStick", "buyer_wants": {"min": 16, "max": 16}},
    {"id": "generation", "buyer_wants": {"preferred": ["ddr4"]}},
    {"id": "formFactor", "buyer_wants": {"preferred": ["dimm"]}},
    {"id": "speedMhz", "buyer_wants": {"min": 3200}},
    {"id": "casLatency", "buyer_wants": {"max": 16}},
    {"id": "hasFunctionalDefect", "buyer_wants": {"match": False}},
]


def verdict(title, settled=None):
    return text_facts.judge(MEMORY, WANTS, title, settled)[0]


def test_a_full_title_answers_everything():
    assert (
        verdict("Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16") == "candidate"
    )


def test_four_sticks_are_read_however_the_seller_multiplies():
    """x, ×, * and the words -- all of them on one page of results."""
    for title in [
        "32GB DDR4 RAM Corsair Vengeance LPX 4x8GB 2666MHz CL16",
        "Corsair Vengeance LP  32Gb  8Gb mal 4",
        "Corsair Vengeance Rgb Pro 4*8gb Set (32GB) 3200",
        "Corsair Vengeance RGB Pro 32 GB (4 Times 8 GB)",
        "32 GB Corsair Vengeance LPX DDR4 RAM (4x 8GB) 3000 MHz CL15",
    ]:
        assert verdict(title) == "reject", title


def test_a_speed_glued_to_its_unit_is_still_read():
    """ "3200MHz" has no word boundary after the 0, which is how the commonest
    spelling went unread and cost a page fetch to learn."""
    facts = text_facts.read(MEMORY, "CORSAIR Vengeance 32GB DDR4 RAM 3200MHz")
    assert facts["speedMhz"] == 3200


def test_the_wrong_generation_and_the_wrong_form_factor_are_rejected():
    assert verdict("DDR3 RAM 32GB Corsair Vengeance 1600MHz (4x 8GB)") == "reject"
    assert verdict("32GB Corsair Vengeance SODIMM DDR4 (2x 16GB) 3200 CL16") == "reject"


def test_a_stated_fault_is_a_rejection_even_at_the_exact_specification():
    assert (
        verdict("Teildefekt Corsair Vengeance 32GB (2x 16GB) DDR4-3200 CL16")
        == "reject"
    )


def test_silence_answers_where_only_the_bad_case_is_ever_written():
    """Nobody labels a desktop module "DIMM" and nobody advertises that their
    memory works. Requiring those to be stated left every clean title unclear
    and would have sent all fifty to the model."""
    facts = text_facts.read(
        MEMORY, "Corsair Vengeance LPX 32 GB (2×16 GB) DDR4-3200 CL16"
    )
    assert facts["formFactor"] == "dimm"
    assert facts["hasFunctionalDefect"] is False


def test_a_title_that_leaves_the_timing_out_is_a_question_not_a_no():
    assert verdict("32GB Corsair Vengeance LPX DDR4 RAM Kit (2x16GB)") == "unclear"


def test_a_contradiction_of_something_settled_is_a_doubt():
    """ "Kann vor Ort getestet werden allerdings kann mein Testsystem nur
    2666MHz" is the seller's mainboard, under a title that said 3200. The photo
    later read the part number and proved the kit was right."""
    settled = {"speedMhz": 3200}
    assert verdict("Testsystem kann nur 2666MHz", settled) == "unclear"
    assert verdict("Testsystem kann nur 2666MHz") == "reject"


def test_nothing_stated_is_nothing_claimed():
    assert text_facts.read(MEMORY, "") == {}
    assert text_facts.read(MEMORY, None) == {}
