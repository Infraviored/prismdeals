"""Comparative judging (§9.2–§9.6): three shuffled model runs over a hunt's
candidates, merged into one ranking with reasons and seller questions.

The candidates come from the backend (backend/compare_api.js), which picks
them from the computed verdicts -- the same ones the list shows -- so this
module never decides what fits. Entry point: compare_campaign(payload).
"""

import datetime
import json
import logging
import sqlite3
import time
from typing import Any

import db_schema
from compare_prompt import build_compare_prompt, parse_compare_response
from compare_stability import (
    shuffle_candidates,
    merge_ranks,
    compute_stability,
)

logger = logging.getLogger(__name__)

NUM_RUNS = 3
# More than this many candidates run as a tournament of groups.
CANDIDATE_CAP = 30
TOURNAMENT_GROUP_SIZE = 30
TOURNAMENT_ADVANCE = 10


def _llm_call(prompt: str, max_tokens: int = 4000) -> tuple[str, dict]:
    """One call through the configured model, in the dialect llm_client builds.

    Returns (response_text, usage_info).
    """
    from llm_client import build_llm_kwargs, client, get_response_text

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


def _store_run(
    conn: sqlite3.Connection,
    campaign_id: int,
    conditions: list[dict],
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
            _conditions_hash(conditions),
            # What each condition said when it was judged.
            json.dumps(
                {str(c["id"]): c["text"] for c in conditions},
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
                    same_as, uncertain, spread)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
            ),
        )

    conn.commit()
    return run_id


def _conditions_hash(conditions):
    import hashlib

    text = json.dumps(
        sorted((str(c["id"]), c["text"], c["importance"]) for c in conditions),
        ensure_ascii=False,
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


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
    conditions: list[dict],
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
        prompt = build_compare_prompt(group, conditions, node_knowledge=node_knowledge)
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
    payload: dict,
    db_path: str | None = None,
    num_runs: int = NUM_RUNS,
) -> dict[str, Any]:
    """Full comparative judging for one hunt.

    payload: {campaign_id, candidates:[listing dicts with states], conditions:
    [{id, text, importance}], knowledge: str}; each candidate carries its
    usual_price.
    Returns {run_id, merged, stability, usage, duration_s}.
    """
    conn = db_schema.connect(db_path or db_schema.default_path())
    conn.row_factory = sqlite3.Row
    t0 = time.time()
    campaign_id = payload["campaign_id"]
    candidates = payload.get("candidates") or []
    conditions = payload.get("conditions") or []
    node_knowledge = payload.get("knowledge") or ""
    candidate_count = len(candidates)

    if not candidates:
        logger.info("Campaign %d: no candidates for comparison", campaign_id)
        # An empty run, stored: the screen shows the latest run's ranks, and
        # without it old ranks stayed on listings that no longer fit.
        run_id = _store_run(conn, campaign_id, conditions, [], {}, {}, 0.0, "")
        return {
            "run_id": run_id,
            "merged": [],
            "stability": {},
            "usage": {},
            "duration_s": 0,
        }

    # Tournament if > CANDIDATE_CAP
    if len(candidates) > CANDIDATE_CAP:
        candidates = _tournament(candidates, conditions, node_knowledge=node_knowledge)

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
            shuffled, conditions, node_knowledge=node_knowledge
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
    merged = merge_ranks(all_runs, candidate_count)
    stability = compute_stability(all_runs)

    duration_s = time.time() - t0

    # Store
    run_id = _store_run(
        conn,
        campaign_id,
        conditions,
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
