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
    """Each title fails on exactly one thing, and says which.

    The first version of this test used "DDR3 RAM 32GB Corsair Vengeance
    1600MHz (4x 8GB)", which fails on the generation, the speed and the stick
    count at once -- so deleting the generation reader outright left the test
    green. A title that can be rejected for three reasons proves none of them.
    """
    generation = text_facts.judge(
        MEMORY, WANTS, "DDR3 RAM 32GB Corsair Vengeance 3200MHz CL16 (2x 16GB)"
    )
    assert generation[0] == "reject"
    assert generation[2] == ["Generation DDR3 statt DDR4"], generation[2]

    form = text_facts.judge(
        MEMORY, WANTS, "32GB Corsair Vengeance SODIMM DDR4 (2x 16GB) 3200 CL16"
    )
    assert form[0] == "reject"
    assert form[2] == ["Bauform Sodimm statt Dimm"], form[2]


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
    """`read_stated` is what the text says; `read` adds what silence implies.

    Keeping them apart matters: an assumption passed on as settled shielded a
    real statement, and a broken kit carried a green tick because its title had
    not mentioned the fault.
    """
    assert text_facts.read_stated(MEMORY, "") == {}
    assert text_facts.read_stated(MEMORY, None) == {}
    assert text_facts.read_stated(MEMORY, "Corsair Vengeance") == {
        "productLine": "vengeance"
    }

    # `read` fills in what only gets written when it is true.
    assumed = text_facts.read(MEMORY, "Corsair Vengeance")
    assert assumed["hasFunctionalDefect"] is False
    assert assumed["formFactor"] == "dimm"


def test_the_reading_patterns_never_reach_a_model():
    """A field carries both how to read it from a title and how to ask a model
    for it. The first is compiled patterns and functions; handing those on put
    a lambda into a JSON dump -- "Object of type function is not JSON
    serializable" -- and failed sixteen listings at once."""
    import json

    fields = playbooks.extraction_fields(MEMORY)
    json.dumps(fields)  # raises if anything unserialisable survived

    assert all("text_patterns" not in f for f in fields)
    assert all("absent_means" not in f for f in fields)

    # And the playbook itself keeps them, because the reader needs them.
    assert any("text_patterns" in f for f in MEMORY["fields"])


HEILIGENHAUS = """32GB Corsair Vengeance LPX DDR4 RAM Arbeitsspeicher
Ich verkaufe hier zwei Arbeitsspeicher-Module aus der Vengeance LPX Serie von Corsair.
- 2 Stück RAM-Module je 16GB
- Typ: DDR4
Die Riegel sind in einem sehr guten Zustand."""


def test_sticks_and_size_written_out_in_words_are_read():
    # Listing 3507841883: the kit was judged unclear because "2 Stück
    # RAM-Module je 16GB" was not recognised as two sticks of 16 GB.
    facts = text_facts.read(MEMORY, HEILIGENHAUS)
    assert facts["stickCount"] == 2
    assert facts["gbPerStick"] == 16
    assert text_facts.read(MEMORY, "zwei Riegel à 16 GB, DDR4")["stickCount"] == 2


def test_unclear_says_what_is_missing_first():
    # The stored reason keeps the first three entries; "DDR4; DIMM; kein
    # Defekt" under "unclear" said nothing about why.
    v, _, reasons = text_facts.judge(MEMORY, WANTS, HEILIGENHAUS)
    assert v == "unclear"
    assert reasons[0].endswith("nicht angegeben")
    assert any("Takt" in r for r in reasons[:2])
    assert any("Latenz" in r for r in reasons[:2])
