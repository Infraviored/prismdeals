"""Utility to apply schema and backfill source, source_id, and price_eur.

Adheres strictly to the safety rules:
- Reads or writes to PRISMDEALS_DB or a specified database path, never directly to
  data/scraper.db unless explicitly configured.
- Matches the logic of backend/db/backfill.js.
"""

import argparse
import os
import re
import sqlite3
import sys

# Add scraper to sys.path
sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scraper"
    ),
)
import db_schema

BACKFILL_RE = re.compile(r"^\s*([\d.]+)\s*€")


def parse_price_eur(raw_price):
    """Parses legacy extracted price string into integer EUR.

    - "Zu verschenken" -> 0
    - Empty or invalid -> None
    - "330 € VB360 €" -> 330
    """
    if not raw_price:
        return None
    trimmed = raw_price.strip()
    if not trimmed:
        return None
    if trimmed.lower() == "zu verschenken":
        return 0

    match = BACKFILL_RE.match(trimmed)
    if not match:
        return None

    try:
        return int(match.group(1).replace(".", ""))
    except ValueError:
        return None


def run_backfill(db_path):
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    db_schema.apply_schema(conn)

    cur = conn.cursor()

    # 1. Source and source_id
    cur.execute("UPDATE listings SET source = 'kleinanzeigen' WHERE source IS NULL")
    source_count = cur.rowcount

    cur.execute(
        "UPDATE listings SET source_id = id "
        "WHERE source_id IS NULL AND (source = 'kleinanzeigen' OR source IS NULL)"
    )
    source_id_count = cur.rowcount

    # 2. Price EUR
    cur.execute(
        "SELECT id, price FROM listings "
        "WHERE price_eur IS NULL AND price IS NOT NULL AND TRIM(price) != ''"
    )
    rows = cur.fetchall()

    updated = 0
    giveaway = 0
    composite = 0

    for lid, raw_price in rows:
        val = parse_price_eur(raw_price)
        if val is not None:
            if val == 0:
                giveaway += 1
            if raw_price.count("€") > 1:
                composite += 1
                print(
                    f"[backfill] Resolved legacy composite price for listing {lid}: "
                    f"'{raw_price}' -> {val} €"
                )
            cur.execute("UPDATE listings SET price_eur = ? WHERE id = ?", (val, lid))
            updated += 1

    conn.commit()

    # Query summary counts
    cur.execute(
        "SELECT COUNT(*), COUNT(price_eur), "
        "SUM(CASE WHEN price_eur = 0 THEN 1 ELSE 0 END), "
        "COUNT(source), COUNT(source_id) FROM listings"
    )
    summary = cur.fetchone()
    print("Backfill complete:")
    print(f"  Source backfilled: {source_count} rows")
    print(f"  Source_id backfilled: {source_id_count} rows")
    print(
        f"  Price_eur updated: {updated} rows ({giveaway} free, {composite} composite)"
    )
    print(
        f"  Database summary (total, with_price_eur, zero_price, with_source, with_source_id): {summary}"
    )

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill listings canonical fields.")
    parser.add_argument(
        "db_path", nargs="?", default=None, help="Path to SQLite database"
    )
    args = parser.parse_args()

    target_db = (
        args.db_path or os.environ.get("PRISMDEALS_DB") or db_schema.default_path()
    )
    run_backfill(target_db)
