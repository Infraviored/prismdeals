#!/usr/bin/env python3
"""CLI and backend worker for knowledge nodes and research bridge (P7).

Commands:
  brief <campaign_id>     Build research brief (or report 'nicht nötig')
  classify <node_key>     Classify pasted answer from stdin into claims
  claims-listing <id>     Get inherited claims for a listing
  claims-node <node_key>  Get inherited claims for a node
  approve <claim_id>      Approve a pending claim
  reject <claim_id>       Reject and delete a claim
"""

import argparse
import json
import logging
import os
import re
import sqlite3
import sys

import citations
import claims
import db_schema
import profiles
import research_bridge

logger = logging.getLogger(__name__)


def _connect(db_path=None):
    if db_path is None:
        db_path = os.environ.get("PRISMDEALS_DB") or db_schema.default_path()
    conn = db_schema.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _market_for_campaign(conn, campaign_id):
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


def _resolve_campaign_context(conn, campaign_id):
    row = conn.execute(
        "SELECT id, name, profile_key, intent_json, hunt_type FROM campaigns WHERE id = ?",
        (campaign_id,),
    ).fetchone()
    if not row:
        return None, None, None, None, {}

    name = row["name"] or ""
    profile_key = row["profile_key"] or ""
    intent_raw = row["intent_json"]
    intent = {}
    if intent_raw:
        try:
            intent = (
                json.loads(intent_raw) if isinstance(intent_raw, str) else intent_raw
            )
        except (ValueError, TypeError):
            intent = {"text": str(intent_raw)}
    if not intent:
        intent = {"text": name}

    profile = profiles.PROFILES.get(profile_key)
    if not profile and profile_key:
        profile = getattr(profiles, "by_key", lambda k: None)(profile_key)
    if not profile:
        # The category of the hunt's own searches decides, as for every other
        # judgement (scraper/profiles.py). A keyword list with "vehicle" as the
        # default made RAM, laptops and mattresses vehicles.
        for (url,) in conn.execute(
            """SELECT url FROM searches WHERE campaign_id = ?
               UNION ALL SELECT base_url FROM search_families WHERE campaign_id = ?""",
            (campaign_id, campaign_id),
        ).fetchall():
            found, category, _source = profiles.profile_for(search_url=url)
            if category is not None:
                profile = found
                break
    if not profile:
        profile = profiles.PROFILES.get("open")

    # Find candidate node_key
    node_key = None
    rank_node = conn.execute(
        """SELECT lr.node_key FROM listing_ranks lr
             JOIN judge_runs jr ON jr.id = lr.run_id
            WHERE jr.campaign_id = ? AND lr.node_key IS NOT NULL AND lr.node_key != ''
            ORDER BY jr.created_at DESC LIMIT 1""",
        (campaign_id,),
    ).fetchone()
    if rank_node and rank_node[0]:
        node_key = rank_node[0]
    else:
        # Infer node_key from name/profile
        cleaned_name = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
        cat = profile.key if profile else "general"
        node_key = f"{cat}/{cleaned_name}" if cleaned_name else cat

    market = _market_for_campaign(conn, campaign_id)
    return row, profile, intent, node_key, market


def _try_llm_call(prompt, max_tokens=2000):
    try:
        from agent_worker import build_llm_kwargs, client, get_response_text

        kwargs = build_llm_kwargs(
            [{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.2,
        )
        response = client.chat.completions.create(**kwargs)
        return get_response_text(response)
    except Exception as exc:
        logger.info("LLM call not available or failed: %s", exc)
        return None


def cmd_brief(args):
    conn = _connect(args.db)
    campaign, profile, intent, node_key, market = _resolve_campaign_context(
        conn, args.campaign_id
    )
    if not campaign:
        print(json.dumps({"error": f"Campaign {args.campaign_id} not found"}))
        return 1

    existing = claims.claims_for(conn, node_key) if node_key else []
    median_price = market.get("median")
    level, reason = claims.needs_research(
        median_price, profile, node_key=node_key, conn=conn
    )

    if level == "none":
        out = {
            "decision": "nicht nötig",
            "research_value": "none",
            "reason": reason,
            "what_to_know": [],
            "brief": "",
            "existing_claims": existing,
            "node_key": node_key,
        }
        print(json.dumps(out, ensure_ascii=False))
        return 0

    what_to_know = []
    search_brief_text = ""
    decision = "lohnt sich"

    if not args.no_llm:
        brief_prompt = research_bridge.build_brief_prompt(
            intent, profile, market, existing
        )
        resp_text = _try_llm_call(brief_prompt, max_tokens=1000)
        if resp_text:
            parsed = research_bridge.parse_brief_response(resp_text)
            if parsed:
                decision = parsed.get("decision", "lohnt sich")
                what_to_know = parsed.get("what_to_know", [])
                search_brief_text = parsed.get("search_brief", "")

    if not what_to_know:
        # Default questions from profile
        name = campaign["name"] or node_key
        what_to_know = [
            f"Bekannte Schwachstellen und typische Schäden bei {name}",
            "Wartungsintervalle und kostspielige Reparaturen",
            "Worauf beim Kauf vor Ort und in Inseraten zu achten ist",
        ]
        search_brief_text = (
            f"Recherchiere technische Schwachstellen und Kaufberatung für {name}."
        )

    search_brief = research_bridge.build_search_brief(
        profile, what_to_know, search_brief_text, model_name=campaign["name"]
    )

    out = {
        "decision": decision,
        "research_value": level,
        "reason": reason,
        "what_to_know": what_to_know,
        "brief": search_brief,
        "existing_claims": existing,
        "node_key": node_key,
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


# Remarks of the research AI about the task, not about the product.
_META = re.compile(
    r"(Einordnung der Vorgaben|deine[rn]? (ausdrücklichen )?Vorgabe|wie gewünscht|"
    r"ich nenne|nenne ich|hier deine Erkenntnisse)",
    re.IGNORECASE,
)
_BULLET = re.compile(r"^(?:[-*•]\s+|\d{1,2}[.)]\s+)")
# A paragraph that opens with a bold label is a fact of its own:
# "**Honda SC57 – Lichtmaschine:** Besonders für 2004/05 …".
_LABELLED = re.compile(r"^\*\*[^*]{3,80}:?\*\*")


def _fallback_parse_answer(text):
    """Heuristic fallback to extract claims when LLM is unavailable."""
    found = []
    current_kind = "check"
    heading_kind_map = {
        "schwäche": "weakness",
        "schwach": "weakness",
        "mangel": "weakness",
        "wartung": "maintenance",
        "service": "maintenance",
        "intervall": "maintenance",
        "warnzeichen": "warning_sign",
        "risiko": "warning_sign",
        "wert": "value_driver",
        "ausstattung": "value_driver",
        "frage": "seller_question",
        "verkäufer": "seller_question",
        "eignung": "benchmark",
        "einsatz": "benchmark",
    }

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            lower_h = line.lower()
            for token, k in heading_kind_map.items():
                if token in lower_h:
                    current_kind = k
                    break
            continue

        # "**Bold**" at the start of a line is not a bullet: only "- ", "* ",
        # "• ", "3. " start one, or a paragraph opened by a bold label.
        if not (_BULLET.match(line) or _LABELLED.match(line)):
            continue
        stmt = _BULLET.sub("", line).strip()
        if _META.search(stmt):
            continue
        urls = citations.urls_in(stmt)
        clean_stmt = citations.clean_statement(stmt)
        if not clean_stmt:
            continue
        weight = "costly" if current_kind == "weakness" else "minor"
        found.append(
            {
                "kind": current_kind,
                "statement": clean_stmt,
                "check_path": "text"
                if current_kind in ("warning_sign", "seller_question")
                else "on_site",
                "weight": weight,
                "sources": urls,
                "unsourced": len(urls) == 0,
            }
        )
    return found


def cmd_classify(args):
    conn = _connect(args.db)
    node_key = args.node_key
    profile = profiles.PROFILES.get(args.profile) if args.profile else None

    raw_text = sys.stdin.read().strip() if not sys.stdin.isatty() else ""
    if not raw_text and args.text:
        raw_text = args.text.strip()
    if not raw_text:
        print(json.dumps({"error": "No answer text provided via stdin or --text"}))
        return 1

    # Footnotes ("[1][5]" and a list at the end) become the URLs they stand
    # for, so every sentence carries its own sources into either reader.
    raw_text = citations.resolve(raw_text)

    parsed_claims = []
    if not args.no_llm:
        classify_prompt = research_bridge.build_classify_prompt(
            raw_text, node_key, profile
        )
        # Seventeen facts with URLs do not fit in 3000 tokens; the cut-off
        # reply failed to parse and the line splitter took over.
        resp_text = _try_llm_call(classify_prompt, max_tokens=8000)
        if resp_text:
            parsed_claims = research_bridge.parse_classify_response(resp_text)

    if not parsed_claims:
        parsed_claims = _fallback_parse_answer(raw_text)

    # URL validation
    if not args.skip_verify and hasattr(claims, "verify_sources"):
        try:
            import dossiers

            checker = dossiers.default_url_checker()
        except Exception:

            def checker(_url):
                return True

        parsed_claims, _ = claims.verify_sources(parsed_claims, checker)

    # Insert proposed claims into database
    ids = claims.insert_claims(
        conn, node_key, parsed_claims, approved=args.auto_approve
    )

    # Return full claim structures with their DB ids
    result = []
    for claim_id, c in zip(ids, parsed_claims):
        row = conn.execute(
            """SELECT id, node_key, kind, axis, statement, check_path, weight,
                      sources, created_at, expires_at, approved
                 FROM claims WHERE id = ?""",
            (claim_id,),
        ).fetchone()
        if row:
            result.append(claims._row_to_dict(row))
        else:
            item = dict(c)
            item["id"] = claim_id
            item["node_key"] = node_key
            item["approved"] = bool(args.auto_approve)
            result.append(item)

    print(json.dumps(result, ensure_ascii=False))
    return 0


def cmd_claims_listing(args):
    conn = _connect(args.db)
    node_key = claims.node_for_listing(conn, args.listing_id)
    all_claims = claims.claims_for(conn, node_key) if node_key else []
    print(
        json.dumps(
            {
                "listing_id": str(args.listing_id),
                "node_key": node_key,
                "claims": all_claims,
            },
            ensure_ascii=False,
        )
    )
    return 0


def cmd_claims_node(args):
    conn = _connect(args.db)
    all_claims = claims.claims_for(conn, args.node_key)
    print(
        json.dumps(
            {
                "node_key": args.node_key,
                "claims": all_claims,
            },
            ensure_ascii=False,
        )
    )
    return 0


def cmd_approve(args):
    conn = _connect(args.db)
    claims.approve_claim(conn, int(args.claim_id))
    print(json.dumps({"ok": True, "id": int(args.claim_id)}))
    return 0


def cmd_reject(args):
    conn = _connect(args.db)
    claims.reject_claim(conn, int(args.claim_id))
    print(json.dumps({"ok": True, "id": int(args.claim_id)}))
    return 0


def main():
    base_parser = argparse.ArgumentParser(add_help=False)
    base_parser.add_argument("--db", default=None, help="Database path")

    parser = argparse.ArgumentParser(
        description="Knowledge nodes & research bridge CLI", parents=[base_parser]
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_brief = sub.add_parser("brief", parents=[base_parser])
    p_brief.add_argument("campaign_id", type=int)
    p_brief.add_argument("--no-llm", action="store_true")

    p_classify = sub.add_parser("classify", parents=[base_parser])
    p_classify.add_argument("node_key", type=str)
    p_classify.add_argument("--profile", default=None)
    p_classify.add_argument("--text", default=None)
    p_classify.add_argument("--skip-verify", action="store_true")
    p_classify.add_argument("--auto-approve", action="store_true")
    p_classify.add_argument("--no-llm", action="store_true")

    p_cl = sub.add_parser("claims-listing", parents=[base_parser])
    p_cl.add_argument("listing_id")

    p_cn = sub.add_parser("claims-node", parents=[base_parser])
    p_cn.add_argument("node_key")

    p_app = sub.add_parser("approve", parents=[base_parser])
    p_app.add_argument("claim_id", type=int)

    p_rej = sub.add_parser("reject", parents=[base_parser])
    p_rej.add_argument("claim_id", type=int)

    args = parser.parse_args()

    cmds = {
        "brief": cmd_brief,
        "classify": cmd_classify,
        "claims-listing": cmd_claims_listing,
        "claims-node": cmd_claims_node,
        "approve": cmd_approve,
        "reject": cmd_reject,
    }
    return cmds[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main() or 0)
