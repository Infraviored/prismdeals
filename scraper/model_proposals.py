"""Candidate model proposals for class hunts (Package P5).

Given a class of product (e.g. '1000cc Supersportler', 'Kombi mit Anhängerkupplung'),
proposes 5–12 realistic candidate models with plausible production years under budget.

Proposals are cached per class node in the `class_models` table for 30 days.
Includes the hallucination guard as a pure function that tracks probe results and drops
models never seen in titles after 2 probes.
Defines the narrow probe_models interface to be wired by Package P2 (scraper.probe).
"""

import datetime
import json
import logging
import os
import re
import sqlite3
import sys

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_CURRENT_DIR)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

import db_schema

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 30


from model_probe import probe_models  # noqa: E402,F401 -- the P2 interface, now real


def make_node_key(category, class_text):
    """Generates a stable key for caching class models."""
    cat_part = str(category or "general").strip().lower()
    clean_class = re.sub(
        r"[^a-zA-Z0-9]+", "-", str(class_text or "").strip().lower()
    ).strip("-")
    return f"{cat_part}:{clean_class or 'default'}"


def apply_hallucination_guard(models_history, probe_results):
    """Pure function filtering out hallucinated models based on probe results.

    A model that has been probed >= 2 times and never seen in listing titles
    (cumulative title_hits == 0) is dropped as a hallucination.

    Args:
        models_history: dict mapping model name to:
            {"probe_count": int, "title_hits": int, ...}
        probe_results: dict mapping model name to:
            {"total": int, "title_hits": int} (from probe)

    Returns:
        tuple (surviving_models, dropped_models)
    """
    surviving = {}
    dropped = []

    for model, hist in models_history.items():
        probe_data = probe_results.get(model, {})
        new_hits = probe_data.get("title_hits", 0)
        was_probed = model in probe_results

        curr_probes = hist.get("probe_count", 0) + (1 if was_probed else 0)
        curr_hits = hist.get("title_hits", 0) + new_hits

        updated = dict(hist)
        updated["probe_count"] = curr_probes
        updated["title_hits"] = curr_hits

        if curr_probes >= 2 and curr_hits == 0:
            dropped.append(model)
        else:
            surviving[model] = updated

    return surviving, dropped


def _get_db_connection(db_path=None):
    path = db_path or db_schema.default_path()
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    db_schema.apply_schema(conn)
    return conn


def get_cached_proposals(node_key, db_path=None):
    """Retrieves cached model proposals for a node_key if fresher than 30 days.

    Excludes models that have failed the hallucination guard (probe_count >= 2 and title_hits == 0).
    """
    conn = _get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT model, years, proposed_at, probe_count, title_hits
            FROM class_models WHERE node_key = ? ORDER BY model ASC
            """,
            (node_key,),
        )
        rows = cursor.fetchall()
        if not rows:
            return None

        now = datetime.datetime.now(datetime.timezone.utc)
        valid = []
        for r in rows:
            try:
                if (
                    now - datetime.datetime.fromisoformat(r["proposed_at"])
                ).days > CACHE_TTL_DAYS:
                    return None
            except Exception:
                return None

            if r["probe_count"] >= 2 and r["title_hits"] == 0:
                continue

            valid.append(
                {
                    "model": r["model"],
                    "years": r["years"],
                    "probe_count": r["probe_count"],
                    "title_hits": r["title_hits"],
                }
            )

        return valid if len(valid) >= 5 else None
    finally:
        conn.close()


def save_proposals(node_key, proposals, db_path=None):
    """Saves candidate model proposals into class_models table."""
    conn = _get_db_connection(db_path)
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        cursor = conn.cursor()
        for p in proposals:
            model = p.get("model", "").strip()
            if not model:
                continue
            cursor.execute(
                """
                INSERT INTO class_models (node_key, model, years, proposed_at, probe_count, title_hits)
                VALUES (?, ?, ?, ?, 0, 0)
                ON CONFLICT(node_key, model) DO UPDATE SET
                    years = excluded.years,
                    proposed_at = excluded.proposed_at
                """,
                (node_key, model, p.get("years", ""), now_str),
            )
        conn.commit()
    finally:
        conn.close()


def update_probe_counts(node_key, probe_results, db_path=None):
    """Updates probe counts and title hits for a node_key using hallucination guard."""
    conn = _get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT model, years, probe_count, title_hits FROM class_models WHERE node_key = ?",
            (node_key,),
        )
        history = {
            r["model"]: {
                "years": r["years"],
                "probe_count": r["probe_count"],
                "title_hits": r["title_hits"],
            }
            for r in cursor.fetchall()
        }

        surviving, dropped = apply_hallucination_guard(history, probe_results)

        for model, data in surviving.items():
            cursor.execute(
                "UPDATE class_models SET probe_count = ?, title_hits = ? WHERE node_key = ? AND model = ?",
                (data["probe_count"], data["title_hits"], node_key, model),
            )

        for model in dropped:
            new_cnt = history[model]["probe_count"] + 1
            cursor.execute(
                "UPDATE class_models SET probe_count = ?, title_hits = 0 WHERE node_key = ? AND model = ?",
                (new_cnt, node_key, model),
            )
        conn.commit()
        return surviving, dropped
    finally:
        conn.close()


def build_proposal_prompt(class_text, budget, category, use):
    """Constructs prompt for proposing candidate models under budget."""
    system_prompt = (
        "You are an expert used-goods product advisor for Germany.\n"
        "Propose 5 to 12 realistic, popular candidate models for a given product class.\n"
        "- All proposed models must plausibly fit under budget on the German secondhand market.\n"
        "- Provide plausible production years or generation range under budget (e.g. '2004-2008').\n"
        "- Do NOT invent non-existent models.\n"
        'Output ONLY a valid JSON list of objects: [{"model": "Make Model", "years": "YYYY-YYYY"}]'
    )
    b_str = f"<= {budget} €" if budget else "reasonable used market price"
    user_prompt = (
        f"Product class: {class_text}\nCategory: {category or 'General'}\n"
        f"Budget: {b_str}\nIntended use: {use or 'Standard'}\n\nReturn JSON list:"
    )
    return system_prompt, user_prompt


def propose_models(
    class_text,
    budget=None,
    category=None,
    use=None,
    db_path=None,
    offline=False,
    raw_response_override=None,
):
    """Proposes 5-12 candidate models with plausible years under budget.

    Checks the 30-day cache in class_models first. Without a model answer there
    are no proposals: a hard-coded list or "<class> Modell A" placeholders
    looked like real candidates and were cached for a month.
    """
    class_clean = str(class_text or "").strip()
    if not class_clean:
        return []

    node_key = make_node_key(category, class_clean)

    if raw_response_override is None:
        cached = get_cached_proposals(node_key, db_path)
        if cached:
            return [{"model": c["model"], "years": c["years"]} for c in cached]

    raw_json_str = None
    if raw_response_override is not None:
        raw_json_str = (
            raw_response_override
            if isinstance(raw_response_override, str)
            else json.dumps(raw_response_override)
        )
    elif offline:
        return []
    else:
        try:
            from config import API_KEY

            if not API_KEY:
                return []

            from agent_worker import client, build_llm_kwargs, get_response_text

            sys_p, usr_p = build_proposal_prompt(class_clean, budget, category, use)
            messages = [
                {"role": "system", "content": sys_p},
                {"role": "user", "content": usr_p},
            ]
            kwargs = build_llm_kwargs(messages, max_tokens=1000, temperature=0.2)
            response = client.chat.completions.create(**kwargs)
            raw_json_str = get_response_text(response)
        except Exception as e:  # noqa: BLE001
            logger.warning("Model proposal call failed (%s).", e)
            return []

    parsed = None
    if raw_json_str:
        m = re.search(r"\[\s*\{[\s\S]*\}\s*\]", raw_json_str)
        cleaned = m.group(0) if m else raw_json_str.strip()
        try:
            parsed = json.loads(cleaned)
        except Exception as err:  # noqa: BLE001
            logger.warning("Failed to decode model proposals JSON: %s", err)

    proposals = []
    for item in parsed if isinstance(parsed, list) else []:
        if isinstance(item, dict) and str(item.get("model") or "").strip():
            proposals.append(
                {
                    "model": str(item["model"]).strip(),
                    "years": str(item.get("years", "")).strip(),
                }
            )
    if proposals:
        save_proposals(node_key, proposals, db_path)
    return proposals


def propose_and_probe(
    class_text, base, budget=None, category=None, use=None, db_path=None
):
    """Proposals checked against the market: each with its count and median.

    Models the guard has dropped (probed twice, never in a title) are left out;
    the rest come back sorted by how many offers carry their name.
    """
    proposals = propose_models(
        class_text, budget=budget, category=category, use=use, db_path=db_path
    )
    if not proposals:
        return []
    node_key = make_node_key(category, class_text)
    results = probe_models([p["model"] for p in proposals], base)
    _, dropped = update_probe_counts(node_key, results, db_path)
    out = []
    for p in proposals:
        if p["model"] in dropped:
            continue
        seen = results.get(p["model"])
        out.append(
            {**p, **(seen or {"total": None, "title_hits": None, "median": None})}
        )
    out.sort(key=lambda p: -(p.get("title_hits") or 0))
    return out


def main():
    """CLI runner for scraper/model_proposals.py."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Propose candidate models for class hunts."
    )
    parser.add_argument("class_text", nargs="?", default="", help="Class description")
    parser.add_argument("--budget", "-b", default=None, help="Budget limit in EUR")
    parser.add_argument("--category", "-c", default=None, help="Category ID or slug")
    parser.add_argument("--use", "-u", default=None, help="Intended use")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip the model call (returns cached proposals only)",
    )
    parser.add_argument(
        "--probe",
        default=None,
        help="JSON hunt frame; probe each proposal on the market",
    )
    args = parser.parse_args()

    c_text = args.class_text.strip()
    if not c_text and not sys.stdin.isatty():
        c_text = sys.stdin.read().strip()

    if args.probe:
        models = propose_and_probe(
            c_text,
            json.loads(args.probe),
            budget=args.budget,
            category=args.category,
            use=args.use,
        )
    else:
        models = propose_models(
            c_text,
            budget=args.budget,
            category=args.category,
            use=args.use,
            offline=args.offline,
        )
    print(json.dumps(models, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
