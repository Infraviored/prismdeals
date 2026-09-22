#!/usr/bin/env python3
"""What a campaign can be asked for: `requirements_cli.py <campaign_id>`.

The requirements API could store what a buyer wants and the sieve could judge
against it, but nothing could tell the buyer which questions their category
answers -- so the screen that asks them had nothing to put on it, and the
Evaluate button said "set your requirements first" with nowhere to set them.

The fields belong to the playbook, which is Python, so this is the same shape
of helper as judge_cli.py: one question, one JSON answer, no scraper.
"""

import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_schema  # noqa: E402
import playbooks  # noqa: E402

# Only what a person can be asked in a line: a free-text part number is a
# question nobody answers, and a requirement nobody sets is worse than none.
ASKABLE = ("number", "enum", "boolean")


def describe(field):
    out = {
        "id": field["id"],
        "type": field["type"],
        "label": field.get("label") or field["id"],
        "description": field.get("description") or "",
    }
    if field.get("unit"):
        out["unit"] = field["unit"]
    if field.get("options"):
        out["options"] = list(field["options"])
    return out


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: requirements_cli.py <campaign_id>"}))
        return 2

    conn = sqlite3.connect(f"file:{db_schema.default_path()}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT url FROM searches WHERE campaign_id = ? AND enabled = 1",
            (int(sys.argv[1]),),
        ).fetchall()
    except Exception as exc:  # noqa: BLE001 -- the caller is a JSON reader
        print(json.dumps({"error": str(exc)}))
        return 1
    finally:
        conn.close()

    # One campaign, one kind of thing. Where its searches disagree the first
    # playbook wins rather than the screen offering two vocabularies at once.
    for (url,) in rows:
        playbook = playbooks.playbook_for_url(url)
        if playbook is None:
            continue
        print(
            json.dumps(
                {
                    "playbook": playbook["key"],
                    "fields": [
                        describe(f)
                        for f in playbook.get("fields", [])
                        if f.get("type") in ASKABLE
                    ],
                }
            )
        )
        return 0

    print(json.dumps({"playbook": None, "fields": []}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
