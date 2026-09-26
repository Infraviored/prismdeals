"""Messages to sellers: the buyer's tone, the listing, the thread; machine tells refused once."""

import pytest

from graph import llm, message

TONE = "Servus, duzen, kurz. Schluss: LG Florian"


def test_a_first_message_asks_what_the_listing_leaves_open():
    prompts = []
    out = message.draft(
        {
            "kind": "first",
            "tone": TONE,
            "title": "Honda CBR",
            "price": "6200 € VB",
            "open": ["ABS"],
        },
        ask=lambda p, **_: prompts.append(p)
        or {"text": "Servus, hat sie ABS? LG Florian"},
    )
    assert out == {"text": "Servus, hat sie ABS? LG Florian"}
    assert (
        TONE in prompts[0]
        and "ABS" in prompts[0]
        and "Zum Preis nichts sagen" in prompts[0]
    )


def test_a_reply_answers_the_thread_and_promises_nothing_new():
    prompts = []
    message.draft(
        {
            "kind": "reply",
            "tone": TONE,
            "title": "Honda CBR",
            "thread": [
                {"mine": True, "text": "Hat sie ABS?"},
                {"mine": False, "text": "Ja, hat sie. Wann willst du schauen?"},
            ],
        },
        ask=lambda p, **_: prompts.append(p)
        or {"text": "Servus, passt [Termin]? LG Florian"},
    )
    assert "Ich: Hat sie ABS?" in prompts[0] and "Verkäufer: Ja, hat sie." in prompts[0]
    assert "[Termin]" in prompts[0]


def test_a_draft_that_reads_like_a_machine_is_written_again():
    answers = iter(
        [
            {"text": "Hallo — ich hoffe, es geht Ihnen gut."},
            {"text": "Servus, noch da? LG Florian"},
        ]
    )
    prompts = []
    out = message.draft(
        {"kind": "first", "tone": TONE, "title": "x"},
        ask=lambda p, **_: prompts.append(p) or next(answers),
    )
    assert out["text"] == "Servus, noch da? LG Florian"
    assert "Gedankenstrich" in prompts[1] and "Floskel" in prompts[1]


def test_without_a_tone_there_is_no_draft():
    with pytest.raises(llm.NoModel):
        message.draft(
            {"kind": "first", "tone": "", "title": "x"},
            ask=lambda p, **_: {"text": "x"},
        )
