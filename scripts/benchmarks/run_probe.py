"""Benchmark runner and fixture recorder for probe hunts (plan §1, §4.2).

Usage:
    python scripts/benchmarks/run.py [--offline] [--record] [--hunts B1,B4]
"""

import argparse
import hashlib
import json
import os
import sys
import time

# Ensure repo root and scraper/ are on sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRAPER_DIR = os.path.join(REPO_ROOT, "scraper")
FIXTURES_DIR = os.path.join(SCRAPER_DIR, "fixtures", "probe")
sys.path.insert(0, SCRAPER_DIR)

import probe
import scraper


def _url_hash(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


class FixtureFetcher:
    def __init__(self, record=False, offline=False):
        self.record = record
        self.offline = offline
        os.makedirs(FIXTURES_DIR, exist_ok=True)

    def fetch(self, url):
        sha = _url_hash(url)
        fixture_path = os.path.join(FIXTURES_DIR, f"{sha}.html")

        if self.offline and os.path.exists(fixture_path):
            with open(fixture_path, "r", encoding="utf-8") as f:
                content = f.read()
            return MockResponse(content, status_code=200)

        # Live fetch
        res = scraper.fetch(url)

        if self.record and res.status_code == 200:
            with open(fixture_path, "w", encoding="utf-8") as f:
                f.write(res.text)

        return res


class MockResponse:
    def __init__(self, text, status_code=200):
        self.text = text
        self.status_code = status_code


def run_benchmark(hunts_file, target_ids=None, record=False, offline=False):
    with open(hunts_file, "r", encoding="utf-8") as f:
        hunts = json.load(f)

    fetcher = FixtureFetcher(record=record, offline=offline)
    results = []

    print(f"\nRunning benchmark hunts ({'offline' if offline else 'live'} mode)...\n")
    print(
        f"{'ID':<4} | {'Hunt Type':<11} | {'Rungs':<5} | {'Req':<4} | {'Sec':<6} | {'Est.Likely':<10} | {'Med.€':<6} | {'Chosen Terms'}"
    )
    print("-" * 85)

    for h in hunts:
        hid = h["id"]
        if target_ids and hid not in target_ids:
            continue

        start = time.time()
        res = probe.run_probe(h, conn=None, fetch_fn=fetcher.fetch)
        dur = round(time.time() - start, 1)

        rungs_count = len(res.get("rungs", []))
        reqs = res.get("requests", 0)
        est_likely = res.get("estimate", {}).get("union_likely", 0)
        med_price = res.get("estimate", {}).get("median_price", "-")
        terms = ", ".join(res.get("chosen_terms", []))[:30]

        print(
            f"{hid:<4} | {h['hunt_type']:<11} | {rungs_count:<5} | {reqs:<4} | {dur:<6.1f} | {est_likely:<10} | {str(med_price):<6} | {terms}"
        )

        results.append(
            {
                "id": hid,
                "name": h["name"],
                "hunt_type": h["hunt_type"],
                "rungs": rungs_count,
                "requests": reqs,
                "seconds": dur,
                "estimate": res.get("estimate", {}),
                "chosen_terms": res.get("chosen_terms", []),
                "per_budget": res.get("per_budget", []),
                "relax": res.get("relax", []),
                "models_seen": res.get("models_seen", []),
            }
        )

    print("-" * 85)
    return results


def main():
    parser = argparse.ArgumentParser(description="Run probe benchmark hunts")
    parser.add_argument(
        "--record", action="store_true", help="Record fetched pages as offline fixtures"
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use recorded fixtures instead of network",
    )
    parser.add_argument(
        "--hunts",
        type=str,
        default=None,
        help="Comma-separated hunt IDs (e.g. B1,B2,B4,B5)",
    )
    args = parser.parse_args()

    hunts_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hunts.json")
    target_ids = set(args.hunts.split(",")) if args.hunts else None

    run_benchmark(
        hunts_file, target_ids=target_ids, record=args.record, offline=args.offline
    )


if __name__ == "__main__":
    main()
