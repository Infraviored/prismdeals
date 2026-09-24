"""Tests for benchmark definitions and runner."""

import json
import os
import sys
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRAPER_DIR = os.path.join(REPO_ROOT, "scraper")
BENCHMARKS_DIR = os.path.join(REPO_ROOT, "scripts", "benchmarks")

if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)
if BENCHMARKS_DIR not in sys.path:
    sys.path.insert(0, BENCHMARKS_DIR)

import run


def test_hunts_json_structure():
    hunts_file = os.path.join(BENCHMARKS_DIR, "hunts.json")
    assert os.path.exists(hunts_file)
    with open(hunts_file, "r", encoding="utf-8") as f:
        hunts = json.load(f)

    assert len(hunts) == 8
    expected_ids = [f"B{i}" for i in range(1, 9)]
    actual_ids = [h["id"] for h in hunts]
    assert actual_ids == expected_ids

    valid_types = {
        "exact",
        "shortlist",
        "class",
        "features",
        "fit",
        "taste",
        "opportunity",
    }
    for h in hunts:
        assert h["hunt_type"] in valid_types, f"Invalid hunt_type for {h['id']}"
        assert h["category_code"].startswith("c") and h["category_code"][1:].isdigit()
        assert isinstance(h["max_price"], (int, float)) and h["max_price"] > 0
        assert len(h.get("seed_terms", [])) >= 1


def test_b1_runs_offline_from_its_recording():
    """The exact RAM hunt through the probe, from recorded pages only.

    Title and snippet cannot show clock or latency, so nothing is "likely"
    yet, but the widened terms must find a market of open candidates.
    """
    results = run.run_benchmark(
        os.path.join(BENCHMARKS_DIR, "hunts.json"), target_ids={"B1"}, offline=True
    )
    b1 = results[0]
    assert b1["id"] == "B1"
    assert b1["rungs"] >= 2
    assert b1["estimate"]["union_unclear"] > 50
    assert b1["chosen_terms"][0] == "corsair vengeance 32gb"


def test_offline_never_fetches_live():
    fetcher = run.FixtureFetcher(offline=True)
    with pytest.raises(FileNotFoundError):
        fetcher.fetch("https://www.kleinanzeigen.de/s-nothing-recorded/k0")
