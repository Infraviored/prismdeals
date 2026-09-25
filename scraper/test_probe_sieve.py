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


def test_intent_musts_are_read_from_laptop_titles_despite_a_playbook():
    """ "32 GB RAM" and "OLED-Display" come from the intent model, not the playbook."""
    import playbooks
    from probe_sieve import sieve_card

    laptop = playbooks.playbook_for_category_code("c278")
    musts = [
        {"id": "ram", "label": "32 GB RAM", "type": "number", "want": {"min": 32}},
        {
            "id": "display_oled",
            "label": "OLED-Display",
            "type": "boolean",
            "want": {"present": True},
        },
    ]
    card = lambda title: {"title": title, "description": ""}  # noqa: E731
    assert (
        sieve_card(card("Asus Zenbook 14 OLED 32GB RAM 1TB SSD"), musts, laptop)[0]
        == "likely"
    )
    # 16 GB near "RAM" rules it out; the 1TB of the SSD is not read as RAM.
    assert sieve_card(card("Lenovo Yoga 16GB RAM 1TB OLED"), musts, laptop)[0] == "no"
    assert sieve_card(card("Dell XPS 13 OLED"), musts, laptop)[0] == "unclear"


def test_a_width_in_the_title_decides_a_wardrobe():
    from probe_sieve import sieve_card

    musts = [
        {
            "id": "widthCm",
            "label": "Breite höchstens 120 cm",
            "type": "number",
            "want": {"max": 120},
        }
    ]
    assert sieve_card({"title": "Kleiderschrank Breite 118 cm"}, musts)[0] == "likely"
    assert sieve_card({"title": "Kleiderschrank Breite 180 cm"}, musts)[0] == "no"
    assert sieve_card({"title": "Kleiderschrank weiß"}, musts)[0] == "unclear"


def test_a_bare_number_is_never_a_search_term():
    import probe_ladder

    musts = [{"id": "ram", "label": "32 GB RAM", "type": "number", "want": {"min": 32}}]
    terms = [
        r["term"]
        for r in probe_ladder.build_ladder("features", [], musts, [], [], "c278", {})
    ]
    assert "32" not in terms and "32gb" in terms


def test_a_german_thousands_dot_is_not_a_decimal_point():
    """ "45.000 km" was read as 45 and passed a must of at most 30000."""
    from probe_sieve import read_number

    assert read_number("kilometerstand 45.000 km", "Kilometerstand km") == 45000
    assert read_number("gewicht 2,5 kg", "Gewicht kg") == 2.5
    assert read_number("1.5 kg leicht", "Gewicht kg") == 1.5
