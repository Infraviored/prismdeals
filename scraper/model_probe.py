"""Asking the market about each proposed model (plan §8).

A small model proposes models for a class ("1000cc supersport"). Whether a
model exists on this market, and at what price, is not the model's to say:
one result page per proposal answers it. A proposal whose name never shows up
in listing titles is how an invented model gives itself away
(`model_proposals.apply_hallucination_guard`).
"""

import re
import statistics

import result_list
import scraper
import search_url

# Words a model name shares with half the market; matching on them would count
# every Yamaha as an R1.
_GENERIC = {
    "yamaha",
    "honda",
    "suzuki",
    "kawasaki",
    "bmw",
    "ducati",
    "ktm",
    "aprilia",
    "fireblade",
    "ninja",
    "gsx",
    "modell",
    "model",
}


def _compact(text):
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def title_tokens(model):
    """The parts of a model name that identify it in a title.

    "Yamaha YZF-R1" -> ["yzfr1", "r1"]; "Honda CBR1000RR Fireblade" -> ["cbr1000rr"].
    A title matches when any token appears in it with spaces and dashes removed.
    """
    words = [w for w in re.split(r"[\s/]+", str(model).lower()) if w]
    tokens = []
    for word in words:
        compact = _compact(word)
        if not compact or compact in _GENERIC:
            continue
        if not re.search(r"\d", compact) and len(compact) < 4:
            continue
        tokens.append(compact)
        # "yzf-r1" is written "r1" as often as "yzf-r1".
        if "-" in word:
            tail = _compact(word.split("-")[-1])
            if tail and re.search(r"\d", tail) and tail not in tokens:
                tokens.append(tail)
    return tokens


def title_matches(title, tokens):
    compact = _compact(title)
    return any(token in compact for token in tokens)


def probe_models(models, base, fetch_fn=None):
    """One result page per model: {model: {total, title_hits, median}}.

    `base` carries the hunt's frame: category_code ("c305"), price {min, max},
    location_id, radius_km. Requests go through `scraper.fetch`, which waits
    on the shared one-per-second limiter.
    """
    fetch = fetch_fn or scraper.fetch
    price = base.get("price") or {}
    category = str(base.get("category_code") or "").lstrip("c") or None
    results = {}
    for model in models:
        url = search_url.compose_search_url(
            location_id=base.get("location_id"),
            radius=base.get("radius_km"),
            min_price=price.get("min"),
            max_price=price.get("max"),
            query=model,
            category=category,
            attributes=[],
        )
        try:
            response = fetch(url)
        except Exception:  # noqa: BLE001 -- one failed model must not sink the rest
            continue
        if response.status_code in (403, 429):
            break
        if response.status_code != 200:
            continue
        cards = list(result_list.parse(response.text))
        total = result_list.total_results(response.text)
        tokens = title_tokens(model)
        hits = [
            c for c in cards if tokens and title_matches(c.get("title", ""), tokens)
        ]
        prices = [c["price_eur"] for c in hits if c.get("price_eur")]
        results[model] = {
            "total": total if total is not None else len(cards),
            "title_hits": len(hits),
            "median": int(statistics.median(prices)) if prices else None,
        }
    return results
