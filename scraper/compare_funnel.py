"""Candidate-set funnel for comparative judging (§9.1).

Reuses the free sieve (text_facts / fit.judge_search), the detail harvest
(scraper.harvest_descriptions, only if stale > 7 days), and adds ad-hoc fact
extraction for musts without regex patterns.  The output is a list of at most
30 candidate listings, ordered by score descending.
"""

import hashlib
import json
import logging
import sqlite3
from typing import Any

import fit
import text_facts

logger = logging.getLogger(__name__)

CANDIDATE_CAP = 30
STALE_DAYS = 7


def requirements_hash(fields: list[dict]) -> str:
    """Stable hash of the buyer's requirements for cache invalidation."""
    payload = json.dumps(fields, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _campaign_searches(conn: sqlite3.Connection, campaign_id: int) -> list[int]:
    """All enabled search IDs belonging to this campaign."""
    rows = conn.execute(
        "SELECT id FROM searches WHERE campaign_id = ? AND enabled = 1",
        (campaign_id,),
    ).fetchall()
    return [r[0] for r in rows]


def _intent_fields(conn: sqlite3.Connection, search_ids: list[int]) -> list[dict]:
    """Buyer requirements from any search in this campaign."""
    for sid in search_ids:
        fields = fit.intent_for(conn, sid)
        if fields:
            return fields
    return []


def _listings_for_campaign(
    conn: sqlite3.Connection, campaign_id: int, search_ids: list[int]
) -> list[dict]:
    """All listings reachable through the campaign's searches."""
    if not search_ids:
        return []
    placeholders = ",".join("?" for _ in search_ids)
    rows = conn.execute(
        f"""SELECT DISTINCT l.id, l.title, l.price_eur, l.location, l.url,
                   l.detailed_description, l.short_description,
                   l.details, l.images, l.last_seen_at,
                   fit.verdict, fit.reason, fit.facts_json, fit.stage
              FROM listings l
              LEFT JOIN listing_search_hits h ON h.listing_id = l.id
              LEFT JOIN listing_fit fit ON fit.listing_id = l.id
                   AND fit.search_id IN ({placeholders})
             WHERE (l.search_id IN ({placeholders}) OR h.search_id IN ({placeholders}))
               AND l.delisted_at IS NULL""",
        search_ids * 3,
    ).fetchall()

    listings = []
    for r in rows:
        details = {}
        if r[7]:
            try:
                details = json.loads(r[7])
            except (ValueError, TypeError):
                pass
        images = []
        if r[8]:
            try:
                images = json.loads(r[8])
            except (ValueError, TypeError):
                pass
        facts = {}
        if r[12]:
            try:
                facts = json.loads(r[12])
            except (ValueError, TypeError):
                pass

        listings.append(
            {
                "id": str(r[0]),
                "title": r[1] or "",
                "price_eur": r[2],
                "location": r[3] or "",
                "url": r[4] or "",
                "detailed_description": r[5] or "",
                "short_description": r[6] or "",
                "details": details,
                "images": images,
                "last_seen_at": r[9],
                "fit_verdict": r[10],
                "fit_reason": r[11],
                "fit_facts": facts,
                "fit_stage": r[13],
            }
        )
    return listings


def _compute_simple_score(listing: dict, fields: list[dict]) -> float:
    """Quick Python score approximation for ordering candidates.

    Uses the same logic as score.js: gate from must-haves, value from price
    vs median.  This is for ordering only -- the real score is computed in Node.
    """
    facts = listing.get("fit_facts") or {}
    gate = 1.0
    soft_met = 0
    soft_total = 0

    for field in fields:
        fid = field.get("id")
        wants = field.get("buyer_wants") or {}
        value = facts.get(fid)
        is_hard = field.get("importance") == "high" or field.get("hard")

        if value is None:
            if is_hard:
                gate *= 0.75
            continue

        violated = text_facts.contradicts(wants, value)
        if is_hard:
            if violated:
                return 0.0
        else:
            soft_total += 1
            if not violated:
                soft_met += 1

    identity = (soft_met / soft_total) if soft_total > 0 else 1.0
    return gate * identity


def build_candidate_set(
    conn: sqlite3.Connection,
    campaign_id: int,
    *,
    max_candidates: int = CANDIDATE_CAP,
) -> dict[str, Any]:
    """Builds the candidate set for one campaign.

    Returns {candidates: [...], fields: [...], req_hash: str, search_ids: [...]}.
    """
    search_ids = _campaign_searches(conn, campaign_id)
    if not search_ids:
        return {"candidates": [], "fields": [], "req_hash": "", "search_ids": []}

    fields = _intent_fields(conn, search_ids)
    req_hash = requirements_hash(fields)

    # Step 1: Get all listings
    all_listings = _listings_for_campaign(conn, campaign_id, search_ids)
    logger.info(
        "Campaign %d: %d total listings from %d searches",
        campaign_id,
        len(all_listings),
        len(search_ids),
    )

    # Step 2: Filter out stated must violations (free sieve results)
    candidates = []
    for listing in all_listings:
        verdict = listing.get("fit_verdict")
        if verdict == "no":
            continue
        candidates.append(listing)

    logger.info(
        "Campaign %d: %d candidates after removing rejections",
        campaign_id,
        len(candidates),
    )

    # Step 3: Score and sort
    for c in candidates:
        c["_sort_score"] = _compute_simple_score(c, fields)

    candidates.sort(key=lambda c: c["_sort_score"], reverse=True)

    # Step 4: Cap
    capped = candidates[:max_candidates]
    logger.info(
        "Campaign %d: %d candidates after cap (max %d)",
        campaign_id,
        len(capped),
        max_candidates,
    )

    return {
        "candidates": capped,
        "fields": fields,
        "req_hash": req_hash,
        "search_ids": search_ids,
        "total_before_cap": len(candidates),
    }
