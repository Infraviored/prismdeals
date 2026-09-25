"""Knowledge claims: per-node, inheritable, expirable.

Each claim is one piece of product knowledge (weakness, check, value driver,
etc.) that hangs at the highest node where it is true. Claims inherit downward:
asking for claims on motorrad/supersport/yamaha-r1/rn19 returns that node's
claims plus every ancestor's, nearest first.

product-core.md sections 5, 6, 8.
"""

import datetime
import json
import logging
import sqlite3


logger = logging.getLogger(__name__)

CLAIM_KINDS = (
    "weakness",
    "check",
    "recognition",
    "maintenance",
    "value_driver",
    "warning_sign",
    "seller_question",
    "retrofit",
    "benchmark",
    "good_terms",
)

CHECK_PATHS = ("text", "photo", "ask", "on_site")

WEIGHTS = ("minor", "costly", "dealbreaker")

# How many days each kind stays valid.
TTL_DAYS = {
    "weakness": 730,
    "check": 365,
    "recognition": 730,
    "maintenance": 365,
    "value_driver": 180,
    "warning_sign": 365,
    "seller_question": 365,
    "retrofit": 365,
    "benchmark": 180,
    "good_terms": 90,
}
DEFAULT_TTL_DAYS = 180


# ---------------------------------------------------------------------------
# Node path helpers
# ---------------------------------------------------------------------------


def ancestors(node_key):
    """Returns ancestor node keys from nearest to root, excluding the node itself.

    >>> ancestors("motorrad/supersport/yamaha-r1/rn19")
    ['motorrad/supersport/yamaha-r1', 'motorrad/supersport', 'motorrad']
    """
    parts = node_key.split("/")
    result = []
    for i in range(len(parts) - 1, 0, -1):
        result.append("/".join(parts[:i]))
    return result


def node_and_ancestors(node_key):
    """The node key followed by all ancestors, nearest first."""
    return [node_key] + ancestors(node_key)


# ---------------------------------------------------------------------------
# Claims CRUD
# ---------------------------------------------------------------------------


def _expires_at(kind, created_at=None):
    """Compute expiry timestamp for a claim kind."""
    if created_at is None:
        created_at = datetime.datetime.now(datetime.timezone.utc)
    elif isinstance(created_at, str):
        created_at = datetime.datetime.fromisoformat(created_at)
    ttl = TTL_DAYS.get(kind, DEFAULT_TTL_DAYS)
    return (created_at + datetime.timedelta(days=ttl)).isoformat()


def insert_claim(conn, node_key, claim, approved=False):
    """Insert a single claim dict into the database.

    Returns the row id.  The claim dict must have at minimum:
    kind, statement, sources (list of URL strings).
    """
    kind = claim.get("kind", "")
    if kind not in CLAIM_KINDS:
        raise ValueError(f"Unknown claim kind: {kind!r}")

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    sources = claim.get("sources", [])
    if isinstance(sources, list):
        sources_json = json.dumps(sources, ensure_ascii=False)
    else:
        sources_json = json.dumps([sources], ensure_ascii=False)

    cursor = conn.execute(
        """INSERT INTO claims
               (node_key, kind, axis, statement, check_path, weight,
                sources, created_at, expires_at, approved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            node_key,
            kind,
            claim.get("axis", ""),
            claim["statement"],
            claim.get("check_path", ""),
            claim.get("weight", ""),
            sources_json,
            now,
            _expires_at(kind, now),
            1 if approved else 0,
        ),
    )
    return cursor.lastrowid


def insert_claims(conn, node_key, claims, approved=False):
    """Insert a list of claim dicts.  Returns list of row ids."""
    ids = []
    for claim in claims:
        try:
            ids.append(insert_claim(conn, node_key, claim, approved=approved))
        except (ValueError, KeyError) as exc:
            logger.warning("Skipping invalid claim: %s", exc)
    conn.commit()
    return ids


def validate_claim(claim):
    """Returns (ok, reason). Checks dict, statement, kind, and at least one URL source."""
    if not isinstance(claim, dict):
        return False, "claim is not an object"
    if not claim.get("statement"):
        return False, "claim has no statement"
    if claim.get("kind") not in CLAIM_KINDS:
        return False, f"claim kind {claim.get('kind')!r} is not recognised"
    sources = claim.get("sources") or []
    urls = [s for s in sources if isinstance(s, str) and s.startswith("http")]
    if not urls:
        return False, "claim has no valid source URL"
    return True, ""


def verify_sources(claims_list, url_checker):
    """Checks source URLs for claims with url_checker.

    url_checker(url) returns True (alive), False (dead), or None (unknown).
    Drops claims where all source URLs are confirmed dead.
    Returns (kept, dropped).
    """
    kept, dropped = [], []
    for claim in claims_list:
        sources = [
            s
            for s in claim.get("sources", [])
            if isinstance(s, str) and s.startswith("http")
        ]
        if not sources:
            dropped.append({"claim": claim, "reason": "no source URL"})
            continue
        results = [url_checker(url) for url in sources]
        if any(r is True for r in results):
            kept.append(claim)
        elif all(r is False for r in results) and results:
            dropped.append({"claim": claim, "reason": "all source URLs are dead"})
        else:
            c = dict(claim)
            c["sources_unverified"] = True
            kept.append(c)
    return kept, dropped


def approve_claim(conn, claim_id):
    """Mark a single claim as approved."""
    conn.execute("UPDATE claims SET approved = 1 WHERE id = ?", (claim_id,))
    conn.commit()


def reject_claim(conn, claim_id):
    """Delete a rejected claim (not worth keeping)."""
    conn.execute("DELETE FROM claims WHERE id = ?", (claim_id,))
    conn.commit()


def _row_to_dict(row):
    """Convert a sqlite3.Row or tuple to a claim dict."""
    if isinstance(row, sqlite3.Row):
        d = dict(row)
    else:
        d = {
            "id": row[0],
            "node_key": row[1],
            "kind": row[2],
            "axis": row[3],
            "statement": row[4],
            "check_path": row[5],
            "weight": row[6],
            "sources": row[7],
            "created_at": row[8],
            "expires_at": row[9],
            "approved": row[10],
        }
    # Parse sources JSON
    try:
        d["sources"] = json.loads(d["sources"])
    except (json.JSONDecodeError, TypeError):
        d["sources"] = []
    d["approved"] = bool(d.get("approved"))
    return d


def _is_expired(expires_at, now=None):
    """True if the claim has expired."""
    if not expires_at:
        return False
    now = now or datetime.datetime.now(datetime.timezone.utc)
    try:
        exp = datetime.datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        return now > exp
    except ValueError:
        return False


def claims_for(conn, node_key, now=None):
    """Returns approved, unexpired claims for the node and all ancestors.

    Order: own claims first, then nearest ancestor, then further ancestors.
    Within each level, ordered by kind.
    """
    all_keys = node_and_ancestors(node_key)
    result = []

    for key in all_keys:
        rows = conn.execute(
            """SELECT id, node_key, kind, axis, statement, check_path, weight,
                      sources, created_at, expires_at, approved
                 FROM claims
                WHERE node_key = ? AND approved = 1
                ORDER BY kind, created_at DESC""",
            (key,),
        ).fetchall()
        for row in rows:
            claim = _row_to_dict(row)
            if not _is_expired(claim.get("expires_at"), now):
                result.append(claim)

    return result


def claims_at_node(conn, node_key, include_unapproved=False):
    """Returns claims directly at this node (no inheritance)."""
    condition = "node_key = ?"
    if not include_unapproved:
        condition += " AND approved = 1"
    rows = conn.execute(
        f"""SELECT id, node_key, kind, axis, statement, check_path, weight,
                   sources, created_at, expires_at, approved
              FROM claims WHERE {condition}
              ORDER BY kind, created_at DESC""",
        (node_key,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def pending_claims(conn, node_key=None):
    """Returns unapproved claims, optionally filtered by node."""
    if node_key:
        rows = conn.execute(
            """SELECT id, node_key, kind, axis, statement, check_path, weight,
                      sources, created_at, expires_at, approved
                 FROM claims WHERE node_key = ? AND approved = 0
                 ORDER BY created_at DESC""",
            (node_key,),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT id, node_key, kind, axis, statement, check_path, weight,
                      sources, created_at, expires_at, approved
                 FROM claims WHERE approved = 0
                 ORDER BY created_at DESC""",
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Research value (product-core section 5)
# ---------------------------------------------------------------------------

PRICE_THRESHOLDS = {"low": 150, "mid": 500}

RESEARCH_LEVELS = ("none", "category", "shallow", "deep")


def research_value(price_eur, profile):
    """Pure function: price level x hiddenness x model dependence -> research level.

    Returns one of: "none", "category", "shallow", "deep".

    Also returns True for retrofit_trigger when a must that could be
    retrofitted triggers research (handled by the caller).
    """
    if profile is None:
        return "none"

    hidden = getattr(profile, "hidden", 0)
    model_dependent = getattr(profile, "model_dependent", False)
    research_hint = getattr(profile, "research", "none")

    # Profiles that declare no research or are out of scope
    if research_hint == "none":
        return "none"

    # Price level: low / mid / high
    if price_eur is None:
        price_level = "mid"
    elif price_eur <= PRICE_THRESHOLDS["low"]:
        price_level = "low"
    elif price_eur <= PRICE_THRESHOLDS["mid"]:
        price_level = "mid"
    else:
        price_level = "high"

    # Decision table (product-core section 5)
    if price_level == "low" and hidden <= 1:
        return "none"
    if price_level == "low" and hidden >= 2 and not model_dependent:
        return "category"
    if price_level == "low" and hidden >= 2 and model_dependent:
        return "shallow"
    if price_level == "mid" and not model_dependent:
        return "category"
    if price_level == "mid" and model_dependent:
        return "shallow"
    if price_level == "high" and not model_dependent:
        return "category"
    if price_level == "high" and model_dependent:
        return "deep"

    # Fallback to profile's own declaration
    return research_hint


def needs_research(price_eur, profile, node_key=None, conn=None):
    """Whether research pays off and the node does not already have fresh claims.

    Returns (level, reason) where level is a RESEARCH_LEVELS entry.
    """
    level = research_value(price_eur, profile)
    if level == "none":
        return "none", "research not worthwhile at this price and risk level"

    if conn is not None and node_key:
        existing = claims_for(conn, node_key)
        if existing:
            return "none", f"node already has {len(existing)} fresh claims"

    return level, f"research recommended: {level}"


# ---------------------------------------------------------------------------
# Compact claims for the comparative prompt
# ---------------------------------------------------------------------------


def claims_for_prompt(conn, node_key, max_claims=20):
    """Returns a compact text block of inherited claims for the compare prompt.

    Keeps it short: kind, statement, check_path, weight.  No sources.
    """
    all_claims = claims_for(conn, node_key)
    if not all_claims:
        return ""

    lines = ["Known facts about this product (from research):"]
    for c in all_claims[:max_claims]:
        kind_label = c["kind"].replace("_", " ")
        weight = f" [{c['weight']}]" if c.get("weight") else ""
        check = f" (check: {c['check_path']})" if c.get("check_path") else ""
        lines.append(f"- {kind_label}{weight}: {c['statement']}{check}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Node assignment from listing_ranks or identity
# ---------------------------------------------------------------------------


def node_for_listing(conn, listing_id):
    """The knowledge node key for a listing.

    Prefers the node_key from the latest comparative run (listing_ranks),
    falls back to identity.py resolution via the fact sheet.
    """
    # From the latest comparative run
    row = conn.execute(
        """SELECT lr.node_key
             FROM listing_ranks lr
             JOIN judge_runs jr ON jr.id = lr.run_id
            WHERE lr.listing_id = ? AND lr.node_key IS NOT NULL
            ORDER BY jr.created_at DESC LIMIT 1""",
        (str(listing_id),),
    ).fetchone()
    if row and row[0]:
        return row[0]

    # Fall back to identity resolution
    return _identity_node(conn, listing_id) or _resolved_node(conn, listing_id)


def _resolved_node(conn, listing_id):
    """The node P8 resolved from the listing's own facts, if any."""
    try:
        row = conn.execute(
            "SELECT node_key FROM listing_nodes WHERE listing_id = ? "
            "AND source IN ('identity', 'playbook', 'rank')",
            (str(listing_id),),
        ).fetchone()
    except sqlite3.OperationalError:  # an older store without P8
        return None
    return row[0] if row else None


def _identity_node(conn, listing_id):
    """Resolve node from identity.py using the listing's fact sheet."""
    try:
        import identity
        import playbooks
    except ImportError:
        return None

    row = conn.execute(
        "SELECT playbook_key, facts_json FROM fact_sheets WHERE listing_id = ?",
        (str(listing_id),),
    ).fetchone()
    if not row:
        return None

    try:
        facts = json.loads(row[1]) if isinstance(row[1], str) else row[1]
    except (json.JSONDecodeError, TypeError):
        return None

    playbook = playbooks.by_key(row[0]) if hasattr(playbooks, "by_key") else None
    if playbook is None:
        return None

    key, _parts = identity.resolve(facts, playbook)
    return key


# ---------------------------------------------------------------------------
# Migration: split existing dossiers into claims
# ---------------------------------------------------------------------------


def migrate_dossiers_to_claims(conn):
    """One-time migration: split dossier payloads into individual claims.

    Keeps the dossiers table untouched. Only inserts claims that do not
    already exist (by node_key + statement).
    """
    rows = conn.execute(
        "SELECT identity_key, payload_json, researched_at, approved FROM dossiers"
    ).fetchall()

    inserted = 0
    for row in rows:
        key, payload_json, researched_at, approved = row
        try:
            payload = json.loads(payload_json)
        except (json.JSONDecodeError, TypeError):
            continue

        claims_list = payload.get("claims", [])
        for claim in claims_list:
            statement = claim.get("statement", "")
            if not statement:
                continue

            # Check for duplicate
            existing = conn.execute(
                "SELECT id FROM claims WHERE node_key = ? AND statement = ?",
                (key, statement),
            ).fetchone()
            if existing:
                continue

            # Map old dossier kind to new claim kind
            old_kind = claim.get("kind", "")
            kind = _map_dossier_kind(old_kind)
            if kind is None:
                continue

            sources = claim.get("sources", [])
            sources_json = json.dumps(sources, ensure_ascii=False)

            now = (
                researched_at
                or datetime.datetime.now(datetime.timezone.utc).isoformat()
            )

            conn.execute(
                """INSERT INTO claims
                       (node_key, kind, axis, statement, check_path, weight,
                        sources, created_at, expires_at, approved)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    key,
                    kind,
                    "",
                    statement,
                    "text",
                    "costly" if kind == "weakness" else "minor",
                    sources_json,
                    now,
                    _expires_at(kind, now),
                    1 if approved else 0,
                ),
            )
            inserted += 1

    conn.commit()
    logger.info("Migrated %d claims from %d dossiers", inserted, len(rows))
    return inserted


_DOSSIER_KIND_MAP = {
    "construction_defect": "weakness",
    "recall": "weakness",
    "maintenance_interval": "maintenance",
    "typical_failure": "warning_sign",
    "price_band": "value_driver",
    "market_note": "value_driver",
}


def _map_dossier_kind(old_kind):
    """Map old dossier claim kinds to new P7 claim kinds."""
    return _DOSSIER_KIND_MAP.get(old_kind)
