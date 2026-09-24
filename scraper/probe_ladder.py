"""Ladder builder: per hunt type, the search rungs to probe.

Each hunt type produces a sequence of rungs — search terms to try on
Kleinanzeigen — ordered from broad to narrow. The probe engine fetches pages
1–2 of each rung and measures gain/overlap to decide which terms to keep.

A rung is a dict:
    { term: str|None, filters: dict, label: str, source: str }

`term` is the search query slug (None = category-only search).
`filters` are Kleinanzeigen attribute filters to append to the URL.
`label` is a human-readable description of what this rung tests.
`source` names where the rung came from (ladder, snowball, user).
"""

import re
import logging

logger = logging.getLogger(__name__)

MAX_RUNGS = 8


def build_ladder(
    hunt_type, seed_terms, musts, prefs, models, category_code, filters=None
):
    """Returns the initial list of rungs for the given hunt type.

    The caller may append snowballed model rungs later (up to MAX_RUNGS total).
    """
    builders = {
        "exact": _exact_ladder,
        "shortlist": _shortlist_ladder,
        "class": _class_ladder,
        "features": _features_ladder,
        "fit": _fit_ladder,
        "taste": _taste_ladder,
        "opportunity": _opportunity_ladder,
    }
    builder = builders.get(hunt_type, _features_ladder)
    rungs = builder(seed_terms, musts, prefs, models, category_code, filters)
    return rungs[:MAX_RUNGS]


def _make_rung(term, label, source="ladder", filters=None):
    return {
        "term": term,
        "filters": filters or {},
        "label": label,
        "source": source,
    }


def _exact_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Exact hunt: seed name → broadened name → line + capacity."""
    rungs = []
    for term in seed_terms:
        rungs.append(_make_rung(term, f"exact: {term}"))
        # Broaden: drop revision/speed suffixes (e.g. "CL16" from RAM)
        broad = _broaden_exact(term)
        if broad and broad != term.lower():
            rungs.append(_make_rung(broad, f"broadened: {broad}"))
    if not rungs and models:
        for model in models[:3]:
            rungs.append(_make_rung(model, f"model: {model}"))
    return rungs


def _broaden_exact(term):
    """Drop trailing spec tokens like CL16, 3200MHz, Rev.2 etc."""
    # Remove tokens that look like clock speeds, latencies, revisions
    broad = re.sub(
        r"\b(cl\d+|rev\.?\d+|\d+\s*mhz|\d+\s*mt/s)\b", "", term, flags=re.I
    ).strip()
    broad = re.sub(r"\s+", " ", broad).strip()
    return broad.lower() if broad else None


def _shortlist_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Shortlist: one rung per model + spelling variants."""
    rungs = []
    for model in models:
        rungs.append(_make_rung(model, f"model: {model}"))
        # Add common spelling variants (no spaces, with spaces)
        compact = re.sub(r"\s+", "", model)
        if compact.lower() != model.lower():
            rungs.append(_make_rung(compact, f"variant: {compact}"))
    # Also try seed terms if they differ from models
    for term in seed_terms:
        if not any(term.lower() == m.lower() for m in models):
            rungs.append(_make_rung(term, f"seed: {term}"))
    return rungs


def _class_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Class: net term for the class + one per proposed model."""
    rungs = []
    for term in seed_terms:
        rungs.append(_make_rung(term, f"class: {term}"))
    for model in models:
        rungs.append(_make_rung(model, f"proposed: {model}"))
    return rungs


def _features_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Features: category only → strong must keywords → pairs → snowball.

    Strong keywords are musts whose label/id is likely in listing titles:
    "oled", "32gb", "rtx", etc.
    """
    rungs = []
    # Rung 0: category only (no term, just filters)
    if filters:
        rungs.append(_make_rung(None, "category + filters", filters=filters))

    # Rung 1+: seed terms (user-supplied)
    for term in seed_terms:
        rungs.append(_make_rung(term, f"seed: {term}"))

    # Strong must keywords: musts whose label contains a searchable token
    strong = _strong_keywords(musts)
    for kw in strong[:3]:
        rungs.append(_make_rung(kw, f"must keyword: {kw}"))

    # Pairs of strong keywords
    if len(strong) >= 2:
        pair = f"{strong[0]} {strong[1]}"
        rungs.append(_make_rung(pair, f"must pair: {pair}"))

    # Known models get their own rungs (snowball will add more later)
    for model in models[:2]:
        rungs.append(_make_rung(model, f"model: {model}"))

    return rungs


def _strong_keywords(musts):
    """Extract searchable keywords from must labels/ids.

    A "strong" keyword is one sellers are likely to put in titles:
    specs like "oled", "32gb", "ddr5", size tokens like "140x200".
    """
    keywords = []
    for must in musts:
        label = must.get("label", "")
        want = must.get("want", {})

        # If the must has a specific value, use it
        if "oneOf" in want:
            for val in want["oneOf"]:
                token = str(val).strip()
                if token and len(token) >= 2:
                    keywords.append(token.lower())
        elif "match" in want and want["match"]:
            token = label.strip()
            if token and len(token) >= 2:
                keywords.append(token.lower())
        elif "min" in want or "max" in want:
            # Numeric must: use the label as keyword if it's short enough
            # e.g. "32 GB" → "32gb"
            combined = label.strip()
            if want.get("min"):
                combined = f"{want['min']}{_guess_unit(label)}"
            if combined and len(combined) <= 10:
                keywords.append(combined.lower().replace(" ", ""))
    return keywords


def _guess_unit(label):
    """Extract the unit from a label like 'RAM (GB)' → 'gb'."""
    match = re.search(r"\((\w+)\)", label)
    if match:
        return match.group(1).lower()
    # Common units at the end of a label
    for unit in ("gb", "tb", "zoll", "cm", "kg", "mhz"):
        if label.lower().endswith(unit):
            return unit
    return ""


def _fit_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Fit: item type → item type + size (if sellers put sizes in titles)."""
    rungs = []
    for term in seed_terms:
        rungs.append(_make_rung(term, f"item: {term}"))

    # Try adding size tokens from musts
    size_tokens = []
    for must in musts:
        want = must.get("want", {})
        label = must.get("label", "")
        # Size-like musts: dimensions, measurements
        if any(u in label.lower() for u in ("cm", "mm", "x", "×", "breit", "hoch")):
            if "min" in want and "max" in want and want["min"] == want["max"]:
                size_tokens.append(str(want["min"]))
            elif "max" in want:
                size_tokens.append(str(want["max"]))

    for term in seed_terms:
        for size in size_tokens[:2]:
            combined = f"{term} {size}"
            rungs.append(_make_rung(combined, f"item+size: {combined}"))

    return rungs


def _taste_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Taste: each style word alone."""
    rungs = []
    for term in seed_terms:
        rungs.append(_make_rung(term, f"style: {term}"))
    return rungs


def _opportunity_ladder(seed_terms, musts, prefs, models, category_code, filters):
    """Opportunity: category only, no term."""
    rungs = [_make_rung(None, "category only (opportunity)")]
    for term in seed_terms:
        rungs.append(_make_rung(term, f"seed: {term}"))
    return rungs
