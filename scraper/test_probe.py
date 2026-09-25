"""Tests for probe engine orchestrator, stop rules, and market picture (plan §5)."""

import db_schema
import probe
import probe_cache


def _make_card_html(listing_id, title, desc, price):
    return f"""
    <article class="aditem" data-adid="{listing_id}" data-href="/s-anzeige/{listing_id}">
      <script type="application/ld+json">{{"title": "{title}", "description": "{desc}"}}</script>
      <div class="aditem-main">
        <p class="aditem-main--middle--price-shipping--price">{price} €</p>
      </div>
      <div class="aditem-main--bottom">
        <span>86899 Landsberg am Lech</span>
      </div>
    </article>
    """


def _make_page_html(total_results, cards):
    cards_html = "\n".join(cards)
    return f"""
    <html>
      <body>
        <div class="breadcrump">
          <span class="breadcrump-summary">{total_results} Ergebnisse</span>
        </div>
        <ul id="srchrslt-adtable">
          {cards_html}
        </ul>
      </body>
    </html>
    """


class MockResponse:
    def __init__(self, text, status_code=200):
        self.text = text
        self.status_code = status_code


def test_gain_overlap_and_stop_logic(tmp_path):
    """Verify gain, overlap, keep/drop, and stop rules on synthetic rung data."""
    # Synthetic responses:
    # Rung 1 (seed): 10 cards, 8 likely, new -> high gain -> keep
    # Rung 2: 10 cards, identical to rung 1 -> gain = 0, overlap = 1.0 -> drop
    # Rung 3: 10 cards, identical to rung 1 -> gain = 0 -> second consecutive low gain -> stop probe!
    c1 = [
        _make_card_html(
            f"10{i}", f"Laptop OLED 32GB RAM {i}", "Guter Zustand", 600 + i * 10
        )
        for i in range(10)
    ]
    html1 = _make_page_html(10, c1)

    fetch_calls = []

    def mock_fetch(url):
        fetch_calls.append(url)
        return MockResponse(html1)

    payload = {
        "category_code": "c278",
        "hunt_type": "features",
        "musts": [{"id": "ramGb", "label": "RAM", "want": {"min": 32}}],
        "seed_terms": ["seed1", "seed2", "seed3", "seed4", "seed5"],
    }

    db_file = str(tmp_path / "test_probe.db")
    conn = db_schema.connect(db_file)

    result = probe.run_probe(payload, conn=conn, fetch_fn=mock_fetch)

    # Rung 1 was kept
    rungs = result["rungs"]
    assert len(rungs) >= 2
    assert rungs[0]["kept"] is True
    assert rungs[0]["gain"] > 0.5

    # Rung 2 had complete overlap -> dropped
    assert rungs[1]["overlap"] > 0.8
    assert rungs[1]["gain"] < 0.10
    assert rungs[1]["kept"] is False

    # Stopped early after 2 consecutive low-gain rungs; did not probe all 5 seeds
    assert len(rungs) < 5


def test_market_picture_budget_and_relax(tmp_path):
    """Test estimation, per_budget scaling, and relax signal calculation."""
    # 20 cards:
    # - 10 cards have OLED and 32GB RAM (prices 400, 500, 600, 700...)
    # - 10 cards have OLED but only 16GB RAM (prices 300..400)
    cards = []
    for i in range(10):
        cards.append(
            _make_card_html(
                f"20{i}", f"ZenBook 14 OLED 32GB RAM {i}", "Top", 400 + i * 40
            )
        )
    for i in range(10):
        cards.append(
            _make_card_html(
                f"30{i}", f"ZenBook 14 OLED 16GB RAM {i}", "Top", 300 + i * 20
            )
        )

    html = _make_page_html(100, cards)  # Total 100 on site, sampled 20

    def mock_fetch(url):
        return MockResponse(html)

    payload = {
        "category_code": "c278",
        "hunt_type": "features",
        "musts": [
            {"id": "panelType", "label": "OLED", "want": {"match": True}},
            {"id": "ramGb", "label": "32 GB RAM", "want": {"min": 32}},
        ],
        "seed_terms": ["zenbook oled"],
        "budget_steps": [500, 800],
    }

    db_file = str(tmp_path / "test_probe2.db")
    conn = db_schema.connect(db_file)

    result = probe.run_probe(payload, conn=conn, fetch_fn=mock_fetch)

    # Estimate
    est = result["estimate"]
    assert est["union_likely"] > 10  # Scaled up because total 100 > sampled 20
    assert est["median_price"] is not None

    # Budget
    budgets = result["per_budget"]
    assert len(budgets) == 2
    assert budgets[0]["max"] == 500
    assert budgets[1]["max"] == 800
    assert budgets[1]["likely"] >= budgets[0]["likely"]

    # Relax: without "32 GB RAM", all 20 cards are likely (2x increase over 10)
    relax = result["relax"]
    assert len(relax) >= 1
    ram_relax = next((r for r in relax if "ram" in r["must"].lower()), None)
    assert ram_relax is not None
    assert ram_relax["likely_without"] > est["union_likely"]


def test_probe_cache_and_node_terms(tmp_path):
    """Probe caches raw responses in probe_cache and records kept terms in node_terms."""
    cards = [_make_card_html("401", "ThinkPad T480s 32GB", "Super", 450)]
    html = _make_page_html(1, cards)

    fetch_count = 0

    def mock_fetch(url):
        nonlocal fetch_count
        fetch_count += 1
        return MockResponse(html)

    payload = {
        "category_code": "c278",
        "hunt_type": "exact",
        "seed_terms": ["thinkpad t480s"],
        "musts": [],
        "node_key": "laptops_perf",
    }

    db_file = str(tmp_path / "test_probe3.db")
    conn = db_schema.connect(db_file)

    # First probe: fetches from mock_fetch
    res1 = probe.run_probe(payload, conn=conn, fetch_fn=mock_fetch)
    assert fetch_count == 1

    # Node terms saved
    terms = probe_cache.load_node_terms(conn, "laptops_perf")
    assert "thinkpad t480s" in [t.lower() for t in terms]

    # Second probe: should hit probe_cache, fetch_count stays 1
    res2 = probe.run_probe(payload, conn=conn, fetch_fn=mock_fetch)
    assert fetch_count == 1
    assert len(res2["rungs"]) == len(res1["rungs"])


def test_a_wide_term_does_not_inflate_the_estimate(tmp_path):
    """A narrow term finds 20 fitting of 100; a wide one 0 fitting of 1000.

    Scaling the fitting sample by the summed totals made that 550 offers.
    """
    narrow = _make_page_html(
        100,
        [
            _make_card_html(f"40{i}", f"ZenBook 14 OLED 32GB RAM {i}", "Top", 500 + i)
            for i in range(20)
        ],
    )
    wide = _make_page_html(
        1000,
        [
            _make_card_html(f"50{i}", f"Laptop 8GB RAM {i}", "Top", 200 + i)
            for i in range(20)
        ],
    )

    def fetch(url):
        return MockResponse(narrow if "zenbook" in url else wide)

    payload = {
        "category_code": "c278",
        "hunt_type": "shortlist",
        "musts": [{"id": "ramGb", "label": "32 GB RAM", "want": {"min": 32}}],
        "models": ["zenbook oled", "laptop"],
    }
    conn = db_schema.connect(str(tmp_path / "wide.db"))
    result = probe.run_probe(payload, conn=conn, fetch_fn=fetch)
    assert result["estimate"]["union_likely"] == 100


def test_page_two_goes_where_the_crawler_puts_it():
    import search_url

    url = "https://www.kleinanzeigen.de/s-oled-laptop/preis::800/k0c278"
    assert search_url.with_page(url, 2) == (
        "https://www.kleinanzeigen.de/s-oled-laptop/seite:2/preis::800/k0c278"
    )
    assert search_url.with_page(url, 1) == url


def test_a_term_that_finds_nothing_is_never_kept(tmp_path):
    empty = _make_page_html(0, [])
    full = _make_page_html(
        40,
        [
            _make_card_html(f"60{i}", f"Yamaha R1 {i}", "Top", 5000 + i)
            for i in range(20)
        ],
    )
    payload = {
        "category_code": "c305",
        "hunt_type": "shortlist",
        "musts": [],
        "models": ["Yamaha R1 RN19"],
    }
    conn = db_schema.connect(str(tmp_path / "zero.db"))
    result = probe.run_probe(
        payload,
        conn=conn,
        fetch_fn=lambda url: MockResponse(empty if "rn19" in url else full),
    )
    assert "Yamaha R1 RN19" not in result["chosen_terms"]
    assert "Yamaha R1" in result["chosen_terms"]


def test_the_class_word_is_kept_even_when_titles_cannot_show_the_musts(tmp_path):
    """ "ventilator" for a fan hunt: 5000 offers, none "likely" by title,
    because "Für Innenraum geeignet" is never in a title. It is the net."""
    wide = _make_page_html(
        5000, [_make_card_html(f"70{i}", f"Ventilator {i}", "", 15) for i in range(25)]
    )
    model = _make_page_html(3, [_make_card_html("801", "Honeywell HT-900", "", 20)])
    payload = {
        "category_code": "c176",
        "hunt_type": "class",
        "musts": [
            {
                "id": "own_innen",
                "label": "Für Innenraum geeignet",
                "want": {"present": True},
            }
        ],
        "seed_terms": ["ventilator"],
        "models": ["Honeywell HT-900"],
    }
    conn = db_schema.connect(str(tmp_path / "fan.db"))
    result = probe.run_probe(
        payload,
        conn=conn,
        fetch_fn=lambda url: MockResponse(model if "honeywell" in url else wide),
    )
    assert "ventilator" in result["chosen_terms"]


def test_the_probe_cache_keeps_results_not_refusals():
    """A 429 or a block page must not stand in for the site for six hours."""
    import sqlite3

    import db_schema
    import probe_cache

    conn = sqlite3.connect(":memory:")
    db_schema.apply_schema(conn)
    probe_cache.put_cached_page(conn, "https://x/429", 429, "Too many requests")
    probe_cache.put_cached_page(
        conn, "https://x/block", 200, "<html>Bitte bestätigen</html>"
    )
    probe_cache.put_cached_page(
        conn, "https://x/ok", 200, "<span>1 - 25 von 139</span>"
    )
    assert probe_cache.get_cached_page(conn, "https://x/429") is None
    assert probe_cache.get_cached_page(conn, "https://x/block") is None
    assert probe_cache.get_cached_page(conn, "https://x/ok") is not None
