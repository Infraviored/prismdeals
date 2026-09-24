#!/usr/bin/env python3
"""Benchmark runner for Kleinanzeigen hunt engine.

Runs benchmark hunts B1-B8 defined in scripts/benchmarks/hunts.json.
Respects rate limiting (<= 1 req/s), supports fixture recording and offline replay,
and runs exclusively against copy databases via PRISMDEALS_DB.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time

# Ensure repo root and scraper directory are in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRAPER_DIR = os.path.join(REPO_ROOT, "scraper")
if SCRAPER_DIR not in sys.path:
    sys.path.insert(0, SCRAPER_DIR)

import playbooks
import result_list
import scraper
import search_url
import text_facts

FIXTURES_DIR = os.path.join(SCRAPER_DIR, "fixtures", "probe")
HUNTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hunts.json")
PROD_DB = "/home/flo/docker-projects/prismdeals/data/scraper.db"

_last_request_time = 0.0


def check_database_safety(db_path):
    """Enforces that benchmarks never run against the live production database."""
    abs_db = os.path.abspath(db_path)
    if abs_db == os.path.abspath(PROD_DB):
        raise RuntimeError(
            f"Safety violation: Refusing to run benchmarks against production database: {abs_db}."
            " Please point PRISMDEALS_DB to a copy database (e.g. /tmp/p0p1_test.db)."
        )


def fetch_url(url, live=False, offline=False, record=False):
    """Fetches a URL respecting rate limits (<= 1 req/s) or reads from fixture cache."""
    global _last_request_time

    os.makedirs(FIXTURES_DIR, exist_ok=True)
    url_hash = hashlib.sha1(url.encode("utf-8")).hexdigest()
    fixture_path = os.path.join(FIXTURES_DIR, f"{url_hash}.html")

    if not live and os.path.exists(fixture_path):
        with open(fixture_path, "r", encoding="utf-8") as f:
            return f.read(), False

    if offline:
        raise FileNotFoundError(
            f"Offline mode requested but fixture does not exist for URL: {url} ({fixture_path})"
        )

    # Rate limiting: strictly ensure at least 1.0 second between network requests
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    resp = scraper.fetch(url, timeout=15)
    _last_request_time = time.time()
    html = resp.text

    if record:
        with open(fixture_path, "w", encoding="utf-8") as f:
            f.write(html)

    return html, True


def evaluate_fit(hunt, card):
    """Evaluates whether a candidate listing fits the hunt's criteria."""
    title = (card.get("title") or "").strip()
    desc = (card.get("description") or "").strip()
    text = f"{title} {desc}".lower()
    price = card.get("price_eur")
    max_price = hunt.get("max_price")

    if max_price is not None and price is not None and price > max_price:
        return False

    cat_code = hunt.get("category_code")
    playbook = playbooks.playbook_for_category_code(cat_code)
    intent = hunt.get("intent") or {}
    musts = intent.get("musts") or []

    # 1. Playbook-driven judgment if musts exist (e.g. B1 RAM)
    if playbook and musts:
        verdict, facts, reasons = text_facts.judge(playbook, musts, title)
        if verdict == "candidate":
            return True
        if verdict == "unclear" and desc:
            verdict, facts, reasons = text_facts.judge(
                playbook, musts, f"{title}\n{desc}"
            )
            if verdict == "candidate":
                return True
        if verdict == "reject":
            return False

    # 2. Model shortlist match (e.g. B2)
    models = intent.get("models") or hunt.get("models") or []
    if models:
        for model in models:
            norm_m = model.lower()
            tokens = [t for t in re.split(r"[^a-z0-9]+", norm_m) if len(t) > 1]
            if all(t in text for t in tokens):
                return True
        return False

    # 3. Class hunt (e.g. B3 supersportler)
    if hunt.get("hunt_type") == "class":
        if any(
            term in text
            for term in [
                "supersport",
                "superbike",
                "1000",
                "cbr",
                "r1",
                "gsx-r",
                "zx-10r",
                "ninja",
            ]
        ):
            return True
        return False

    # 4. Features hunt (e.g. B4 oled laptop)
    if hunt.get("hunt_type") == "features":
        if "oled" in text:
            return True
        return False

    # 5. Fit hunts (e.g. B5 mattress, B6 wardrobe)
    if hunt.get("id") == "B5":
        if "140" in text and "200" in text:
            return True
        return False
    if hunt.get("id") == "B6":
        if "schrank" in text or "kleiderschrank" in text:
            return True
        return False

    # 6. Taste / Opportunity (B7 vintage armchair, B8 tools)
    if hunt.get("id") == "B7":
        if any(
            w in text
            for w in ["sessel", "armchair", "vintage", "retro", "cocktailsessel"]
        ):
            return True
        return False

    if hunt.get("id") == "B8":
        if any(
            w in text
            for w in ["werkzeug", "bohrer", "schrauber", "saege", "zange", "koffer"]
        ):
            return True
        return False

    return True


def clean_title(title, max_len=45):
    """Sanitizes and truncates listing titles for table display."""
    t = re.sub(r"\s+", " ", title or "").strip()
    t = t.replace("|", "/")
    if len(t) > max_len:
        return t[: max_len - 1] + "…"
    return t


def run_benchmark(hunt, live=False, offline=False, record=False):
    """Runs a single benchmark hunt across its seed rungs."""
    hunt_id = hunt["id"]
    seed_terms = hunt.get("seed_terms") or []
    cat_code = hunt.get("category_code", "").lstrip("c")
    max_price = hunt.get("max_price")
    loc_id = hunt.get("location_id", "7091")
    loc_slug = hunt.get("location_slug", "landsberg-am-lech")

    start_time = time.time()
    network_requests = 0
    seen_cards = {}
    rungs_count = len(seed_terms)

    rad = hunt.get("radius_km")
    for term in seed_terms:
        if rad:
            url = search_url.compose_search_url(
                location_slug=loc_slug,
                location_id=loc_id,
                radius=rad,
                min_price=None,
                max_price=max_price,
                query=term,
                category=cat_code,
            )
        else:
            url = search_url.compose_search_url(
                category_slug="suchanfrage",
                min_price=None,
                max_price=max_price,
                query=term,
                category=cat_code,
            )

        html, is_network = fetch_url(url, live=live, offline=offline, record=record)
        if is_network:
            network_requests += 1

        cards = result_list.parse(html)
        for card in cards:
            cid = card.get("id") or card.get("source_id")
            if cid and cid not in seen_cards:
                seen_cards[cid] = card

    elapsed_seconds = time.time() - start_time
    candidates = list(seen_cards.values())
    fit_candidates = [c for c in candidates if evaluate_fit(hunt, c)]

    top_titles = [clean_title(c.get("title", "")) for c in fit_candidates[:3]]
    if len(top_titles) < 3:
        for c in candidates:
            ct = clean_title(c.get("title", ""))
            if ct not in top_titles:
                top_titles.append(ct)
            if len(top_titles) >= 3:
                break

    return {
        "id": hunt_id,
        "name": hunt["name"],
        "hunt_type": hunt["hunt_type"],
        "rungs": rungs_count,
        "requests": network_requests,
        "seconds": elapsed_seconds,
        "candidates": len(candidates),
        "fit": len(fit_candidates),
        "top_titles": "; ".join(top_titles) if top_titles else "None found",
    }


def main():
    parser = argparse.ArgumentParser(description="Run Kleinanzeigen benchmark hunts")
    parser.add_argument("--hunt", help="Run a specific hunt by ID (e.g. B1)")
    parser.add_argument(
        "--record", action="store_true", help="Record fetched HTML pages to fixtures"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Force live network fetches instead of fixtures",
    )
    parser.add_argument(
        "--offline", action="store_true", help="Only read from saved fixtures"
    )
    parser.add_argument(
        "--db",
        default=os.environ.get("PRISMDEALS_DB", "/tmp/p0p1_test.db"),
        help="Path to test copy database (never production database)",
    )
    args = parser.parse_args()

    check_database_safety(args.db)
    os.environ["PRISMDEALS_DB"] = args.db

    with open(HUNTS_FILE, "r", encoding="utf-8") as f:
        hunts = json.load(f)

    if args.hunt:
        hunts = [h for h in hunts if h["id"].upper() == args.hunt.upper()]
        if not hunts:
            print(f"Error: Hunt {args.hunt} not found in {HUNTS_FILE}", file=sys.stderr)
            sys.exit(1)

    results = []
    for hunt in hunts:
        res = run_benchmark(
            hunt, live=args.live, offline=args.offline, record=args.record
        )
        results.append(res)

    print("\n### Benchmark Results\n")
    print(
        "| # | Hunt | Type | Rungs | Requests | Seconds | Candidates | Fit | Top 3 Titles |"
    )
    print("|---|---|---|---|---|---|---|---|---|")
    for r in results:
        print(
            f"| {r['id']} | {r['name']} | {r['hunt_type']} | {r['rungs']} | {r['requests']} | "
            f"{r['seconds']:.1f}s | {r['candidates']} | {r['fit']} | {r['top_titles']} |"
        )
    print()


if __name__ == "__main__":
    main()
