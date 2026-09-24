"""Stability: 3 shuffled runs, mean rank, Kendall tau (§9.3).

Three runs with shuffled candidate order, same input.  Final rank = mean rank.
Spread > 5 places marks a listing as uncertain.  Kendall tau between runs is
computed and stored; target ≥ 0.7.
"""

import logging
import random
from itertools import combinations
from typing import Any

logger = logging.getLogger(__name__)

UNCERTAIN_SPREAD = 5


def shuffle_candidates(candidates: list[dict], seed: int) -> list[dict]:
    """Returns a new list with the candidates in a deterministic shuffled order."""
    shuffled = list(candidates)
    rng = random.Random(seed)
    rng.shuffle(shuffled)
    return shuffled


def merge_ranks(
    runs: list[list[dict]],
    candidate_count: int,
) -> list[dict]:
    """Merges multiple ranked runs into a single ranking by mean rank.

    Each run is a list of {id, rank, reason, musts, facts, ...} dicts.
    Returns a merged list sorted by mean rank, with spread and uncertain flags.
    """
    # Collect ranks per listing across runs
    ranks_by_id: dict[str, list[int]] = {}
    data_by_id: dict[str, dict] = {}

    for run in runs:
        for entry in run:
            lid = str(entry["id"])
            ranks_by_id.setdefault(lid, []).append(entry["rank"])
            # Keep the latest run's data as the representative
            data_by_id[lid] = entry

    # Compute mean rank and spread
    merged = []
    for lid, ranks in ranks_by_id.items():
        mean_rank = sum(ranks) / len(ranks)
        spread = max(ranks) - min(ranks) if len(ranks) > 1 else 0
        entry = dict(data_by_id[lid])
        entry["rank"] = round(mean_rank)
        entry["spread"] = spread
        entry["uncertain"] = spread > UNCERTAIN_SPREAD
        merged.append(entry)

    # Sort by mean rank
    merged.sort(key=lambda e: e["rank"])

    # Re-assign sequential ranks (1-based, no gaps)
    for i, entry in enumerate(merged):
        entry["rank"] = i + 1
        entry["rank_of"] = candidate_count

    return merged


def kendall_tau(run_a: list[dict], run_b: list[dict]) -> float:
    """Kendall tau-b between two ranked runs.

    Only considers listings present in both runs.  Returns a value in [-1, 1]
    where 1 means perfect agreement.
    """
    rank_a = {str(e["id"]): e["rank"] for e in run_a}
    rank_b = {str(e["id"]): e["rank"] for e in run_b}

    common = sorted(set(rank_a) & set(rank_b))
    if len(common) < 2:
        return 1.0

    concordant = 0
    discordant = 0

    for i, j in combinations(common, 2):
        diff_a = rank_a[i] - rank_a[j]
        diff_b = rank_b[i] - rank_b[j]
        product = diff_a * diff_b
        if product > 0:
            concordant += 1
        elif product < 0:
            discordant += 1
        # ties (product == 0) are neither

    n = concordant + discordant
    if n == 0:
        return 1.0
    return (concordant - discordant) / n


def compute_stability(runs: list[list[dict]]) -> dict[str, Any]:
    """Computes pairwise Kendall tau and mean tau across all runs."""
    if len(runs) < 2:
        return {"taus": [], "mean_tau": 1.0}

    taus = []
    for i, j in combinations(range(len(runs)), 2):
        tau = kendall_tau(runs[i], runs[j])
        taus.append({"run_a": i, "run_b": j, "tau": round(tau, 4)})

    mean_tau = sum(t["tau"] for t in taus) / len(taus) if taus else 1.0
    return {"taus": taus, "mean_tau": round(mean_tau, 4)}
