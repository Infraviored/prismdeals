"""Unit tests for probe pre-sieve and price filtering (plan §5.3)."""

import playbooks
import probe_sieve


def test_sieve_with_playbook_detects_contradictions():
    """Playbook sieve marks card 'no' when stated specs contradict musts."""
    playbook = playbooks.playbook_for_category_code("c278")  # laptops
    musts = [{"id": "ramGb", "label": "RAM", "want": {"min": 32}}]

    card_low_ram = {
        "title": "Dell Latitude 7490 16GB RAM i7 SSD",
        "description": "Funktioniert einwandfrei.",
    }
    verdict, reasons = probe_sieve.sieve_card(card_low_ram, musts, playbook)
    assert verdict == "no"
    assert any("16" in r for r in reasons)

    card_high_ram = {
        "title": "Dell Latitude 7490 32GB RAM i7 SSD",
        "description": "Top Laptop.",
    }
    verdict, reasons = probe_sieve.sieve_card(card_high_ram, musts, playbook)
    assert verdict == "likely"


def test_sieve_rejects_defects():
    """Defects stated in title or description reject the card."""
    playbook = playbooks.playbook_for_category_code("c278")
    musts = [{"id": "hasFunctionalDefect", "label": "Defekt", "want": {"match": False}}]

    card_defekt = {
        "title": "ThinkPad T480s defekt für Bastler",
        "description": "Geht nicht mehr an.",
    }
    verdict, reasons = probe_sieve.sieve_card(card_defekt, musts, playbook)
    assert verdict == "no"


def test_sieve_adhoc_keywords_without_playbook():
    """Ad-hoc musts without a playbook use keyword matching."""
    musts = [
        {"id": "oled", "label": "OLED", "want": {"match": True}},
        {"id": "touch", "label": "Touchscreen", "want": {"match": True}},
    ]
    card_matching = {
        "title": "Asus ZenBook OLED Touchscreen Notebook",
        "description": "Wenig genutzt.",
    }
    verdict, _ = probe_sieve.sieve_card(card_matching, musts, playbook=None)
    assert verdict == "likely"

    card_partial = {
        "title": "Asus ZenBook OLED Notebook",
        "description": "Kein Touch.",
    }
    verdict, _ = probe_sieve.sieve_card(card_partial, musts, playbook=None)
    assert verdict == "unclear"


def test_price_matches():
    """Price checks correctly filter by min/max."""
    card = {"price_eur": 650}
    assert probe_sieve.price_matches(card, {"min": 500, "max": 800}) is True
    assert probe_sieve.price_matches(card, {"max": 600}) is False
    assert probe_sieve.price_matches(card, {"min": 700}) is False
    assert probe_sieve.price_matches({"price_eur": None}, {"min": 500}) is True
