#!/usr/bin/env python3
"""Judging one search from the outside: `judge_cli.py <search_id>`.

Its own entry point rather than a mode of main.py, because main.py opens the
scraper's whole world -- Selenium, sessions, the scheduler -- to do something
that reads text and writes a verdict.
"""

import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_schema  # noqa: E402
import fit  # noqa: E402


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: judge_cli.py <search_id>"}))
        return 2

    conn = sqlite3.connect(db_schema.default_path())
    try:
        result = fit.judge_search(conn, int(sys.argv[1]))
    except Exception as exc:  # noqa: BLE001 -- the caller is a JSON reader
        print(json.dumps({"error": str(exc)}))
        return 1
    finally:
        conn.close()

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
