"""Unit tests for probe ladder builder per hunt type (plan §5.2, §5.10)."""

import probe_ladder


def test_exact_ladder_broadens_frequency_and_latency():
    """Exact hunt drops spec tokens like CL16, 3200MHz to find mislabeled RAM."""
    seeds = ["Corsair Vengeance 32GB 3200MHz CL16"]
    rungs = probe_ladder.build_ladder(
        hunt_type="exact",
        seed_terms=seeds,
        musts=[],
        prefs=[],
        models=[],
        category_code="c225",
    )
    terms = [r["term"] for r in rungs]
    assert "Corsair Vengeance 32GB 3200MHz CL16" in terms
    assert "corsair vengeance 32gb" in terms


def test_shortlist_ladder_generates_spelling_variants():
    """Shortlist adds compact variants without spaces."""
    models = ["CBR 1000 RR", "YZF R1"]
    rungs = probe_ladder.build_ladder(
        hunt_type="shortlist",
        seed_terms=[],
        musts=[],
        prefs=[],
        models=models,
        category_code="c305",
    )
    terms = [r["term"] for r in rungs]
    assert "CBR 1000 RR" in terms
    assert "CBR1000RR" in terms
    assert "YZF R1" in terms
    assert "YZFR1" in terms


def test_class_ladder_emits_class_and_models():
    """Class ladder probes the broad class term plus each proposed model."""
    rungs = probe_ladder.build_ladder(
        hunt_type="class",
        seed_terms=["supersportler"],
        musts=[],
        prefs=[],
        models=["GSX-R 1000", "Ninja ZX-10R"],
        category_code="c305",
    )
    terms = [r["term"] for r in rungs]
    assert "supersportler" in terms
    assert "GSX-R 1000" in terms
    assert "Ninja ZX-10R" in terms


def test_features_ladder_combines_strong_musts_and_models():
    """Features ladder starts with category/seed, strong musts, pairs, and models."""
    musts = [
        {"id": "panelType", "label": "OLED", "want": {"match": True}},
        {"id": "ramGb", "label": "RAM (GB)", "want": {"min": 32}},
    ]
    rungs = probe_ladder.build_ladder(
        hunt_type="features",
        seed_terms=["laptop"],
        musts=musts,
        prefs=[],
        models=["ZenBook 14 OLED"],
        category_code="c278",
    )
    terms = [r["term"] for r in rungs]
    assert "laptop" in terms
    assert "oled" in terms
    assert "32gb" in terms
    assert "oled 32gb" in terms
    assert "ZenBook 14 OLED" in terms


def test_fit_ladder_includes_size_tokens():
    """Fit ladder combines item type with dimensions."""
    musts = [
        {
            "id": "dim",
            "label": "Größe (cm)",
            "want": {"min": "140x200", "max": "140x200"},
        },
    ]
    rungs = probe_ladder.build_ladder(
        hunt_type="fit",
        seed_terms=["matratze"],
        musts=musts,
        prefs=[],
        models=[],
        category_code="c93",
    )
    terms = [r["term"] for r in rungs]
    assert "matratze" in terms
    assert "matratze 140x200" in terms


def test_opportunity_ladder_uses_category_without_term():
    """Opportunity hunt probes the category net without search terms."""
    rungs = probe_ladder.build_ladder(
        hunt_type="opportunity",
        seed_terms=[],
        musts=[],
        prefs=[],
        models=[],
        category_code="c84",
    )
    assert len(rungs) >= 1
    assert rungs[0]["term"] is None
    assert "opportunity" in rungs[0]["label"]


def test_ladder_caps_at_max_rungs():
    """Ladders are strictly capped at MAX_RUNGS (8)."""
    many_seeds = [f"item-{i}" for i in range(20)]
    rungs = probe_ladder.build_ladder(
        hunt_type="taste",
        seed_terms=many_seeds,
        musts=[],
        prefs=[],
        models=[],
        category_code="c88",
    )
    assert len(rungs) == probe_ladder.MAX_RUNGS


def test_a_model_list_also_searches_without_the_generation_code():
    import probe_ladder

    terms = [
        r["term"]
        for r in probe_ladder.build_ladder(
            "shortlist", [], [], [], ["Yamaha R1 RN19", "Honda CBR 1000 RR"], "c305", {}
        )
    ]
    # Sellers write "R1", rarely "R1 RN19" (0 offers vs 115, measured).
    assert "Yamaha R1" in terms
    assert "Honda CBR 1000" not in terms  # "RR" is part of the model, not a code
    assert "CBR1000RR" in terms  # glued as sellers write it
    assert "YamahaR1RN19" not in terms  # brand glued to the model found nothing
