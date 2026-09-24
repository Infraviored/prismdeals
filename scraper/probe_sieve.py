"""Pre-sieve: quick title+snippet check against buyer requirements.

Before any model call, the probe reads each card's title and snippet and
decides whether the listing is likely to fit, unclear, or clearly not. This
uses two paths:

1. Known playbooks: `text_facts.read_stated` extracts typed facts from the
   title, and `text_facts.contradicts` checks each against the buyer's musts.
2. Ad-hoc musts (no playbook): simple keyword matching on the title+snippet.

The sieve is deliberately generous: "unclear" is the default, and only a
stated contradiction or a missing required keyword produces "no".
"""

import logging

logger = logging.getLogger(__name__)


def sieve_card(card, musts, playbook=None):
    """Classify a single card as 'likely', 'unclear', or 'no'.

    Args:
        card: dict with at least 'title' and 'description' (snippet).
        musts: list of must dicts from the hunt intent.
        playbook: optional playbook for text_facts extraction.

    Returns:
        (verdict, reasons): verdict is 'likely'|'unclear'|'no',
        reasons is a list of human-readable strings.
    """
    title = (card.get("title") or "").strip()
    snippet = (card.get("description") or "").strip()
    text = f"{title} {snippet}".lower()

    if not title:
        return "unclear", ["no title"]

    if not musts:
        return "likely", []

    # Path 1: playbook-based extraction
    if playbook:
        return _sieve_with_playbook(title, snippet, musts, playbook)

    # Path 2: keyword matching for ad-hoc musts
    return _sieve_keywords(text, musts)


def _sieve_with_playbook(title, snippet, musts, playbook):
    """Use text_facts to extract and check against playbook fields."""
    try:
        import text_facts

        combined = f"{title}\n{snippet}"
        stated = text_facts.read_stated(playbook, combined)

        reasons = []
        has_miss = False
        all_found = True

        text_lower = combined.lower()
        for must in musts:
            fid = must.get("id")
            want = must.get("want", {})
            value = stated.get(fid)

            if value is None:
                label = (must.get("label") or fid or "").lower()
                clean_label = label.replace(" ", "")
                found = False
                if label and (
                    label in text_lower or clean_label in text_lower.replace(" ", "")
                ):
                    found = True
                elif "oneOf" in want and any(
                    str(v).lower() in text_lower for v in want["oneOf"]
                ):
                    found = True
                elif (
                    "match" in want
                    and isinstance(want["match"], str)
                    and want["match"].lower() in text_lower
                ):
                    found = True
                if not found:
                    all_found = False
                continue

            if text_facts.contradicts(want, value):
                label = must.get("label", fid)
                reasons.append(f"{label}: {value}")
                has_miss = True

        if has_miss:
            return "no", reasons
        if all_found:
            return "likely", []
        return "unclear", []

    except Exception as exc:
        logger.debug("Playbook sieve failed, falling back to keywords: %s", exc)
        text = f"{title} {snippet}".lower()
        return _sieve_keywords(text, musts)


def _sieve_keywords(text, musts):
    """Keyword-based sieve for ad-hoc musts without a playbook.

    Checks whether the title+snippet contains keywords derived from each must.
    A must with type 'boolean' and want.match=True checks for the label.
    A must with want.oneOf checks for any of the values.
    Numeric musts are skipped (can't reliably check from title alone).
    """
    reasons = []
    likely_count = 0
    total_checkable = 0

    for must in musts:
        label = (must.get("label") or "").lower()
        want = must.get("want", {})
        must_type = must.get("type", "text")

        # Skip numeric range musts — not reliably in titles
        if must_type == "number" and ("min" in want or "max" in want):
            continue

        total_checkable += 1

        if "oneOf" in want:
            values = [str(v).lower() for v in want["oneOf"]]
            if any(v in text for v in values):
                likely_count += 1
            continue

        if (
            "min" in want
            and isinstance(want["min"], str)
            and want["min"].lower() in text
        ):
            likely_count += 1
            continue

        if "match" in want:
            if want["match"] and label:
                if label in text:
                    likely_count += 1
                # Absent boolean is unclear, not rejection
            elif not want["match"] and label:
                if label in text:
                    reasons.append(f"has {label}")
                    return "no", reasons
                likely_count += 1
            continue

        if "excluded" in want:
            excluded = [str(v).lower() for v in want["excluded"]]
            if any(v in text for v in excluded):
                reasons.append(f"excluded: {excluded[0]}")
                return "no", reasons
            likely_count += 1
            continue

        # For text/present musts, check if the label keyword is present
        if label and len(label) >= 3:
            if label in text:
                likely_count += 1

    if reasons:
        return "no", reasons
    if total_checkable > 0 and likely_count == total_checkable:
        return "likely", []
    if likely_count > 0:
        return "unclear", []
    if total_checkable == 0:
        return "likely", []
    return "unclear", []


def price_matches(card, price_range):
    """Check if a card's price falls within the given range.

    Args:
        card: dict with 'price_eur'.
        price_range: dict with optional 'min' and 'max'.

    Returns True if the price is within range or unknown.
    """
    price = card.get("price_eur")
    if price is None:
        return True  # Unknown price is not a rejection
    if price_range.get("max") is not None and price > price_range["max"]:
        return False
    if price_range.get("min") is not None and price < price_range["min"]:
        return False
    return True
