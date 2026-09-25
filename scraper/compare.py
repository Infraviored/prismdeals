"""Comparative judging orchestrator (§9.2–§9.6).

Ties together the funnel, prompt, stability, and storage.  Entry points:
- compare_campaign(campaign_id): full 3-run comparison with storage
- insert_new_listing(campaign_id, listing_id): incremental insertion (§9.5)
"""

import datetime
import json
import logging
import sqlite3
import time
from typing import Any

import db_schema
import claims
from compare_funnel import build_candidate_set, CANDIDATE_CAP
from compare_prompt import build_compare_prompt, parse_compare_response
from compare_stability import (
    shuffle_candidates,
    merge_ranks,
    compute_stability,
)

logger = logging.getLogger(__name__)

NUM_RUNS = 3
TOURNAMENT_GROUP_SIZE = 30
TOURNAMENT_ADVANCE = 10


def _llm_call(prompt: str, max_tokens: int = 4000) -> tuple[str, dict]:
    """One call through the configured model, in the dialect agent_worker uses.

    Returns (response_text, usage_info).
    """
    from agent_worker import build_llm_kwargs, client, get_response_text

    # A little temperature so the shuffled runs are independent samples.
    kwargs = build_llm_kwargs(
        [{"role": "user", "content": prompt}], max_tokens=max_tokens, temperature=0.3
    )
    response = client.chat.completions.create(**kwargs)
    usage = {}
    if getattr(response, "usage", None):
        usage = {
            "tokens_in": getattr(response.usage, "prompt_tokens", 0) or 0,
            "tokens_out": getattr(response.usage, "completion_tokens", 0) or 0,
        }
    return get_response_text(response), usage


def _output_budget(candidate_count: int) -> int:
    """Tokens for the answer: one JSON line per listing with facts and questions.

    A flat 4000 cut a 30-listing answer off after about half the listings,
    and the missing half silently fell out of the ranking.
    """
    return min(16000, 600 + 350 * candidate_count)


def _fill_missing(parsed: list[dict], candidates: list[dict]) -> list[dict]:
    """Listings the model skipped rank last in that run instead of vanishing."""
    seen = {str(entry["id"]) for entry in parsed}
    last = len(candidates)
    for c in candidates:
        if str(c["id"]) not in seen:
            parsed.append(
                {
                    "id": str(c["id"]),
                    "rank": last,
                    "reason": "",
                    "musts": {},
                    "facts": {},
                    "checks": [],
                    "seller_questions": [],
                    "same_as": [],
                    "missing": True,
                }
            )
    return parsed


def _market_stats(conn: sqlite3.Connection, campaign_id: int) -> dict:
    """Count and median price of the campaign's live listings, for the prompt."""
    rows = conn.execute(
        """SELECT DISTINCT l.id, l.price_eur
             FROM listings l
             JOIN listing_search_hits h ON h.listing_id = l.id
             JOIN searches s ON s.id = h.search_id
            WHERE s.campaign_id = ? AND l.price_eur IS NOT NULL
              AND l.price_eur > 0 AND l.delisted_at IS NULL""",
        (campaign_id,),
    ).fetchall()
    prices = [r[1] for r in rows]
    if not prices:
        return {}
    import statistics

    return {"count": len(prices), "median": round(statistics.median(prices))}


def _store_run(
    conn: sqlite3.Connection,
    campaign_id: int,
    req_hash: str,
    fields: list[dict],
    merged: list[dict],
    stability: dict,
    total_usage: dict,
    duration_s: float,
    model: str,
) -> int:
    """Stores a completed judge run and its listing ranks."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    cursor = conn.execute(
        """INSERT INTO judge_runs
               (campaign_id, requirements_hash, requirements_json, created_at, model,
                tokens_in, tokens_out, cost_eur, duration_s,
                candidate_count, kendall_tau, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete')""",
        (
            campaign_id,
            req_hash,
            # What each must meant when it was judged: the score applies a
            # judged state only while the buyer still wants the same thing.
            json.dumps(
                {
                    f.get("id"): f.get("buyer_wants") or {}
                    for f in fields
                    if f.get("id")
                },
                sort_keys=True,
                ensure_ascii=False,
            ),
            now,
            model,
            total_usage.get("tokens_in", 0),
            total_usage.get("tokens_out", 0),
            _estimate_cost(total_usage),
            round(duration_s, 1),
            len(merged),
            stability.get("mean_tau"),
        ),
    )
    run_id = cursor.lastrowid

    for entry in merged:
        conn.execute(
            """INSERT INTO listing_ranks
                   (run_id, listing_id, rank, rank_of, reason,
                    musts_json, facts_json, questions_json,
                    same_as, uncertain, spread, node_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                str(entry["id"]),
                entry["rank"],
                entry.get("rank_of", len(merged)),
                entry.get("reason", ""),
                json.dumps(entry.get("musts", {}), ensure_ascii=False),
                json.dumps(entry.get("facts", {}), ensure_ascii=False),
                json.dumps(entry.get("seller_questions", []), ensure_ascii=False),
                json.dumps(entry.get("same_as", []), ensure_ascii=False),
                1 if entry.get("uncertain") else 0,
                entry.get("spread"),
                entry.get("node") or entry.get("node_key") or None,
            ),
        )

    conn.commit()
    return run_id


def _estimate_cost(usage: dict) -> float:
    """Rough cost estimate in EUR.  DeepSeek flash is ~0.07/M in, ~0.28/M out."""
    tokens_in = usage.get("tokens_in", 0)
    tokens_out = usage.get("tokens_out", 0)
    # DeepSeek v4.1 flash pricing (approximate)
    cost_usd = (tokens_in * 0.07 + tokens_out * 0.28) / 1_000_000
    return round(cost_usd * 0.92, 6)  # USD→EUR rough


def partition_tournament_groups(
    candidates: list,
    group_size: int = TOURNAMENT_GROUP_SIZE,
) -> list[list]:
    """Partitions candidates into groups of at most group_size (§9.4)."""
    if not candidates:
        return []
    groups = []
    for i in range(0, len(candidates), group_size):
        groups.append(candidates[i : i + group_size])
    return groups


def _tournament(
    candidates: list[dict],
    fields: list[dict],
    market: dict,
    node_knowledge: str = "",
) -> list[dict]:
    """Tournament for > 30 candidates (§9.4).

    Groups of ≤ 30, top 10 of each into a final group.
    """
    logger.info("Tournament mode: %d candidates", len(candidates))
    shuffled = list(candidates)
    import random

    random.shuffle(shuffled)

    groups = partition_tournament_groups(shuffled, TOURNAMENT_GROUP_SIZE)

    # Run each group
    group_winners = []
    for gi, group in enumerate(groups):
        logger.info("Tournament group %d: %d candidates", gi + 1, len(group))
        prompt = build_compare_prompt(
            group, fields, market, node_knowledge=node_knowledge
        )
        response_text, _ = _llm_call(prompt, _output_budget(len(group)))
        parsed = parse_compare_response(response_text, group)
        # Take top TOURNAMENT_ADVANCE
        parsed.sort(key=lambda e: e["rank"])
        group_winners.extend(parsed[:TOURNAMENT_ADVANCE])

    logger.info("Tournament final: %d candidates", len(group_winners))

    # Map winner IDs back to full candidate dicts
    id_to_candidate = {str(c["id"]): c for c in candidates}
    final_candidates = []
    for w in group_winners:
        if str(w["id"]) in id_to_candidate:
            final_candidates.append(id_to_candidate[str(w["id"])])

    return final_candidates


def compare_campaign(
    campaign_id: int,
    db_path: str | None = None,
    num_runs: int = NUM_RUNS,
    node_knowledge: str | None = None,
) -> dict[str, Any]:
    """Full comparative judging for one campaign.

    Returns {run_id, merged, stability, usage, duration_s}.
    """
    if db_path is None:
        db_path = db_schema.default_path()

    conn = db_schema.connect(db_path)
    conn.row_factory = sqlite3.Row

    t0 = time.time()

    # Build candidate set
    funnel = build_candidate_set(conn, campaign_id)
    candidates = funnel["candidates"]
    fields = funnel["fields"]
    req_hash = funnel["req_hash"]

    if not candidates:
        logger.info("Campaign %d: no candidates for comparison", campaign_id)
        return {
            "run_id": None,
            "merged": [],
            "stability": {},
            "usage": {},
            "duration_s": 0,
        }

    market = _market_stats(conn, campaign_id)

    # Load inherited node knowledge for candidates (P7)
    if node_knowledge is None:
        parts = []
        seen_nodes = set()
        for c in candidates:
            nk = claims.node_for_listing(conn, c["id"])
            if nk and nk not in seen_nodes:
                seen_nodes.add(nk)
                text = claims.claims_for_prompt(conn, nk)
                if text:
                    parts.append(f"### {nk}\n{text}")
        node_knowledge = "\n\n".join(parts)

    # Tournament if > CANDIDATE_CAP
    if len(candidates) > CANDIDATE_CAP:
        candidates = _tournament(
            candidates, fields, market, node_knowledge=node_knowledge
        )

    # Run NUM_RUNS shuffled comparisons
    all_runs: list[list[dict]] = []
    total_usage = {"tokens_in": 0, "tokens_out": 0}
    model_name = ""

    try:
        from config import LLM_MODEL

        model_name = LLM_MODEL
    except ImportError:
        pass

    for run_idx in range(num_runs):
        shuffled = shuffle_candidates(candidates, seed=run_idx * 7919)
        prompt = build_compare_prompt(
            shuffled, fields, market, node_knowledge=node_knowledge
        )
        response_text, usage = _llm_call(prompt, _output_budget(len(candidates)))

        total_usage["tokens_in"] += usage.get("tokens_in", 0)
        total_usage["tokens_out"] += usage.get("tokens_out", 0)

        parsed = _fill_missing(
            parse_compare_response(response_text, candidates), candidates
        )
        all_runs.append(parsed)
        logger.info(
            "Run %d/%d: %d listings ranked",
            run_idx + 1,
            num_runs,
            len(parsed),
        )

    # Merge and compute stability
    candidate_count = funnel.get("total_before_cap", len(candidates))
    merged = merge_ranks(all_runs, candidate_count)
    stability = compute_stability(all_runs)

    duration_s = time.time() - t0

    # Store
    run_id = _store_run(
        conn,
        campaign_id,
        req_hash,
        fields,
        merged,
        stability,
        total_usage,
        duration_s,
        model_name,
    )

    conn.close()

    return {
        "run_id": run_id,
        "merged": merged,
        "stability": stability,
        "usage": total_usage,
        "duration_s": round(duration_s, 1),
        "model": model_name,
    }


def get_latest_ranks(
    conn: sqlite3.Connection,
    campaign_id: int,
) -> list[dict]:
    """Returns the latest judge run's listing ranks for a campaign."""
    run = conn.execute(
        """SELECT id, created_at, kendall_tau FROM judge_runs
            WHERE campaign_id = ? AND status = 'complete'
            ORDER BY created_at DESC LIMIT 1""",
        (campaign_id,),
    ).fetchone()
    if not run:
        return []

    run_id = run[0] if isinstance(run, tuple) else run["id"]
    rows = conn.execute(
        """SELECT listing_id, rank, rank_of, reason, musts_json,
                  facts_json, questions_json, same_as, uncertain, spread, node_key
             FROM listing_ranks WHERE run_id = ?""",
        (run_id,),
    ).fetchall()

    results = []
    for r in rows:
        if isinstance(r, tuple):
            results.append(
                {
                    "listing_id": r[0],
                    "rank": r[1],
                    "rank_of": r[2],
                    "reason": r[3],
                    "musts": _safe_json(r[4]),
                    "facts": _safe_json(r[5]),
                    "seller_questions": _safe_json(r[6]),
                    "same_as": _safe_json(r[7]),
                    "uncertain": bool(r[8]),
                    "spread": r[9],
                    "node_key": r[10],
                }
            )
        else:
            results.append(
                {
                    "listing_id": r["listing_id"],
                    "rank": r["rank"],
                    "rank_of": r["rank_of"],
                    "reason": r["reason"],
                    "musts": _safe_json(r["musts_json"]),
                    "facts": _safe_json(r["facts_json"]),
                    "seller_questions": _safe_json(r["questions_json"]),
                    "same_as": _safe_json(r["same_as"]),
                    "uncertain": bool(r["uncertain"]),
                    "spread": r["spread"],
                    "node_key": r["node_key"],
                }
            )
    return results


def _safe_json(text: str | None) -> Any:
    if not text:
        return {}
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return {}
