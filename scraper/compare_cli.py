#!/usr/bin/env python3
"""Comparative judging for one hunt: the payload on stdin, the result on stdout.

    echo '{"campaign_id": 11, "candidates": [...], "conditions": [...]}' | compare_cli.py

The backend (backend/compare_api.js) builds the payload from the computed
verdicts; see compare.compare_campaign for its shape.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from compare import compare_campaign  # noqa: E402


def main():
    result = compare_campaign(json.load(sys.stdin))
    print(
        json.dumps(
            {
                "run_id": result["run_id"],
                "ranked": len(result["merged"]),
                "duration_s": result["duration_s"],
                "tau": result.get("stability", {}).get("mean_tau"),
            }
        )
    )


if __name__ == "__main__":
    main()
