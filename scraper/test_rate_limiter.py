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
