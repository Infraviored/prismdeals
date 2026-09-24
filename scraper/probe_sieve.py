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
import re

logger = logging.getLogger(__name__)

UNITS = r"gb|tb|zoll|cm|mm|kg|mhz|kw|ps|ccm|l|km|w"
# Words in a must's label that say nothing about the thing itself.
_FILLER = {
    "mit",
    "ohne",
    "und",
    "oder",
    "über",
    "ueber",
    "unter",
    "als",
    "mehr",
    "höher",
    "hoeher",
    "mindestens",
    "höchstens",
    "hoechstens",
    "besser",
    "max",
    "min",
    "ab",
    "bis",
    "display",
    "anzeige",
    "full",
    "hd",
}


def label_words(label):
    """The words of a label worth finding in a title: "OLED-Display" -> ["oled"]."""
    words = re.findall(r"[a-zäöüß0-9]+", str(label).lower())
    return [
        w
        for w in words
        if len(w) >= 3
        and not w.isdigit()
        and w not in _FILLER
        and not re.fullmatch(UNITS, w)
    ]


def unit_of(label):
    match = re.search(rf"\b({UNITS})\b", str(label).lower())
    return match.group(1) if match else None


def read_number(text, label):
    """A number with the label's unit near one of its words, or None.

    "32 GB RAM" in "Zenbook 14 OLED 32GB RAM 1TB" reads 32; the 1TB of the SSD
    is not near "ram". Without a word to anchor on, the first number with the
    unit counts ("Breite 120 cm").
    """
    unit = unit_of(label)
    if not unit:
        return None
    hits = [
        (m.start(), float(m.group(1).replace(",", ".")))
        for m in re.finditer(rf"(\d+(?:[.,]\d+)?)\s*{unit}\b", text)
    ]
    if not hits:
        return None
    anchors = [
        m.start() for w in label_words(label) for m in re.finditer(re.escape(w), text)
    ]
    if not anchors:
        return hits[0][1]
    near = [v for pos, v in hits if any(abs(pos - a) <= 16 for a in anchors)]
    return near[0] if near else None


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

    # Musts the category's playbook knows go through its patterns; musts the
    # buyer or the intent model named ("ram", "display_oled") go through the
    # keyword reading. Before, a playbook took all musts and matched none of
    # the ad-hoc ones, so no laptop was ever "likely".
    known = {f.get("id") for f in (playbook or {}).get("fields", [])}
    by_playbook = [m for m in musts if m.get("id") in known]
    by_keywords = [m for m in musts if m.get("id") not in known]
    verdicts = []
    if by_playbook:
        verdicts.append(_sieve_with_playbook(title, snippet, by_playbook, playbook))
    if by_keywords:
        verdicts.append(_sieve_keywords(text, by_keywords))
    for verdict, reasons in verdicts:
        if verdict == "no":
            return verdict, reasons
    if all(verdict == "likely" for verdict, _ in verdicts):
        return "likely", []
    return "unclear", []


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

        # A width or a capacity is often not in a title. Unread, it leaves
        # the card unclear -- counting it as met made every wardrobe "likely".
        # Read and outside the range, the card is out.
        if "min" in want or "max" in want:
            total_checkable += 1
            value = read_number(text, must.get("label") or "")
            if value is None:
                continue
            low, high = want.get("min"), want.get("max")
            if (isinstance(low, (int, float)) and value < low) or (
                isinstance(high, (int, float)) and value > high
            ):
                reasons.append(f"{must.get('label')}: {value:g}")
                return "no", reasons
            likely_count += 1
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

        if want.get("present") is True:
            words = label_words(label)
            if words and any(w in text for w in words):
                likely_count += 1
            continue
        if "match" in want:
            if want["match"] and label:
                if label in text or any(w in text for w in label_words(label)):
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
