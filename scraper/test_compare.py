"""Tests for comparative judging P6 (§9.8).

- Quote validator drops invented facts.
- Rank merge of 3 runs (pure).
- Stability and Kendall tau calculation (pure).
- Tournament grouping (pure).
- Replay of one recorded call -> parsed, validated.
"""

import json

from compare_prompt import parse_compare_response
from compare_stability import merge_ranks, kendall_tau, compute_stability
from compare import partition_tournament_groups


# ---------------------------------------------------------------------------
# 1. Quote validator drops invented facts
# ---------------------------------------------------------------------------


def test_quote_validator_keeps_verified_quotes():
    candidates = [
        {
            "id": "100",
            "title": "Lenovo ThinkPad T480s",
            "detailed_description": "Sehr gepflegtes ThinkPad mit 16GB RAM und 512GB SSD. Akku hält noch 5 Stunden.",
            "short_description": "ThinkPad T480s",
        }
    ]

    response_text = json.dumps(
        {
            "id": "100",
            "rank": 1,
            "reason": "Top Zustand und viel RAM",
            "musts": {"ram": "met", "ssd": "met"},
            "facts": {
                "ram": {"value": "16GB", "quote": "16GB RAM"},
                "ssd": {"value": "512GB", "quote": "512GB SSD"},
            },
            "checks": ["Akkugesundheit prüfen"],
            "seller_questions": ["Gibt es das originale Netzteil dazu?"],
            "same_as": [],
        }
    )

    parsed = parse_compare_response(response_text, candidates)
    assert len(parsed) == 1
    assert "ram" in parsed[0]["facts"]
    assert parsed[0]["facts"]["ram"]["quote"] == "16GB RAM"
    assert "ssd" in parsed[0]["facts"]


def test_quote_validator_drops_invented_facts():
    candidates = [
        {
            "id": "101",
            "title": "ThinkPad T480s",
            "detailed_description": "Guter Zustand, funktioniert einwandfrei.",
            "short_description": "",
        }
    ]

    response_text = json.dumps(
        {
            "id": "101",
            "rank": 1,
            "reason": "Solides Arbeitsgerät",
            "musts": {"gpu": "met", "ram": "met"},
            "facts": {
                # Invented: RTX 3080 does not appear anywhere in text
                "gpu": {
                    "value": "RTX 3080",
                    "quote": "dedizierte RTX 3080 Grafikkarte",
                },
                # Missing quote: no quote provided
                "ram": {"value": "32GB"},
            },
        }
    )

    parsed = parse_compare_response(response_text, candidates)
    assert len(parsed) == 1
    # Both invented fact and quote-less fact must be dropped
    assert "gpu" not in parsed[0]["facts"]
    assert "ram" not in parsed[0]["facts"]


# ---------------------------------------------------------------------------
# 2. Rank merge of 3 runs (pure)
# ---------------------------------------------------------------------------


def test_rank_merge_averages_runs_and_sorts():
    # 3 candidates evaluated in 3 shuffled runs
    run1 = [
        {"id": "A", "rank": 1, "reason": "Fast"},
        {"id": "B", "rank": 2, "reason": "Cheap"},
        {"id": "C", "rank": 3, "reason": "Old"},
    ]
    run2 = [
        {"id": "B", "rank": 1, "reason": "Cheap"},
        {"id": "A", "rank": 2, "reason": "Fast"},
        {"id": "C", "rank": 3, "reason": "Old"},
    ]
    run3 = [
        {"id": "A", "rank": 1, "reason": "Fast"},
        {"id": "B", "rank": 2, "reason": "Cheap"},
        {"id": "C", "rank": 3, "reason": "Old"},
    ]

    # Mean ranks:
    # A: (1 + 2 + 1) / 3 = 1.33
    # B: (2 + 1 + 2) / 3 = 1.67
    # C: (3 + 3 + 3) / 3 = 3.0
    merged = merge_ranks([run1, run2, run3], candidate_count=3)
    assert len(merged) == 3
    assert merged[0]["id"] == "A"
    assert merged[0]["rank"] == 1
    assert merged[0]["rank_of"] == 3
    assert not merged[0]["uncertain"]

    assert merged[1]["id"] == "B"
    assert merged[1]["rank"] == 2

    assert merged[2]["id"] == "C"
    assert merged[2]["rank"] == 3


def test_rank_merge_marks_uncertain_when_spread_exceeds_threshold():
    # Listing X varies wildly between runs: rank 1 vs rank 8 (spread = 7 > 5)
    run1 = [{"id": "X", "rank": 1}, {"id": "Y", "rank": 2}]
    run2 = [{"id": "Y", "rank": 1}, {"id": "X", "rank": 8}]
    run3 = [{"id": "Y", "rank": 2}, {"id": "X", "rank": 5}]

    merged = merge_ranks([run1, run2, run3], candidate_count=2)
    x_entry = next(e for e in merged if e["id"] == "X")
    assert x_entry["spread"] == 7
    assert x_entry["uncertain"] is True

    y_entry = next(e for e in merged if e["id"] == "Y")
    assert y_entry["spread"] <= 5
    assert y_entry["uncertain"] is False


# ---------------------------------------------------------------------------
# 3. Kendall tau stability (pure)
# ---------------------------------------------------------------------------


def test_kendall_tau_perfect_agreement():
    run_a = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    run_b = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    assert kendall_tau(run_a, run_b) == 1.0


def test_kendall_tau_complete_disagreement():
    run_a = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    run_b = [{"id": "1", "rank": 3}, {"id": "2", "rank": 2}, {"id": "3", "rank": 1}]
    assert kendall_tau(run_a, run_b) == -1.0


def test_compute_stability_across_three_runs():
    run1 = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    run2 = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    run3 = [{"id": "1", "rank": 1}, {"id": "2", "rank": 2}, {"id": "3", "rank": 3}]
    stability = compute_stability([run1, run2, run3])
    assert stability["mean_tau"] == 1.0


# ---------------------------------------------------------------------------
# 4. Tournament grouping (pure)
# ---------------------------------------------------------------------------


def test_partition_tournament_groups():
    candidates = [{"id": str(i)} for i in range(75)]
    groups = partition_tournament_groups(candidates, group_size=30)
    assert len(groups) == 3
    assert len(groups[0]) == 30
    assert len(groups[1]) == 30
    assert len(groups[2]) == 15


def test_partition_tournament_groups_under_cap():
    candidates = [{"id": str(i)} for i in range(25)]
    groups = partition_tournament_groups(candidates, group_size=30)
    assert len(groups) == 1
    assert len(groups[0]) == 25


# ---------------------------------------------------------------------------
# 5. Replay of recorded comparative call
# ---------------------------------------------------------------------------


def test_parse_compare_response_with_markdown_fences():
    candidates = [
        {
            "id": "201",
            "title": "Dell XPS 13",
            "detailed_description": "i7 16GB RAM 512GB SSD",
        },
        {
            "id": "202",
            "title": "MacBook Air",
            "detailed_description": "M1 8GB 256GB Space Grey",
        },
    ]

    raw_llm_output = """```json
{"id": "201", "rank": 1, "reason": "Stärkere Ausstattung zum fairen Preis", "musts": {"ram": "met"}, "facts": {"ram": {"value": "16GB", "quote": "16GB RAM"}}, "checks": ["Batteriezustand"], "seller_questions": ["Wie viele Ladezyklen?"], "same_as": []}
{"id": "202", "rank": 2, "reason": "Nur 8GB RAM, aber sehr effizient", "musts": {"ram": "unstated"}, "facts": {}, "checks": [], "seller_questions": [], "same_as": []},
```"""

    parsed = parse_compare_response(raw_llm_output, candidates)
    assert len(parsed) == 2
    assert parsed[0]["id"] == "201"
    assert parsed[0]["rank"] == 1
    assert parsed[0]["seller_questions"] == ["Wie viele Ladezyklen?"]
    assert parsed[1]["id"] == "202"
    assert parsed[1]["rank"] == 2


# ---------------------------------------------------------------------------
# Review fixes: judged musts need quotes, skipped listings keep a rank
# ---------------------------------------------------------------------------


def test_a_met_must_without_a_quoted_fact_counts_as_unstated():
    candidates = [
        {"id": "7", "title": "Corsair 2x16GB", "detailed_description": "DDR4 Kit"}
    ]
    line = json.dumps(
        {
            "id": "7",
            "rank": 1,
            "musts": {"speedMhz": "met", "ramType": "met", "stickCount": "violated"},
            "facts": {
                "ramType": {"value": "DDR4", "quote": "DDR4 Kit"},
                "speedMhz": {"value": "3200", "quote": "3200 MHz"},
            },
        }
    )
    musts = parse_compare_response(line, candidates)[0]["musts"]
    assert musts["ramType"] == "met"
    # The 3200 quote is not in the text, so the fact went and the "met" with it.
    assert musts["speedMhz"] == "unstated"
    assert musts["stickCount"] == "unstated"


def test_the_prompt_names_requirements_by_id():
    from compare_prompt import build_compare_prompt

    prompt = build_compare_prompt(
        [{"id": "7", "title": "t", "states": {"12": "met"}}],
        [{"id": 12, "text": "Takt ab 3200", "importance": "must"}],
    )
    assert "[12] Takt ab 3200 (must)" in prompt
    assert "Read: [12] met" in prompt


def test_a_listing_the_model_skipped_ranks_last_instead_of_vanishing():
    from compare import _fill_missing

    candidates = [{"id": "1"}, {"id": "2"}, {"id": "3"}]
    runs = [
        # Run one skipped listing 3; run two put it first.
        _fill_missing([{"id": "1", "rank": 1}, {"id": "2", "rank": 2}], candidates),
        _fill_missing(
            [{"id": "3", "rank": 1}, {"id": "1", "rank": 2}, {"id": "2", "rank": 3}],
            candidates,
        ),
    ]
    merged = merge_ranks(runs, 3)
    # Unfilled, listing 3 would average rank 1 from its single appearance.
    assert merged[0]["id"] == "1"


def test_the_answer_budget_grows_with_the_candidates():
    from compare import _output_budget

    assert _output_budget(30) > 4000 * 2
    assert _output_budget(200) == 16000


def test_the_prompt_carries_the_page_attributes():
    from compare_prompt import build_compare_prompt

    prompt = build_compare_prompt(
        [
            {
                "id": "1",
                "title": "Honda CBR",
                "details": {
                    "Kilometerstand": "21.000 km",
                    "Erstzulassung": "Juni 2009",
                },
            }
        ],
        [],
    )
    assert "Kilometerstand: 21.000 km" in prompt
    assert "Never ask the seller for something the listing already states" in prompt


def test_parse_compare_response_reads_a_pretty_printed_array():
    """Asked for JSON lines, a model sometimes answers with an indented array."""
    candidates = [
        {"id": "301", "title": "Honeywell HT-900", "detailed_description": ""},
        {"id": "302", "title": "Tischventilator", "detailed_description": ""},
    ]
    response_text = """[
  {
    "id": "302",
    "rank": 1,
    "reason": "Bekannte Marke fehlt, aber günstig"
  },
  {
    "id": "301",
    "rank": 2,
    "reason": "Marke"
  }
]"""
    parsed = parse_compare_response(response_text, candidates)
    assert [p["id"] for p in parsed] == ["302", "301"]
    assert parsed[0]["reason"].startswith("Bekannte")


def test_parse_compare_response_survives_malformed_lines():
    candidates = [
        {"id": "1", "title": "Honeywell HT-900 2008", "detailed_description": ""},
        {"id": "2", "title": "Tischventilator", "detailed_description": ""},
    ]
    lines = [
        {"id": "1", "rank": "1", "facts": [{"x": 1}]},
        {"id": "2", "rank": 2, "facts": {"year": {"value": 2008, "quote": 2008}}},
        {"id": "999", "rank": 1},
        {"id": "1", "rank": 3},
    ]
    parsed = parse_compare_response(
        "\n".join(json.dumps(line) for line in lines), candidates
    )
    assert [p["id"] for p in parsed] == ["1", "2"]
    assert parsed[0]["rank"] == 1 and parsed[0]["facts"] == {}
    assert parsed[1]["facts"] == {}  # 2008 is not in listing 2's text


def test_a_comparison_without_candidates_leaves_an_empty_run(tmp_path):
    """The screen reads the latest run; old ranks must not outlive new requirements."""
    import sqlite3

    import compare
    import db_schema

    path = str(tmp_path / "c.db")
    conn = sqlite3.connect(path)
    db_schema.apply_schema(conn)
    conn.execute("INSERT INTO campaigns (id, name) VALUES (1, 'Fan')")
    conn.commit()
    conn.close()

    result = compare.compare_campaign(
        {"campaign_id": 1, "candidates": [], "conditions": []}, db_path=path
    )
    conn = sqlite3.connect(path)
    run = conn.execute("SELECT id, candidate_count, status FROM judge_runs").fetchone()
    assert run == (result["run_id"], 0, "complete")
    assert conn.execute("SELECT COUNT(*) FROM listing_ranks").fetchone()[0] == 0
