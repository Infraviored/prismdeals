#!/usr/bin/env python3
"""One-time backfill of listing_search_hits from existing listings.

The backfill is kept out of db/schema.sql because schema.sql is executed on
every connection, and an `INSERT ... SELECT` over all listings on every startup
would be prohibitive on large databases.
"""

import os
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scraper"
    ),
)
import db_schema  # noqa: E402


def backfill_hits(conn):
    """Populates listing_search_hits for listings with an existing search_id."""
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR IGNORE INTO listing_search_hits (listing_id, search_id, first_seen_at)
        SELECT id, search_id, COALESCE(last_description_changed_at, datetime('now'))
        FROM listings WHERE search_id IS NOT NULL
        """
    )
    affected = cursor.rowcount
    conn.commit()
    return affected


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else db_schema.default_path()
    print(f"Backfilling listing_search_hits in: {db_path}")
    conn = db_schema.connect(db_path)
    count = backfill_hits(conn)
    print(f"Inserted {count} rows into listing_search_hits.")
    conn.close()


if __name__ == "__main__":
    main()
