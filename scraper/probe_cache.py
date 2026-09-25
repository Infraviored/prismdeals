"""Cache for probe pages and persistent memory for search terms.

Probe cache (plan §5.7):
- Raw HTML of fetched search pages is stored gzipped in `probe_cache`.
- Reused within 6 hours. Editing a hunt and re-probing costs nothing when URLs repeat.

Node terms memory (plan §5.8):
- Stores terms that proved useful per knowledge node.
- Next probe for the same node reads them as candidate seed terms.
"""

import datetime
import gzip
import logging

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 6 * 3600  # 6 hours


def get_cached_page(conn, url, max_age_seconds=CACHE_TTL_SECONDS):
    """Retrieve cached HTML for a URL if fetched within max_age_seconds.

    Returns (status, html_text) or None if absent or expired.
    """
    if conn is None or not url:
        return None
    try:
        row = conn.execute(
            "SELECT fetched_at, status, html_gz FROM probe_cache WHERE url = ?",
            (url,),
        ).fetchone()
        if not row:
            return None
        fetched_at_str, status, html_gz = row
        fetched_at = datetime.datetime.fromisoformat(fetched_at_str)
        now = datetime.datetime.now(datetime.timezone.utc)
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=datetime.timezone.utc)
        age = (now - fetched_at).total_seconds()
        if age > max_age_seconds or int(status) != 200:
            return None
        html_text = gzip.decompress(html_gz).decode("utf-8")
        return int(status), html_text
    except Exception as exc:
        logger.debug("probe_cache lookup failed for %s: %s", url, exc)
        return None


def put_cached_page(conn, url, status, html_text):
    """Store raw HTML in probe_cache compressed with gzip -- only a real result.

    A 429 or a block page was kept for six hours: the next probe made no
    request at all and stopped on the cached refusal, or read the block page
    as "0 results".
    """
    if conn is None or not url or html_text is None or int(status) != 200:
        return
    import result_list

    if result_list.total_results(html_text) is None and not result_list.parse(
        html_text
    ):
        return
    try:
        html_gz = gzip.compress(html_text.encode("utf-8"))
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO probe_cache (url, fetched_at, status, html_gz) "
            "VALUES (?, ?, ?, ?)",
            (url, now_str, int(status), html_gz),
        )
        conn.commit()
    except Exception as exc:
        logger.warning("Failed to cache probe page %s: %s", url, exc)


def save_node_term(conn, node_key, term, category_code, total, likely_share):
    """Record a probed search term in node_terms memory."""
    if conn is None or not node_key or not term:
        return
    try:
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO node_terms "
            "(node_key, term, category_code, total, likely_share, probed_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                str(node_key),
                str(term).strip(),
                str(category_code) if category_code else None,
                int(total),
                float(likely_share),
                now_str,
            ),
        )
        conn.commit()
    except Exception as exc:
        logger.warning("Failed to save node term %s:%s: %s", node_key, term, exc)


def load_node_terms(conn, node_key, limit=5):
    """Load previously probed terms for a node, newest first."""
    if conn is None or not node_key:
        return []
    try:
        rows = conn.execute(
            "SELECT term FROM node_terms WHERE node_key = ? ORDER BY probed_at DESC LIMIT ?",
            (str(node_key), int(limit)),
        ).fetchall()
        return [row[0] for row in rows]
    except Exception as exc:
        logger.debug("Failed to load node terms for %s: %s", node_key, exc)
        return []
