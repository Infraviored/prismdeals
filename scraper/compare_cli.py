#!/usr/bin/env python3
"""CLI for comparative judging: scraper/compare_cli.py <campaign_id>

Runs the full 3-run comparison for one campaign and prints the results.
"""

import sys
import os

# Ensure the scraper directory is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from compare import compare_campaign


def main():
    if len(sys.argv) < 2:
        print("Usage: compare_cli.py <campaign_id> [--db <path>]", file=sys.stderr)
        sys.exit(1)

    campaign_id = int(sys.argv[1])
    db_path = None

    if "--db" in sys.argv:
        idx = sys.argv.index("--db")
        if idx + 1 < len(sys.argv):
            db_path = sys.argv[idx + 1]

    print(f"Running comparative judging for campaign {campaign_id}...")

    result = compare_campaign(campaign_id, db_path=db_path)

    if not result.get("run_id"):
        print("No candidates to compare.")
        sys.exit(0)

    print(f"\nRun ID: {result['run_id']}")
    print(f"Model: {result.get('model', 'unknown')}")
    print(f"Duration: {result['duration_s']}s")
    print(f"Tokens in: {result['usage'].get('tokens_in', 0)}")
    print(f"Tokens out: {result['usage'].get('tokens_out', 0)}")
    print(
        f"Estimated cost: {result['usage'].get('tokens_in', 0) * 0.07 / 1e6 + result['usage'].get('tokens_out', 0) * 0.28 / 1e6:.4f} USD"
    )

    stability = result.get("stability", {})
    print(f"Kendall tau (mean): {stability.get('mean_tau', 'N/A')}")

    print(f"\nRanking ({len(result['merged'])} candidates):")
    print("-" * 60)
    for entry in result["merged"]:
        uncertain = " [UNCERTAIN]" if entry.get("uncertain") else ""
        questions = entry.get("seller_questions", [])
        q_str = f" | Questions: {', '.join(questions[:2])}" if questions else ""
        print(
            f"  #{entry['rank']:2d} [{entry['id']}] {entry.get('reason', '')}{uncertain}{q_str}"
        )


if __name__ == "__main__":
    main()
