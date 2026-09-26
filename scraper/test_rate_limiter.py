"""Tests for global cross-process rate limiter (plan §5.7, §5.10)."""

import os
import subprocess
import sys
import time


import rate_limiter


def test_single_process_rate_limit(tmp_path):
    """Calling wait() twice consecutively must wait at least 1 second."""
    db_file = str(tmp_path / "test_limiter.db")
    rate_limiter.set_db_path(db_file)
    rate_limiter.reset()

    # First call: immediate, no wait
    w1 = rate_limiter.wait()
    assert w1 == 0.0

    # Second call immediately after: must wait approx 1.0s
    t0 = time.time()
    w2 = rate_limiter.wait()
    elapsed = time.time() - t0
    assert elapsed >= 0.95
    assert w2 >= 0.95


def test_two_processes_shared_rate_limit(tmp_path):
    """Two concurrent processes making 10 requests total must take >= 9 seconds.

    Plan §5.10: Rate limiter: two processes, 10 requests -> >= 9 s.
    """
    db_file = str(tmp_path / "shared_limiter.db")
    rate_limiter.set_db_path(db_file)
    rate_limiter.reset()

    worker_code = f"""
import os, sys
sys.path.insert(0, {repr(os.path.dirname(os.path.abspath(__file__)))})
import rate_limiter
rate_limiter.set_db_path({repr(db_file)})
for _ in range(5):
    rate_limiter.wait()
"""

    start_time = time.time()
    p1 = subprocess.Popen([sys.executable, "-c", worker_code])
    p2 = subprocess.Popen([sys.executable, "-c", worker_code])

    p1.wait()
    p2.wait()
    elapsed = time.time() - start_time

    assert p1.returncode == 0
    assert p2.returncode == 0
    # 10 requests total in any order need at least 9 intervals of 1s = >= 9.0s
    # Allow 8.9s for small timing variances on fast platforms
    assert elapsed >= 8.9, f"Expected elapsed >= 8.9s, got {elapsed:.2f}s"


def test_a_block_page_pauses_every_request(tmp_path, monkeypatch):
    """Kleinanzeigen's block page ends the run and no request goes out until
    the pause is over; a block right after a pause doubles it."""
    import pytest

    import scraper

    rate_limiter.set_db_path(str(tmp_path / "limiter.db"))
    rate_limiter.reset()
    monkeypatch.setenv("PRISMDEALS_NO_RATE_LIMIT", "1")
    sent = []

    class Blocked:
        status_code = 403
        text = "<h1>IP-Bereich vorübergehend gesperrt.</h1>"
        encoding = None

    class Caller:
        @staticmethod
        def get(url, headers=None, timeout=None):
            sent.append(url)
            return Blocked()

    with pytest.raises(rate_limiter.SiteBlocked):
        scraper._fetch_with_backoff(
            "https://www.kleinanzeigen.de/s-a/k0", caller=Caller
        )
    assert len(sent) == 1  # no retries into a block
    with pytest.raises(rate_limiter.SiteBlocked):
        scraper.fetch("https://www.kleinanzeigen.de/s-b/k0", caller=Caller)
    assert len(sent) == 1  # nothing sent while pausing
    first = rate_limiter.blocked_until()
    assert 5.9 * 3600 < first - time.time() <= 6 * 3600

    # The pause ends; the site still blocks: twice as long.
    import sqlite3

    conn = sqlite3.connect(str(tmp_path / "limiter.db"))
    conn.execute("UPDATE site_block SET until = ?", (time.time() - 60,))
    conn.commit()
    conn.close()
    with pytest.raises(rate_limiter.SiteBlocked):
        scraper.fetch("https://www.kleinanzeigen.de/s-c/k0", caller=Caller)
    assert 11.9 * 3600 < rate_limiter.blocked_until() - time.time() <= 12 * 3600
    rate_limiter.reset()
