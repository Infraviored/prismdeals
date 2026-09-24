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


def test_database_safety_guard():
    # Production database path must be blocked
    with pytest.raises(RuntimeError) as exc_info:
        run.check_database_safety(
            "/home/flo/docker-projects/prismdeals/data/scraper.db"
        )
    assert "Refusing to run benchmarks against production database" in str(
        exc_info.value
    )

    # Safe test copy path must pass
    run.check_database_safety("/tmp/p0p1_test.db")


def test_b1_offline_execution():
    hunts_file = os.path.join(BENCHMARKS_DIR, "hunts.json")
    with open(hunts_file, "r", encoding="utf-8") as f:
        hunts = json.load(f)

    b1 = hunts[0]
    result = run.run_benchmark(b1, offline=True)
    assert result["id"] == "B1"
    assert result["hunt_type"] == "exact"
    assert result["rungs"] == 3
    assert result["requests"] == 0
    assert result["candidates"] > 0
    assert result["fit"] >= 7
