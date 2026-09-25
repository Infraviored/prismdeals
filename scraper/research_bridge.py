"""Research bridge: three prompts that connect the buyer to web-search AI.

product-core.md section 8.  Each prompt uses the structure:
hard frame (code) + soft middle (data/small model) + fixed format at the end.

1. BRIEF_PROMPT: small model decides whether research is worth it, writes
   "Was zu wissen ist" + the research brief.  May answer "nicht nötig".
2. SEARCH_BRIEF: the brief the buyer copies into their web-search AI.
   Fixed German headings per profile.
3. CLASSIFY_PROMPT: small model splits a pasted answer into claims, keeps
   links, marks unsourced.
"""

import json
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt 1: Should we research?  What should we know?
# ---------------------------------------------------------------------------


def build_brief_prompt(intent, profile, market, existing_claims):
    """Build the "should we research?" prompt for the small model.

    Hard frame at the top, soft middle with context, fixed output format.
    """
    parts = []

    # --- Hard frame (top) ---
    parts.append(
        "Du bist ein Kaufberater für Gebrauchtware.\n"
        "Entscheide, ob für diese Suche Hintergrundwissen lohnt.\n\n"
        "REGELN:\n"
        "- Antworte NUR im vorgegebenen Format.\n"
        "- Wenn kein Wissen nötig ist, antworte mit ENTSCHEIDUNG: nicht nötig.\n"
        "- Schreibe auf Deutsch.\n"
        "- Maximal 6 Zeilen für WAS ZU WISSEN IST.\n"
    )

    # --- Soft middle: context ---
    parts.append("\n## Suchabsicht\n")
    if isinstance(intent, dict):
        text = intent.get("text", "")
        musts = intent.get("musts", [])
        use = intent.get("use", [])
        parts.append(f"Freitext: {text}")
        if musts:
            parts.append(
                "Anforderungen: "
                + ", ".join(
                    m.get("label", m.get("id", ""))
                    for m in musts
                    if isinstance(m, dict)
                )
            )
        if use:
            parts.append("Einsatz: " + ", ".join(str(u) for u in use))
    else:
        parts.append(f"Freitext: {intent}")

    if profile:
        label = getattr(profile, "label", str(profile))
        parts.append(f"\n## Profil: {label}")
        hidden = getattr(profile, "hidden", 0)
        model_dep = getattr(profile, "model_dependent", False)
        parts.append(
            f"Verstecktes Risiko: {hidden}/3, "
            f"modellabhängig: {'ja' if model_dep else 'nein'}"
        )

    if market:
        median = market.get("median")
        count = market.get("count")
        if median:
            parts.append(f"\n## Markt\nMedian: {median} EUR, Angebote: {count or '?'}")

    if existing_claims:
        parts.append("\n## Bereits bekannt")
        for c in existing_claims[:5]:
            parts.append(f"- {c.get('statement', '')}")

    # --- Fixed format at the end ---
    parts.append(
        "\n## Ausgabeformat\n\n"
        "Antworte exakt in diesem Format:\n\n"
        "ENTSCHEIDUNG: lohnt sich | nicht nötig\n\n"
        "WAS ZU WISSEN IST:\n"
        "- Zeile 1\n"
        "- Zeile 2\n"
        "(maximal 6 Zeilen)\n\n"
        "SUCHAUFTRAG:\n"
        "(kurzer Absatz, was die Web-Suche herausfinden soll)"
    )

    return "\n".join(parts)


def parse_brief_response(response_text):
    """Parse the brief prompt response.

    Returns {decision, what_to_know, search_brief} or None if unparseable.
    """
    text = response_text.strip()

    decision = "lohnt sich"
    if "nicht nötig" in text.lower() or "nicht nötig" in text.lower():
        decision = "nicht nötig"

    what_to_know = []
    search_brief = ""

    lines = text.split("\n")
    section = None
    for line in lines:
        stripped = line.strip()
        upper = stripped.upper()
        if upper.startswith("ENTSCHEIDUNG"):
            section = "decision"
            continue
        if upper.startswith("WAS ZU WISSEN IST"):
            section = "what"
            continue
        if upper.startswith("SUCHAUFTRAG"):
            section = "brief"
            continue

        if section == "what" and stripped.startswith("- "):
            what_to_know.append(stripped[2:])
        elif section == "brief" and stripped:
            search_brief += stripped + " "

    return {
        "decision": decision,
        "what_to_know": what_to_know[:6],
        "search_brief": search_brief.strip(),
    }


# ---------------------------------------------------------------------------
# Prompt 2: Research brief for the buyer's web-search AI
# ---------------------------------------------------------------------------


def build_search_brief(profile, what_to_know, search_brief_text, model_name=""):
    """Build the copy-paste brief for the buyer's web-search AI.

    Fixed German headings per profile (product-core section 8).
    """
    parts = []

    # Hard frame
    parts.append(
        "Recherchiere gründlich zu folgendem Gebrauchtprodukt. "
        "Beantworte JEDEN Abschnitt. Nenne zu jeder Aussage mindestens "
        "eine vollständige URL als Quelle. Keine Preise vom Gebrauchtmarkt."
    )

    if model_name:
        parts.append(f"\nProdukt: {model_name}")

    # Soft middle: what we want to know
    if what_to_know:
        parts.append("\nWas wir wissen wollen:")
        for item in what_to_know:
            parts.append(f"- {item}")

    if search_brief_text:
        parts.append(f"\n{search_brief_text}")

    # Fixed headings per profile
    headings = _headings_for_profile(profile)
    if headings:
        parts.append("\nGliedere deine Antwort unter diesen Überschriften:")
        for h in headings:
            parts.append(f"\n## {h}\n(hier deine Erkenntnisse)")

    # Format at the end
    parts.append(
        "\nWICHTIG: Nenne zu jeder Aussage die vollständige URL der Quelle. "
        "Ohne URL wird die Aussage verworfen."
    )

    return "\n".join(parts)


def _headings_for_profile(profile):
    """Fixed German headings per profile (product-core section 8)."""
    if profile is None:
        return ()
    headings = getattr(profile, "research_headings", ())
    return headings


# ---------------------------------------------------------------------------
# Prompt 3: Classify a pasted research answer into claims
# ---------------------------------------------------------------------------


def build_classify_prompt(pasted_answer, node_key, profile):
    """Build the claim-classification prompt for the small model.

    Hard frame + the pasted text + output format.
    """
    parts = []

    # Hard frame
    parts.append(
        "Du bist ein Analyst für Gebrauchtware. Zerlege die folgende "
        "Recherche-Antwort in einzelne Behauptungen (Claims).\n\n"
        "REGELN:\n"
        "- Jede Behauptung ist ein eigenständiger Fakt.\n"
        "- Behalte alle URLs als Quellen.\n"
        "- Markiere Behauptungen ohne URL als unsourced: true.\n"
        "- Ordne jede Behauptung einer Art zu.\n"
        "- Schreibe auf Deutsch.\n"
        "- Gib NUR das JSON-Array aus, keinen anderen Text.\n"
    )

    # Soft middle: the answer
    parts.append(f"\n## Knoten: {node_key}\n")
    parts.append(f"## Recherche-Antwort:\n\n{pasted_answer}\n")

    # Output format at the end
    kind_list = ", ".join(
        f'"{k}"'
        for k in (
            "weakness",
            "check",
            "recognition",
            "maintenance",
            "value_driver",
            "warning_sign",
            "seller_question",
            "retrofit",
            "benchmark",
            "good_terms",
        )
    )
    parts.append(
        "\n## Ausgabeformat\n\n"
        "Antworte mit einem JSON-Array. Jedes Element:\n"
        "```json\n"
        "{\n"
        f'  "kind": {kind_list},\n'
        '  "statement": "konkreter, prüfbarer Fakt auf Deutsch",\n'
        '  "check_path": "text | photo | ask | on_site",\n'
        '  "weight": "minor | costly | dealbreaker",\n'
        '  "sources": ["https://..."],\n'
        '  "unsourced": false\n'
        "}\n"
        "```\n\n"
        "Gib NUR das JSON-Array aus."
    )

    return "\n".join(parts)


def parse_classify_response(response_text):
    """Parse the claim-classification response.

    Returns a list of claim dicts.  Marks unsourced claims.
    """
    import re

    text = response_text.strip()
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    try:
        claims = json.loads(text)
    except json.JSONDecodeError:
        # Try to find a JSON array in the text
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            try:
                claims = json.loads(match.group())
            except json.JSONDecodeError:
                logger.warning("Could not parse classify response as JSON")
                return []
        else:
            logger.warning("No JSON array found in classify response")
            return []

    if not isinstance(claims, list):
        return []

    result = []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        if not claim.get("statement"):
            continue

        kind = claim.get("kind", "check")
        if kind not in (
            "weakness",
            "check",
            "recognition",
            "maintenance",
            "value_driver",
            "warning_sign",
            "seller_question",
            "retrofit",
            "benchmark",
            "good_terms",
        ):
            kind = "check"

        sources = claim.get("sources", [])
        if not isinstance(sources, list):
            sources = [sources] if sources else []

        # Filter to actual URLs
        url_sources = [
            s for s in sources if isinstance(s, str) and s.startswith("http")
        ]

        unsourced = claim.get("unsourced", False) or len(url_sources) == 0

        result.append(
            {
                "kind": kind,
                "statement": claim["statement"],
                "check_path": claim.get("check_path", "text"),
                "weight": claim.get("weight", "minor"),
                "sources": url_sources,
                "unsourced": unsourced,
            }
        )

    return result
