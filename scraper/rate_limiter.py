"""Global cross-process rate limiter: one request per second to kleinanzeigen.de.

Crawl, harvest and probe all hit the same site. Today each loop sleeps its own
delay, but nothing stops two processes from firing at the same instant. This
module replaces those per-loop sleeps with a single shared gate.

Implementation: a SQLite row records the last request timestamp. Before each
request the caller acquires the row, waits until at least MIN_INTERVAL_S has
elapsed since the last, stamps the new time, and releases. SQLite's busy_timeout
handles contention between processes; the row is the lock.

File-lock alternatives (fcntl, /run/lock) were considered and rejected: they
need cleanup on crash, they work differently on macOS, and the database is
already shared infrastructure.
"""

import os
import sqlite3
import time
import logging

logger = logging.getLogger(__name__)

MIN_INTERVAL_S = 1.0
# The site blocked this IP: every process pauses this long, twice as long
# after each block that follows the end of a pause, at most MAX_PAUSE_H.
FIRST_PAUSE_H = 6
MAX_PAUSE_H = 48


class SiteBlocked(RuntimeError):
    """Kleinanzeigen blocks this IP; no request goes out until `until`."""

    def __init__(self, until):
        super().__init__(
            "Kleinanzeigen sperrt diese IP; Pause bis "
            + time.strftime("%d.%m. %H:%M", time.localtime(until))
        )
        self.until = until


# The limiter database lives next to scraper.db so it shares the same data
# directory without touching scraper.db itself.
_LIMITER_DB = None


def _db_path():
    global _LIMITER_DB
    if _LIMITER_DB is not None:
        return _LIMITER_DB
    override = os.environ.get("PRISMDEALS_LIMITER_DB")
    if override:
        _LIMITER_DB = override
        return _LIMITER_DB
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
    )
    os.makedirs(data_dir, exist_ok=True)
    _LIMITER_DB = os.path.join(data_dir, "rate_limiter.db")
    return _LIMITER_DB


def set_db_path(path):
    """Override the limiter database path. For tests."""
    global _LIMITER_DB
    _LIMITER_DB = path


def _ensure_table(conn):
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rate_limit ("
        "  id INTEGER PRIMARY KEY CHECK (id = 1),"
        "  last_request_at REAL NOT NULL DEFAULT 0"
        ")"
    )
    conn.execute("INSERT OR IGNORE INTO rate_limit (id, last_request_at) VALUES (1, 0)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS site_block ("
        "  id INTEGER PRIMARY KEY CHECK (id = 1),"
        "  until REAL NOT NULL, hours REAL NOT NULL, since REAL NOT NULL)"
    )
    conn.commit()


def blocked_until():
    """The end of the current pause, or None."""
    conn = sqlite3.connect(_db_path(), timeout=30.0)
    try:
        _ensure_table(conn)
        row = conn.execute("SELECT until FROM site_block WHERE id = 1").fetchone()
        return row[0] if row and row[0] > time.time() else None
    finally:
        conn.close()


def block():
    """Records a block seen now: FIRST_PAUSE_H, doubled when the site still
    blocked right after the last pause. Returns the pause's end."""
    conn = sqlite3.connect(_db_path(), timeout=30.0)
    try:
        _ensure_table(conn)
        row = conn.execute(
            "SELECT until, hours FROM site_block WHERE id = 1"
        ).fetchone()
        now = time.time()
        if row and row[0] > now:
            return row[0]  # already pausing
        # Blocked again within a day of the last pause ending: it was too short.
        hours = (
            min(MAX_PAUSE_H, row[1] * 2)
            if row and now - row[0] < 86400
            else FIRST_PAUSE_H
        )
        until = now + hours * 3600
        conn.execute(
            "INSERT OR REPLACE INTO site_block (id, until, hours, since) VALUES (1, ?, ?, ?)",
            (until, hours, now),
        )
        conn.commit()
        logger.error(
            "Kleinanzeigen blocks this IP: pausing every request for %.0f h", hours
        )
        return until
    finally:
        conn.close()


def wait():
    """Block until the next request is allowed, then stamp the time.

    Returns the number of seconds actually waited (0 when no wait was needed).
    """
    until = blocked_until()
    if until:
        raise SiteBlocked(until)
    if os.environ.get("PRISMDEALS_NO_RATE_LIMIT"):
        return 0.0
    conn = sqlite3.connect(_db_path(), timeout=30.0)
    try:
        _ensure_table(conn)
        # BEGIN IMMEDIATE grabs a write lock so no two processes read the same
        # last_request_at and both decide to fire.
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT last_request_at FROM rate_limit WHERE id = 1"
        ).fetchone()
        last = row[0] if row else 0.0
        now = time.monotonic()

        # The stored time is monotonic within a process but not across
        # processes. Use wall clock for cross-process safety.
        last_wall = _read_wall(conn)
        now_wall = time.time()
        elapsed = now_wall - last_wall
        waited = 0.0

        if elapsed < MIN_INTERVAL_S:
            gap = MIN_INTERVAL_S - elapsed
            time.sleep(gap)
            waited = gap

        _write_wall(conn, time.time())
        conn.commit()
        return waited
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def _read_wall(conn):
    """Read the wall-clock timestamp of the last request."""
    row = conn.execute("SELECT last_request_at FROM rate_limit WHERE id = 1").fetchone()
    return row[0] if row else 0.0


def _write_wall(conn, wall_time):
    """Stamp the wall-clock time of this request."""
    conn.execute(
        "UPDATE rate_limit SET last_request_at = ? WHERE id = 1",
        (wall_time,),
    )


def reset():
    """Reset the limiter state. For tests."""
    try:
        conn = sqlite3.connect(_db_path(), timeout=5.0)
        _ensure_table(conn)
        conn.execute("UPDATE rate_limit SET last_request_at = 0 WHERE id = 1")
        conn.execute("DELETE FROM site_block")
        conn.commit()
        conn.close()
    except Exception:
        pass
