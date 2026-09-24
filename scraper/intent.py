"""Intent parsing for the hunt engine (Package P4).

Converts free text (+ optional category) into structured buyer intent:
  {hunt_type, confidence, musts, prefs, filters, use, models, sizes, budget, class}
exactly conforming to the intent_json contract in docs/plan-hunt-engine.md §4.1.

Prompt follows product-core.md §8:
  hard frame (rules & schema) + soft middle (category & text) + output format at end.
Post-processing:
  - maps candidate filters to taxonomy keys from data/kleinanzeigen_taxonomy.json;
  - unmapped filters become musts;
  - never invents a budget;
  - validates hunt_type enum;
  - checks models against identity patterns;
  - fallback without model: category default hunt type table + keyword musts.
"""

import json
import logging
import os
import re
import sys

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_CURRENT_DIR)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

from intent_prompt import build_intent_prompt
from intent_taxonomy import (
    VALID_HUNT_TYPES,
    default_hunt_type_for_category,
    find_category,
    map_filters_to_taxonomy,
)

logger = logging.getLogger(__name__)


def _extract_text_numbers(text):
    """Every number the buyer typed, as German writes them.

    "7.000" is seven thousand, "7k" too, "1,5" is one and a half.
    """
    numbers = set()
    for match in re.finditer(
        r"\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:,\d+)?(?:\s*k\b)?", text.lower()
    ):
        raw = match.group(0).replace(" ", "")
        if raw.endswith("k"):
            value = float(raw[:-1].replace(",", ".")) * 1000
        elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", raw):
            value = float(raw.replace(".", ""))
        else:
            value = float(raw.replace(",", "."))
        numbers.add(int(value) if value.is_integer() else value)
    return numbers


def verify_and_sanitize_budget(budget, original_text):
    """Keeps a budget bound only if the buyer typed that number.

    Plan rule: never invent a budget. The earlier guard waved any number
    through as soon as the text said "bis" or "€" anywhere.
    """
    if not budget or not isinstance(budget, dict):
        return None
    typed = _extract_text_numbers(original_text)

    def keep(value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        number = int(number) if number.is_integer() else number
        return number if number in typed else None

    low = keep(budget.get("min")) if budget.get("min") is not None else None
    high = keep(budget.get("max")) if budget.get("max") is not None else None
    if low is None and high is None:
        return None
    return {"min": low, "max": high}


def sanitize_requirements(items):
    """Musts and prefs in the intent_json shape; anything else is dropped.

    Each needs an id, a label and a `want` object; the type falls back to text.
    """
    clean = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        rid = str(item.get("id") or "").strip()
        want = item.get("want")
        if not rid or not isinstance(want, dict) or not want:
            continue
        kind = (
            item.get("type")
            if item.get("type") in ("number", "enum", "boolean", "text")
            else "text"
        )
        clean.append(
            {
                "id": rid,
                "label": str(item.get("label") or rid).strip(),
                "type": kind,
                "want": want,
            }
        )
    return clean


def normalize_model_names(models):
    """Cleans and validates model names against identity patterns."""
    if not models or not isinstance(models, list):
        return []
    cleaned = []
    try:
        from identity import normalize_part
    except ImportError:
        normalize_part = None

    for m in models:
        if not m or not isinstance(m, str):
            continue
        s = m.strip()
        if not s:
            continue
        if normalize_part:
            part = normalize_part(s)
            if not part:
                continue
        cleaned.append(s)
    return cleaned


def fallback_intent(text, category=None):
    """Produces a deterministic intent structure without an LLM call.

    Category default hunt type table + regex keyword musts.
    """
    hunt_type = default_hunt_type_for_category(category)

    text_lower = text.lower()
    if any(
        w in text_lower
        for w in ["supersportler", "kombi", "vollautomat", "e-bike", "ebike"]
    ):
        hunt_type = "class"
    elif " oder " in text_lower or " vs " in text_lower:
        hunt_type = "shortlist"
    elif any(w in text_lower for w in ["konvolut", "restposten", "unter markt"]):
        hunt_type = "opportunity"
    elif any(w in text_lower for w in ["vintage", "mid-century", "retro", "antik"]):
        hunt_type = "taste"
    elif any(w in text_lower for w in ["zoll", "cm", "breit", "rahmenhöhe", "140x200"]):
        hunt_type = "fit"
    elif any(w in text_lower for w in ["ddr4", "ddr5", "cl16", "2x16", "75192"]):
        hunt_type = "exact"

    budget = None
    budget_match = re.search(
        r"(?:bis|unter|max\.?|<=?)\s*(\d+(?:[.,]\d+)?)\s*(?:€|euro|eur)?",
        text,
        re.IGNORECASE,
    )
    if not budget_match:
        budget_match = re.search(
            r"(\d+(?:[.,]\d+)?)\s*(?:€|euro|eur)", text, re.IGNORECASE
        )

    if budget_match:
        try:
            val = float(budget_match.group(1).replace(",", "."))
            max_val = int(val) if val.is_integer() else val
            budget = {"min": None, "max": max_val}
        except ValueError:
            budget = None

    musts = []
    dim_match = re.search(r"(\d+)\s*[x×]\s*(\d+)", text_lower)
    if dim_match:
        musts.append(
            {
                "id": "dimensions",
                "label": "Abmessungen",
                "type": "text",
                "want": {"match": f"{dim_match.group(1)}x{dim_match.group(2)}"},
            }
        )
    cm_match = re.search(r"(\d+)\s*cm", text_lower)
    if cm_match:
        musts.append(
            {
                "id": "size_cm",
                "label": "Größe (cm)",
                "type": "number",
                "want": {"max": float(cm_match.group(1))},
            }
        )
    zoll_match = re.search(r"(\d+)\s*zoll", text_lower)
    if zoll_match:
        musts.append(
            {
                "id": "screen_or_wheel_inches",
                "label": "Zoll",
                "type": "number",
                "want": {"match": float(zoll_match.group(1))},
            }
        )
    ram_match = re.search(r"(\d+)\s*gb", text_lower)
    if ram_match:
        musts.append(
            {
                "id": "capacity_gb",
                "label": "Kapazität / RAM (GB)",
                "type": "number",
                "want": {"min": float(ram_match.group(1))},
            }
        )

    sizes = {}
    if dim_match:
        sizes["dimensions"] = f"{dim_match.group(1)}x{dim_match.group(2)}"
    if cm_match:
        sizes["cm"] = float(cm_match.group(1))
    if zoll_match:
        sizes["inches"] = float(zoll_match.group(1))

    return {
        "text": text,
        "hunt_type": hunt_type,
        "confidence": 0.6,
        "class": text if hunt_type == "class" else None,
        "models": [],
        "musts": musts,
        "prefs": [],
        "filters": {},
        "use": [],
        "sizes": sizes,
        "budget": budget,
    }


def parse_intent(text, category=None, offline=False, raw_response_override=None):
    """Parses free text (+ category) into structured buyer intent.

    Args:
        text: Free-text search string.
        category: Optional category id or slug.
        offline: If True, skips model call and uses deterministic fallback.
        raw_response_override: If provided, skips model call and uses this
            raw JSON/string for testing post-processing.
    Returns:
        Structured intent_json dict.
    """
    text_clean = str(text or "").strip()
    if not text_clean:
        return fallback_intent("", category)

    cat_info = find_category(category)

    raw_json_str = None
    if raw_response_override is not None:
        raw_json_str = (
            raw_response_override
            if isinstance(raw_response_override, str)
            else json.dumps(raw_response_override)
        )
    elif offline:
        return fallback_intent(text_clean, category)
    else:
        try:
            from config import API_KEY

            if not API_KEY:
                logger.info("No API_KEY in config; falling back to offline parsing.")
                return fallback_intent(text_clean, category)

            from agent_worker import client, build_llm_kwargs, get_response_text

            sys_prompt, usr_prompt = build_intent_prompt(text_clean, cat_info)
            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": usr_prompt},
            ]
            kwargs = build_llm_kwargs(messages, max_tokens=1200, temperature=0.0)
            response = client.chat.completions.create(**kwargs)
            raw_json_str = get_response_text(response)
        except Exception as e:
            logger.warning("Intent model call failed (%s); using fallback.", e)
            return fallback_intent(text_clean, category)

    parsed = None
    if raw_json_str:
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_json_str)
        cleaned_json = json_match.group(1) if json_match else raw_json_str.strip()
        try:
            parsed = json.loads(cleaned_json)
        except Exception as err:
            logger.warning(
                "Failed to decode model JSON: %s. Response snippet: %s",
                err,
                raw_json_str[:200],
            )
            parsed = None

    if not parsed or not isinstance(parsed, dict):
        return fallback_intent(text_clean, category)

    hunt_type = parsed.get("hunt_type")
    if hunt_type not in VALID_HUNT_TYPES:
        hunt_type = default_hunt_type_for_category(category)

    confidence = parsed.get("confidence")
    try:
        confidence = float(confidence)
        confidence = max(0.0, min(1.0, confidence))
    except (TypeError, ValueError):
        # No stated confidence is no confidence: the UI asks rather than assumes.
        confidence = 0.5

    budget = verify_and_sanitize_budget(parsed.get("budget"), text_clean)

    # The category the buyer gave wins; otherwise the model's pick, if real.
    if not cat_info and parsed.get("category_id"):
        cat_info = find_category(str(parsed.get("category_id")).lstrip("c"))
    raw_filters = parsed.get("filters", {})
    mapped_filters, _unmapped = map_filters_to_taxonomy(raw_filters, cat_info)
    # Unmapped filters used to become musts ("Ram", "Display", "Price Max" next
    # to the real "32 GB RAM"): the model already states real musts as musts.
    mapped_filters.pop("preis", None)
    extra_musts = []

    search_terms = []
    for term in parsed.get("search_terms") or []:
        term = re.sub(r"\s+", " ", str(term)).strip().lower()
        if term and len(term.split()) <= 4 and term not in search_terms:
            search_terms.append(term)

    # The budget is the price filter; as a must it showed up twice.
    def not_price(req):
        return not re.search(
            r"preis|price|budget|€|euro", f"{req['id']} {req['label']}", re.I
        )

    musts = [m for m in sanitize_requirements(parsed.get("musts")) if not_price(m)]
    musts += sanitize_requirements(extra_musts)
    prefs = [p for p in sanitize_requirements(parsed.get("prefs")) if not_price(p)]

    raw_models = parsed.get("models", [])
    models = normalize_model_names(raw_models)

    use = parsed.get("use", [])
    if not isinstance(use, list):
        use = []

    sizes = parsed.get("sizes", {})
    if not isinstance(sizes, dict):
        sizes = {}

    class_val = parsed.get("class")
    if class_val is not None:
        class_val = str(class_val).strip()

    return {
        "text": text_clean,
        "hunt_type": hunt_type,
        "confidence": confidence,
        "class": class_val,
        "models": models,
        "musts": musts,
        "prefs": prefs,
        "filters": mapped_filters,
        "use": use,
        "sizes": sizes,
        "budget": budget,
        "category_id": str(cat_info.get("id")) if cat_info else None,
        "category_name": cat_info.get("name") if cat_info else None,
        "search_terms": search_terms[:3],
    }


def main():
    """CLI runner for scraper/intent.py."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Parse search query intent into structured JSON."
    )
    parser.add_argument("query", nargs="?", default="", help="Buyer query free text")
    parser.add_argument(
        "--category", "-c", default=None, help="Kleinanzeigen category ID or slug"
    )
    parser.add_argument(
        "--offline", action="store_true", help="Run offline fallback without LLM"
    )
    args = parser.parse_args()

    query_text = args.query.strip()
    if not query_text:
        if not sys.stdin.isatty():
            query_text = sys.stdin.read().strip()

    result = parse_intent(query_text, category=args.category, offline=args.offline)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
