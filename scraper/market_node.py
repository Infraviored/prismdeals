"""Market node resolution and persistence for scraper pipeline.

A listing's market node is its product identity, e.g.
'motorrad/yamaha/r1', 'ram/ddr4/2x16gb', 'laptop/asus/zenbook-14-oled'.
Used to compute medians over comparable listings rather than whole searches.
docs/product-core.md §7, plan-hunt-engine.md §11 (P8).
"""

import datetime
import logging
import re

logger = logging.getLogger(__name__)

EXCLUSION_KEYWORDS = [
    "defekt",
    "teildefekt",
    "kaputt",
    "bastler",
    "bastlerfahrzeug",
    "ersatzteil",
    "ersatzteile",
    "teile",
    "schlachtung",
    "schlachtfest",
    "teilespender",
    "ersatzteilspender",
    "nicht funktionsfähig",
    "nicht funktionstüchtig",
    "ohne motor",
    "ohne getriebe",
    "ohne display",
    "ohne akku",
    "für bastler",
    "an bastler",
    "zum ausschlachten",
    "suche",
    "gesucht",
]

EXCLUSION_RE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in EXCLUSION_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

DDL = """
CREATE TABLE IF NOT EXISTS listing_nodes (
    listing_id TEXT NOT NULL PRIMARY KEY,
    node_key   TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'hunt',
    computed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listing_nodes_node ON listing_nodes(node_key);
"""


def ensure_schema(conn):
    conn.executescript(DDL)


def normalize_part(val):
    if isinstance(val, dict):
        val = val.get("value")
    if val is None:
        return ""
    text = str(val).strip().lower()
    if not text or text in ("unknown", "none", "null", "-"):
        return ""
    cleaned = re.sub(r"[^\w\s.-]+", "", text, flags=re.UNICODE)
    cleaned = re.sub(r"\s+", "-", cleaned).strip("-")
    return cleaned


def is_market_excluded(listing):
    details = listing.get("details") or {}
    if isinstance(details, str):
        import json

        try:
            details = json.loads(details)
        except Exception:
            details = {}
    zustand = (
        str(details.get("Zustand") or details.get("zustand") or "").lower().strip()
    )
    if zustand == "defekt":
        return True

    text = " ".join(
        filter(None, [listing.get("title"), listing.get("short_description")])
    )
    if EXCLUSION_RE.search(text):
        return True

    fit = listing.get("fit") or {}
    if fit.get("verdict") == "no":
        return True

    price = listing.get("price_eur")
    if price is not None:
        try:
            if float(price) <= 0:
                return True
        except (ValueError, TypeError):
            return True

    return False


def resolve_node(
    listing, facts=None, playbook_key=None, rank_node=None, hunt_fallback=None
):
    if rank_node:
        return rank_node, "rank"

    criteria = (facts or {}).get("criteria") or {}

    if playbook_key in ("vehicles/cars", "vehicles/motorcycles"):
        make = normalize_part(criteria.get("make"))
        model = normalize_part(criteria.get("model"))
        prefix = "auto" if playbook_key == "vehicles/cars" else "motorrad"
        if make and model:
            return f"{prefix}/{make}/{model}", "identity"
        if make:
            return f"{prefix}/{make}", "identity"

    if playbook_key in ("electronics/laptops", "electronics/phones"):
        brand = normalize_part(criteria.get("brand"))
        model = normalize_part(criteria.get("modelName"))
        prefix = "laptop" if playbook_key == "electronics/laptops" else "handy"
        if brand and model:
            return f"{prefix}/{brand}/{model}", "identity"
        if brand:
            return f"{prefix}/{brand}", "identity"

    if playbook_key == "computing/memory":
        gen = normalize_part(criteria.get("generation"))
        stick_raw = criteria.get("stickCount")
        per_stick_raw = criteria.get("gbPerStick")
        stick_val = stick_raw.get("value") if isinstance(stick_raw, dict) else stick_raw
        per_stick_val = (
            per_stick_raw.get("value")
            if isinstance(per_stick_raw, dict)
            else per_stick_raw
        )
        if gen and stick_val and per_stick_val:
            return f"ram/{gen}/{stick_val}x{per_stick_val}gb", "playbook"
        if gen:
            return f"ram/{gen}", "playbook"

    if hunt_fallback:
        cleaned = normalize_part(hunt_fallback)
        return (cleaned if cleaned else "hunt"), "hunt"

    return "unknown", "hunt"


def put_node(conn, listing_id, node_key, source="hunt"):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn.execute(
        """
        INSERT OR REPLACE INTO listing_nodes (listing_id, node_key, source, computed_at)
        VALUES (?, ?, ?, ?)
        """,
        (str(listing_id), str(node_key), str(source), now),
    )


def get_node(conn, listing_id):
    row = conn.execute(
        "SELECT node_key, source FROM listing_nodes WHERE listing_id = ?",
        (str(listing_id),),
    ).fetchone()
    if not row:
        return None
    return dict(row) if hasattr(row, "keys") else {"node_key": row[0], "source": row[1]}
