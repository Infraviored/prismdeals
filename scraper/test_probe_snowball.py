"""Unit tests for model snowballing and title-token tests (plan §5.5, §5.10)."""

import probe_snowball


def test_snowball_finds_real_model_names_without_stop_words():
    """Snowballing on laptop titles extracts >= 3 real models and no stop words."""
    titles = [
        "Lenovo ThinkPad T480s i7 16GB 512GB SSD Top Zustand",
        "ThinkPad T480s Notebook OVP wie neu",
        "Lenovo ThinkPad T480s Laptop 14 Zoll",
        "Dell XPS 13 9300 i7 16GB RAM 4K Touch",
        "Dell XPS 13 9300 Top Zustand mit Zubehör",
        "Laptop Dell XPS 13 9300 Notebook 512GB",
        "Asus ZenBook 14 OLED Ryzen 7 16GB",
        "Asus ZenBook 14 OLED wie neu OVP",
        "ZenBook 14 OLED 1TB SSD Top Zustand",
        "Apple MacBook Air M1 8GB 256GB Space Grey",
        "MacBook Air M1 fast neu mit Rechnung",
        "Apple MacBook Air M1 Top Zustand OVP",
    ]

    models = probe_snowball.extract_models_from_titles(titles, category_code="c278")

    assert len(models) >= 3

    # Check that real models are discovered
    models_lower = [m.lower() for m in models]
    assert any("thinkpad t480s" in m for m in models_lower)
    assert any("xps 13" in m for m in models_lower)
    assert any("zenbook 14 oled" in m for m in models_lower) or any(
        "zenbook" in m for m in models_lower
    )

    # Check that stop words / generic filler words are NOT emitted as models
    for m in models_lower:
        assert m not in (
            "top zustand",
            "laptop",
            "notebook",
            "ssd",
            "ram",
            "ovp",
            "wie neu",
        )


def test_title_token_mattress_allowed_wardrobe_not():
    """Title-token test: mattress size is allowed (>=60%), wardrobe width is not (<30%)."""
    # Mattress titles: sellers almost always put dimensions in titles
    mattress_titles = [
        "Matratze 140x200 Bett1 Bodyguard wie neu",
        "Bett mit Matratze 140x200cm zu verkaufen",
        "Emma One Matratze 140 x 200 cm hart",
        "Federkernmatratze 140x200 guter Zustand",
        "Kaltschaummatratze 140x200 OVP",
        "Matratze 140x200 cm Malfors Ikea",
        "Komfortschaum Matratze 140x200",
        "Gästebett inkl. Matratze 140x200",
        "Matratze für Doppelbett 90x200",
        "Schöne weiche Matratze weiß",
    ]
    # 8 of 10 mention 140x200 -> 80% (>= 60%)
    allowed, share = probe_snowball.check_title_token("140x200", mattress_titles)
    assert allowed is True
    assert share >= 0.60

    # Wardrobe titles: sellers rarely put specific numeric width in title
    wardrobe_titles = [
        "IKEA PAX Kleiderschrank weiß 3-türig",
        "Großer Kleiderschrank Schlafzimmer Holz",
        "Kleiderschrank mit Spiegeltür top Zustand",
        "Schlafzimmerschrank Kleiderschrank braun",
        "Ikea Kleiderschrank Brimnes",
        "Kleiderschrank massiv Kiefer",
        "Schrank für Schlafzimmer Selbstabholer",
        "Eckkleiderschrank weiß modern",
        "Kleiderschrank 120 cm breit weiß",  # only 1 has 120 cm
        "Vintage Kleiderschrank Holz antik",
    ]
    # 1 of 10 mentions 120 cm -> 10% (< 30%)
    allowed, share = probe_snowball.check_title_token("120 cm", wardrobe_titles)
    assert allowed is False
    assert share < 0.30
