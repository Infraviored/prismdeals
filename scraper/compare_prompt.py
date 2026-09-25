"""Comparative judging prompt and LLM call (§9.2).

Hard frame at the top and bottom of the prompt (code-controlled), soft middle
(data-driven listings and intent).  Output is JSON lines: one object per
listing ID.  Quote validator: every fact quote must occur in the listing text,
else the fact is dropped.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)


def build_compare_prompt(
    candidates: list[dict],
    conditions: list[dict],
    node_knowledge: str = "",
) -> str:
    """Builds the comparative judging prompt.

    Structure: hard frame · soft middle (intent + knowledge + listings) · output format.
    """
    parts = []

    # --- Hard frame (top) ---
    parts.append(
        "You are a used-goods analyst comparing listings side by side for a buyer.\n"
        "Your job: rank the candidates, state which requirements each meets or misses,\n"
        "extract key facts with exact quotes, and suggest seller questions.\n\n"
        "RULES:\n"
        "- Every fact you state MUST include a direct quote from the listing text.\n"
        "- If a requirement cannot be verified from the listing text, mark it 'unstated'.\n"
        "- Key musts and facts by the requirement id in square brackets. A must marked\n"
        "  'met' or 'violated' needs a fact under the same id with its quote.\n"
        "- Rank by the quality of the offer, NOT by price: how certain the requirements\n"
        "  are, condition, completeness, how trustworthy the listing reads. Price is\n"
        "  weighed by code elsewhere; do not mention it in the reason.\n"
        "- Be concise: reason is at most 20 words.\n"
        "- Never ask the seller for something the listing already states.\n"
        "- Write reason, checks and seller_questions in German: the buyer reads them\n"
        "  in a German app and sends the questions to German sellers.\n"
        "- Say 'all requirements met' only if every requirement is 'met'.\n"
        "- Plain German a buyer understands: no ids, no English words, no jargon.\n"
        "- Output ONLY the JSON lines block at the end. No other text.\n"
    )

    # --- Soft middle: buyer intent ---
    parts.append("## Buyer's requirements\n")
    if conditions:
        for c in conditions:
            importance = "must" if c.get("importance") == "must" else "wish"
            # The id is what the output keys musts and facts by.
            parts.append(f"- [{c['id']}] {c['text']} ({importance})")
    else:
        parts.append("- No specific requirements stated.")
    parts.append("")

    # --- Soft middle: node knowledge (P7) ---
    if node_knowledge:
        parts.append(f"## Product knowledge\n{node_knowledge}\n")

    # --- Soft middle: candidate listings ---
    parts.append(f"## Candidates ({len(candidates)} listings)\n")
    for c in candidates:
        lid = c["id"]
        title = c.get("title", "")
        price = c.get("price_eur")
        location = c.get("location", "")
        condition = ""
        details = c.get("details") or {}
        if isinstance(details, dict):
            condition = details.get("Zustand", "")

        # What the listing's own words already settled, by requirement.
        states = c.get("states") or {}
        facts_str = (
            " | Read: " + ", ".join(f"[{k}] {v}" for k, v in states.items())
            if states
            else ""
        )

        desc = c.get("detailed_description") or c.get("short_description") or ""
        # Cap description to first 600 chars as specified in §9.2
        if len(desc) > 600:
            desc = desc[:600] + "…"

        price_str = f"{price} €" if price is not None else "VB"
        # Each offer's own usual price: a flagship and an entry model in one
        # hunt have no common median.
        if c.get("usual_price"):
            price_str += f" (usual for this product: {round(c['usual_price'])} €)"
        parts.append(f"### [{lid}] {title}")
        # The page's own attributes (registration, mileage, power ...): without
        # them the comparison asked sellers for a mileage the page states.
        attrs = ""
        if isinstance(details, dict):
            shown = [f"{k}: {v}" for k, v in details.items() if k != "Zustand" and v]
            if shown:
                attrs = " | " + "; ".join(shown[:10])
        parts.append(
            f"Price: {price_str} | Location: {location} | Condition: {condition}{facts_str}{attrs}"
        )
        if desc:
            parts.append(f"Description: {desc}")
        parts.append("")

    # --- Hard frame (bottom): output format ---
    parts.append(
        "## Output format\n\n"
        "Output one JSON object per line (JSON Lines), one per listing ID.\n"
        "Each object must have exactly these fields:\n"
        "```\n"
        '{"id": "<listing_id>", "rank": <int>, '
        '"reason": "<max 20 words>", '
        '"musts": {"<requirement_id>": "met|violated|unstated|retrofittable"}, '
        '"facts": {"<field>": {"value": "<value>", "quote": "<exact quote from text>"}}, '
        '"checks": ["<thing to verify on site>"], '
        '"seller_questions": ["<question to ask the seller>"], '
        '"same_as": ["<listing_id of similar listing>"]}\n'
        "```\n\n"
        "Output the JSON lines block now, starting with the best-ranked listing.\n"
        "No other text before or after."
    )

    return "\n".join(parts)


def _strings(value) -> list[str]:
    return (
        [str(v) for v in value if isinstance(v, (str, int, float))]
        if isinstance(value, list)
        else []
    )


def _rank(value, fallback: int) -> int:
    """The rank as a number: "1" and 1.0 are rank 1, anything else the next."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _objects(text: str):
    """The rank objects in a reply: JSON lines, or one indented JSON array.

    Asked for JSON lines, a model now and then answers with a pretty-printed
    array; read line by line, every line failed and every listing fell to the
    bottom with no reason.
    """
    try:
        whole = json.loads(text)
    except json.JSONDecodeError:
        whole = None
    if isinstance(whole, list):
        return whole
    if isinstance(whole, dict):
        if "id" in whole:  # one listing, one line
            return [whole]
        # {"rankings": [...]}: the array under whatever name the model chose
        return next((v for v in whole.values() if isinstance(v, list)), [])

    objects = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("#"):
            continue
        # Remove trailing comma (common model mistake)
        if line.endswith(","):
            line = line[:-1]
        try:
            objects.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning("Skipping unparseable compare line: %.100s", line)
    return objects


def parse_compare_response(
    response_text: str,
    candidates: list[dict],
) -> list[dict]:
    """Parses JSON-lines output from the comparative call.

    Returns a list of rank entries, one per listing.  Tolerates markdown
    fences, trailing commas, and partial output.
    """
    # Strip markdown code fences if present
    text = response_text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    # Build a lookup of candidate texts for quote validation
    text_by_id: dict[str, str] = {}
    for c in candidates:
        full = "\n".join(
            filter(
                None,
                [
                    c.get("title", ""),
                    c.get("detailed_description", ""),
                    c.get("short_description", ""),
                ],
            )
        )
        text_by_id[str(c["id"])] = full

    results = []
    seen = set()
    for obj in _objects(text):
        if not isinstance(obj, dict) or "id" not in obj:
            continue

        lid = str(obj["id"])
        # A listing the call was not shown is invented; one named twice keeps
        # its first place. Either would push real listings down a rank.
        if lid not in text_by_id or lid in seen:
            logger.warning("Dropped compare line for unknown or repeated id %s", lid)
            continue
        seen.add(lid)

        # Validate quotes: every fact quote must appear in listing text
        listing_text = text_by_id.get(lid, "")
        facts = obj.get("facts") if isinstance(obj.get("facts"), dict) else {}
        validated_facts = {}
        for field, entry in facts.items():
            if not isinstance(entry, dict):
                continue
            quote = entry.get("quote", "")
            if not isinstance(quote, str):
                quote = str(quote) if isinstance(quote, (int, float)) else ""
            if quote and quote.lower() in listing_text.lower():
                validated_facts[field] = entry
            elif quote:
                logger.info(
                    "Dropped fact %s for listing %s: quote not found in text",
                    field,
                    lid,
                )
            # No quote = no fact (per §9.2 rules)

        # A met or violated must counts only with a quoted fact under the same
        # id. A bare "met" would otherwise lift the gate on the model's word.
        musts = {}
        raw_musts = obj.get("musts") if isinstance(obj.get("musts"), dict) else {}
        for must_id, state in raw_musts.items():
            state = str(state)
            if state in ("met", "violated") and must_id not in validated_facts:
                state = "unstated"
            musts[str(must_id)] = state

        results.append(
            {
                "id": lid,
                "rank": _rank(obj.get("rank"), len(results) + 1),
                "reason": str(obj.get("reason", ""))[:100],
                "musts": musts,
                "facts": validated_facts,
                "checks": _strings(obj.get("checks")),
                "seller_questions": _strings(obj.get("seller_questions")),
                "same_as": [
                    str(v)
                    for v in obj.get("same_as") or []
                    if isinstance(v, (str, int))
                ]
                if isinstance(obj.get("same_as"), list)
                else [],
            }
        )

    return results
