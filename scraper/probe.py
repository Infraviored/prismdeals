"""Probe engine orchestrator: executes ladders, pre-sieves, and computes market picture.

Implements plan §5:
- Fetches rungs according to ladder builder (§5.2, §5.3)
- Measures gain, overlap, and applies stop conditions (§5.4)
- Snowballs model names into new rungs (§5.5)
- Computes market picture with budget estimates and relax signals (§5.6)
- Caches raw HTML in probe_cache and records search terms in node_terms (§5.7, §5.8)
"""

import collections
import logging
import statistics
import time

import playbooks
import probe_cache
import probe_ladder
import probe_sieve
import probe_snowball
import result_list
import scraper
import search_url

logger = logging.getLogger(__name__)


def _url_with_page(url, page):
    """The same page URL the crawler builds (`search_url.with_page`)."""
    return search_url.with_page(url, page)


def run_probe(payload, conn=None, on_rung=None, fetch_fn=None):
    """Execute a probe session for the given hunt payload.

    Args:
        payload: dict containing hunt parameters:
            - category_code: e.g. "c278"
            - filters: dict of Kleinanzeigen attribute filters
            - location_id: location ID or slug
            - radius_km: radius in km
            - price: dict with optional "min" and "max"
            - hunt_type: exact|shortlist|class|features|fit|taste|opportunity
            - musts: list of requirement dicts
            - prefs: list of preference dicts
            - seed_terms: list of search term strings
            - models: list of model strings
            - budget_steps: list of max price thresholds
            - node_key: optional key for node_terms memory
        conn: optional SQLite connection for caching and memory
        on_rung: optional callback fn(rung_record) invoked after each rung
        fetch_fn: optional custom fetch function for tests

    Returns:
        market_picture dict (plan §5.6)
    """
    category_code = payload.get("category_code")
    filters = payload.get("filters") or {}
    location_id = payload.get("location_id")
    radius_km = payload.get("radius_km")
    price = payload.get("price") or {}
    hunt_type = payload.get("hunt_type") or "features"
    musts = payload.get("musts") or []
    prefs = payload.get("prefs") or []
    seed_terms = list(payload.get("seed_terms") or [])
    models = list(payload.get("models") or [])
    budget_steps = payload.get("budget_steps") or []
    node_key = payload.get("node_key") or category_code or "general"

    do_fetch = fetch_fn or scraper.fetch

    # Step 1: Memory lookup for previously successful terms
    if conn:
        stored_terms = probe_cache.load_node_terms(conn, node_key, limit=3)
        for st in stored_terms:
            if st and st.lower() not in [t.lower() for t in seed_terms]:
                seed_terms.append(st)

    # Step 2: Build initial search ladder
    rungs = probe_ladder.build_ladder(
        hunt_type, seed_terms, musts, prefs, models, category_code, filters
    )
    rungs = list(rungs[: probe_ladder.MAX_RUNGS])

    # Step 3: Identify playbook for structured fact extraction
    playbook = (
        playbooks.playbook_for_category_code(category_code) if category_code else None
    )

    # Step 4: Execute rungs loop
    seen_card_ids = set()
    all_cards = {}
    rung_records = []
    requests_count = 0
    start_time = time.time()
    consecutive_low_gain = 0
    partial = False
    snowballed_terms = set()

    rung_idx = 0
    while rung_idx < len(rungs):
        if requests_count >= 16 or len(rung_records) >= 8:
            break

        rung = rungs[rung_idx]
        rung_idx += 1

        merged_filters = dict(filters)
        merged_filters.update(rung.get("filters") or {})
        attrs = [f"{k}:{v}" for k, v in merged_filters.items() if v]

        url = search_url.for_hunt(
            category_code=category_code,
            query=rung.get("term"),
            price=price,
            location_id=location_id,
            radius_km=radius_km,
            attributes=attrs,
        )

        # Fetch page 1
        cached1 = probe_cache.get_cached_page(conn, url) if conn else None
        if cached1:
            st1, html1 = cached1
        else:
            requests_count += 1
            try:
                res1 = do_fetch(url)
                st1, html1 = res1.status_code, res1.text
                if conn:
                    probe_cache.put_cached_page(conn, url, st1, html1)
            except Exception as exc:
                logger.warning("Failed to fetch %s: %s", url, exc)
                st1, html1 = 500, ""

        if st1 in (403, 429):
            logger.warning("Site returned HTTP %s for %s; aborting probe.", st1, url)
            partial = True
            break
        if st1 != 200:
            continue

        raw_total = result_list.total_results(html1)
        cards = list(result_list.parse(html1))
        total = raw_total if raw_total is not None else len(cards)

        # Optionally fetch page 2 if results warrant
        if total > len(cards) and len(cards) >= 20 and requests_count < 15:
            p2_url = _url_with_page(url, 2)
            cached2 = probe_cache.get_cached_page(conn, p2_url) if conn else None
            if cached2:
                st2, html2 = cached2
            else:
                requests_count += 1
                try:
                    res2 = do_fetch(p2_url)
                    st2, html2 = res2.status_code, res2.text
                    if conn:
                        probe_cache.put_cached_page(conn, p2_url, st2, html2)
                except Exception as exc:
                    logger.warning("Failed to fetch page 2 %s: %s", p2_url, exc)
                    st2, html2 = 500, ""
            if st2 == 200:
                cards.extend(list(result_list.parse(html2)))

        # Sieve and tally
        rung_card_ids = []
        rung_new_likely = 0
        rung_new_candidates = 0
        rung_likely = 0
        rung_unclear = 0
        rung_no = 0
        prices = []

        for card in cards:
            cid = card.get("id")
            if not cid:
                continue
            rung_card_ids.append(cid)
            p = card.get("price_eur")
            if p is not None:
                prices.append(p)

            if cid not in all_cards:
                if not probe_sieve.price_matches(card, price):
                    v, r = "no", ["price outside range"]
                else:
                    v, r = probe_sieve.sieve_card(card, musts, playbook)
                all_cards[cid] = {
                    "id": cid,
                    "title": card.get("title", ""),
                    "snippet": card.get("description", ""),
                    "price_eur": p,
                    "verdict": v,
                    "reasons": r,
                    "rungs": [rung.get("label")],
                }
                is_new = True
            else:
                all_cards[cid]["rungs"].append(rung.get("label"))
                is_new = False

            card_info = all_cards[cid]
            if is_new and card_info["verdict"] != "no":
                rung_new_candidates += 1
            if card_info["verdict"] == "likely":
                rung_likely += 1
                if is_new:
                    rung_new_likely += 1
            elif card_info["verdict"] == "unclear":
                rung_unclear += 1
            else:
                rung_no += 1

        sampled = len(rung_card_ids)
        new_ids_count = sum(1 for cid in rung_card_ids if cid not in seen_card_ids)
        seen_card_ids.update(rung_card_ids)

        # Gain counts new offers the sieve did not rule out. Counting only
        # "likely" stopped every exact or fit hunt after two terms: from a
        # title alone, clock, latency or width are rarely readable, so almost
        # nothing is "likely" before the detail page.
        gain = (rung_new_candidates / sampled) if sampled > 0 else 0.0
        overlap = (1.0 - (new_ids_count / sampled)) if sampled > 0 else 0.0
        likely_share = (rung_likely / sampled) if sampled > 0 else 0.0

        drop = False
        if sampled > 0 and gain < 0.10 and overlap > 0.8:
            drop = True
        # "Too wide" is about offers that are clearly something else, not about
        # musts a title cannot show ("Für Innenraum geeignet"): measured on the
        # share not ruled out, it dropped "ventilator" for a fan hunt.
        open_share = ((rung_likely + rung_unclear) / sampled) if sampled > 0 else 0.0
        if (
            total > 2000
            and open_share < 0.02
            and hunt_type not in ("opportunity", "taste")
        ):
            drop = True
        if rung.get("net") and sampled > 0:
            drop = False

        rung_record = {
            "term": rung.get("term"),
            "label": rung.get("label"),
            "source": rung.get("source"),
            "total": total,
            "sampled": sampled,
            "likely": rung_likely,
            "unclear": rung_unclear,
            "no": rung_no,
            "new_likely": rung_new_likely,
            "gain": round(gain, 3),
            "overlap": round(overlap, 3),
            "likely_share": round(likely_share, 3),
            # A term that found nothing is never kept: saved, it became a
            # search that crawls empty pages forever ("yamaha-r1-rn19").
            "kept": not drop and sampled > 0,
            "prices": prices,
        }
        rung_records.append(rung_record)

        if on_rung:
            try:
                on_rung(rung_record)
            except Exception as exc:
                logger.warning("on_rung callback error: %s", exc)

        # Stop logic
        # A term that finds nothing says nothing about saturation; only rungs
        # that found offers without adding fitting ones count toward stopping.
        # Named models are what the buyer asked for; each gets its search
        # however little the one before added.
        named = hunt_type in ("shortlist", "class") and rung.get("source") == "ladder"
        if sampled and gain < 0.05 and not named:
            consecutive_low_gain += 1
        elif sampled:
            consecutive_low_gain = 0
        if consecutive_low_gain >= 2:
            break

        # Snowball models
        if (
            hunt_type in ("features", "class", "shortlist")
            and len(rungs) < probe_ladder.MAX_RUNGS
        ):
            likely_titles = [
                c["title"] for c in all_cards.values() if c["verdict"] == "likely"
            ]
            extracted = probe_snowball.extract_models_from_titles(
                likely_titles, category_code=category_code
            )
            for model_name in extracted:
                if len(rungs) >= probe_ladder.MAX_RUNGS:
                    break
                if model_name.lower() in snowballed_terms:
                    continue
                if any(
                    (r.get("term") or "").lower() == model_name.lower() for r in rungs
                ):
                    continue
                snowballed_terms.add(model_name.lower())
                rungs.append(
                    {
                        "term": model_name,
                        "label": f"snowball: {model_name}",
                        "source": "snowball",
                        "filters": filters or {},
                    }
                )

    # Step 5: Market picture compilation
    chosen_terms = [r["term"] for r in rung_records if r["kept"] and r.get("term")]
    sample_likely = [c for c in all_cards.values() if c["verdict"] == "likely"]
    sample_unclear = [c for c in all_cards.values() if c["verdict"] == "unclear"]
    sample_all = list(all_cards.values())

    likely_prices = [
        c["price_eur"] for c in sample_likely if c["price_eur"] is not None
    ]
    # Before detail pages, an exact or fit hunt has almost nothing "likely";
    # the market's price then comes from what was not ruled out.
    open_prices = [
        c["price_eur"]
        for c in sample_likely + sample_unclear
        if c["price_eur"] is not None
    ]
    median_price = (
        int(statistics.median(likely_prices))
        if likely_prices
        else (int(statistics.median(open_prices)) if open_prices else None)
    )

    # The rungs overlap, so their totals do not add up: summing them counted
    # the same offer once per search term that found it. The widest single
    # rung's likely share times its total is a floor for the union, and the
    # sample itself is another.
    rung_floors = [
        round(r["likely_share"] * r["total"])
        for r in rung_records
        if r["kept"] and r["sampled"]
    ]
    union_likely_est = max([len(sample_likely)] + rung_floors)
    unclear_share = len(sample_unclear) / max(1, len(sample_all))
    union_unclear_est = max(
        len(sample_unclear),
        max(
            [
                round(unclear_share * r["total"])
                for r in rung_records
                if r["kept"] and r["sampled"]
            ]
            or [0]
        ),
    )
    # Sample counts scale to the estimate by this factor.
    scale = union_likely_est / len(sample_likely) if sample_likely else 1.0

    # Budget steps estimation
    if not budget_steps:
        p_max = price.get("max") or (max(likely_prices) if likely_prices else 1000)
        budget_steps = [int(p_max * 0.5), int(p_max * 0.8), int(p_max)]
    budget_list = []
    for step in sorted(set(budget_steps)):
        count = sum(
            1
            for c in sample_likely
            if c["price_eur"] is not None and c["price_eur"] <= step
        )
        est_count = min(union_likely_est, round(count * scale))
        unclear_under = sum(
            1
            for c in sample_unclear
            if c["price_eur"] is not None and c["price_eur"] <= step
        )
        unclear_scale = (
            union_unclear_est / len(sample_unclear) if sample_unclear else 1.0
        )
        budget_list.append(
            {
                "max": step,
                "likely": est_count,
                # Not ruled out by title and snippet; the detail page decides.
                "unclear": min(union_unclear_est, round(unclear_under * unclear_scale)),
            }
        )

    # Relax requirements signals (only if absence changes count >= 2x)
    relax_list = []
    base_likely_count = len(sample_likely)
    if base_likely_count > 0 and len(musts) > 0:
        for must in musts:
            rem_musts = [m for m in musts if m is not must]
            relaxed_likely = 0
            for card in sample_all:
                if not probe_sieve.price_matches(card, price):
                    continue
                v, _ = probe_sieve.sieve_card(card, rem_musts, playbook)
                if v == "likely":
                    relaxed_likely += 1
            if relaxed_likely >= 2 * base_likely_count:
                est_relaxed = round(relaxed_likely * scale)
                relax_list.append(
                    {
                        "must": must.get("id") or must.get("label"),
                        "label": must.get("label") or must.get("id"),
                        "likely_without": est_relaxed,
                    }
                )

    # Models seen summary
    models_counter = collections.defaultdict(list)
    for c in sample_likely:
        extracted = probe_snowball.extract_models_from_titles(
            [c["title"]], category_code=category_code, min_repeats=1
        )
        m_name = extracted[0] if extracted else None
        if m_name:
            models_counter[m_name].append(c["price_eur"])
    models_seen = []
    for name, p_list in models_counter.items():
        valid_p = [p for p in p_list if p is not None]
        med = int(statistics.median(valid_p)) if valid_p else None
        models_seen.append({"name": name, "count": len(p_list), "median": med})
    models_seen.sort(key=lambda x: x["count"], reverse=True)
    models_seen = models_seen[:10]

    elapsed_seconds = round(time.time() - start_time, 2)

    # Step 6: Memory persistence for kept terms
    if conn:
        for r in rung_records:
            if r["kept"] and r.get("term"):
                probe_cache.save_node_term(
                    conn,
                    node_key,
                    r["term"],
                    category_code,
                    r["total"],
                    r["likely_share"],
                )

    return {
        "rungs": rung_records,
        "chosen_terms": chosen_terms,
        "estimate": {
            "union_likely": union_likely_est,
            "union_unclear": union_unclear_est,
            "median_price": median_price,
        },
        "per_budget": budget_list,
        "relax": relax_list,
        "models_seen": models_seen,
        "requests": requests_count,
        "seconds": elapsed_seconds,
        "partial": partial,
    }
