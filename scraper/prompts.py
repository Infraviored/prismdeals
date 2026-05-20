def get_generalized_analysis_prompt(
    title, description, criteria_list, expert_knowledge=None
):
    """Returns a highly optimized prompt for analyzing any listing against dynamic custom criteria, returning a nested JSON structure."""
    criteria_instructions = ""
    criteria_keys = {}

    for c in criteria_list:
        cid = c.get("id")
        desc = c.get("description")
        ctype = c.get("type", "boolean")
        criteria_instructions += (
            f"- ID: '{cid}'\n  Type: {ctype}\n  Instruction: {desc}\n\n"
        )

        if ctype == "boolean":
            val_str = '"yes" / "no" / "unknown"'
        else:
            val_str = 'extracted value / "unknown"'

        criteria_keys[cid] = (
            "{\n"
            f'      "value": {val_str},\n'
            '      "evidence_quote": "exact matching quote from listing text, or empty string",\n'
            '      "evidence_source": "title" / "description" / "details",\n'
            '      "confidence": "high" / "med" / "low",\n'
            '      "reasoning": "1-2 sentence extremely concise justification (max 140 chars)"\n'
            "    }"
        )

    criteria_schema = ",\n    ".join([f'"{k}": {v}' for k, v in criteria_keys.items()])

    schema_str = (
        "{\n"
        '  "criteria": {\n'
        f"    {criteria_schema}\n"
        "  },\n"
        '  "highlights": [\n'
        "    {\n"
        "      \"label\": \"short label under 32 chars, e.g. 'TÜV abgelaufen', 'Lima erneuert'\",\n"
        '      "type": "maintenance" / "warning" / "feature",\n'
        '      "sentiment": "positive" / "negative" / "neutral",\n'
        '      "evidence_quote": "exact quote from text",\n'
        '      "confidence": "high" / "med" / "low"\n'
        "    }\n"
        "  ],\n"
        '  "draft_message": "Draft an outreach buyer first-message in German (or the listing\'s language). '
        "Show interest in the item, show you are knowledgeable (referencing any expert domain details "
        'gently), and invite a chat with 1-2 soft, friendly questions. Do not sound like an interrogation.",\n'
        '  "_full_info_obtained": true / false\n'
        "}"
    )

    gk_block = ""
    if expert_knowledge:
        gk_block = f"--- EXPERT KNOWLEDGE RULES ---\n{expert_knowledge}\n\n"

    few_shot_block = (
        "--- FEW-SHOT EXAMPLES ---\n"
        "Example 1:\n"
        'Listing Metadata: {"Marke": "Honda", "Modell": "SC57", "Kilometerstand": "25000"}\n'
        "Description: Motorrad läuft super. Lima vor 2 Monaten erneuert. TÜV abgelaufen.\n"
        "Criteria Config:\n"
        "- ID: 'stator_replaced' (boolean)\n\n"
        "Expected Output:\n"
        "START_JSON\n"
        "{\n"
        '  "criteria": {\n'
        '    "stator_replaced": {\n'
        '      "value": "yes",\n'
        '      "evidence_quote": "Lima vor 2 Monaten erneuert",\n'
        '      "evidence_source": "description",\n'
        '      "confidence": "high",\n'
        '      "reasoning": "Stator vor 2 Monaten erneuert laut Inserat."\n'
        "    }\n"
        "  },\n"
        '  "highlights": [\n'
        "    {\n"
        '      "label": "TÜV abgelaufen",\n'
        '      "type": "warning",\n'
        '      "sentiment": "negative",\n'
        '      "evidence_quote": "TÜV abgelaufen",\n'
        '      "confidence": "high"\n'
        "    },\n"
        "    {\n"
        '      "label": "Lima erneuert",\n'
        '      "type": "maintenance",\n'
        '      "sentiment": "positive",\n'
        '      "evidence_quote": "Lima vor 2 Monaten erneuert",\n'
        '      "confidence": "high"\n'
        "    }\n"
        "  ],\n"
        '  "draft_message": "Hallo! Tolle SC57. Ich habe gesehen, dass die Lima erneuert wurde und der TÜV abgelaufen ist. Ist das Motorrad ansonsten unfallfrei?",\n'
        '  "_full_info_obtained": true\n'
        "}\n"
        "END_JSON\n\n"
        "Example 2:\n"
        'Listing Metadata: {"Marke": "Honda", "Modell": "SC57"}\n'
        "Description: Schöne SC57 zu verkaufen.\n"
        "Criteria Config:\n"
        "- ID: 'stator_replaced' (boolean)\n\n"
        "Expected Output:\n"
        "START_JSON\n"
        "{\n"
        '  "criteria": {\n'
        '    "stator_replaced": {\n'
        '      "value": "unknown",\n'
        '      "evidence_quote": "",\n'
        '      "evidence_source": "description",\n'
        '      "confidence": "low",\n'
        '      "reasoning": "Keine Angaben zum Stator im Text."\n'
        "    }\n"
        "  },\n"
        '  "highlights": [],\n'
        '  "draft_message": "Hallo! Ich interessiere mich für Ihre SC57. Wurde bei der Maschine bereits der Stator getauscht?",\n'
        '  "_full_info_obtained": false\n'
        "}\n"
        "END_JSON\n"
    )

    return (
        "You are a strict, precise data extraction worker. "
        "Carefully analyze the listing against custom criteria, extract quotes/confidence values, and draft a buyer message.\n\n"
        "--- RULES ---\n"
        "1. Extract only facts stated or strongly implied in the listing. Do not guess or assume.\n"
        "2. If evidence is completely missing, return 'unknown' as the value, an empty string quote, and 'low' confidence.\n"
        "3. Base every criterion on a short quote from the input.\n"
        "4. Output exactly one valid JSON object delimited strictly by the line START_JSON and END_JSON. Nothing else.\n"
        "5. Extract up to 5 structured highlights in 'highlights'. Only include specific, buyer-relevant facts (e.g. recent maintenance, replaced parts, notable equipment, defects). Do NOT extract generic marketing language (e.g. 'gepflegt', 'top', 'super Zustand', 'Liebhaberstück'). If none, return empty array.\n"
        "6. Define the role of 'reasoning' in 'criteria' strictly as: A short user-facing explanation of why the value was chosen; do not include hidden chain-of-thought, only concise evidence-based justification under 140 characters.\n\n"
        f"{gk_block}"
        "--- CRITERIA ---\n"
        f"{criteria_instructions}"
        f"{few_shot_block}\n"
        "--- TARGET JSON SCHEMA ---\n"
        "Provide your single JSON output strictly between START_JSON and END_JSON lines conforming to this schema:\n"
        "START_JSON\n"
        f"{schema_str}\n"
        "END_JSON\n\n"
        "--- LISTING TITLE ---\n"
        f"{title}\n\n"
        "--- DESCRIPTION ---\n"
    )


def get_outreach_draft_prompt(
    title,
    description,
    extracted_facts,
    outreach_strategy,
    missing_criteria,
    expert_knowledge=None,
):
    """Generates the prompt for the Worker AI to draft a tailored first-touch outreach message"""
    questions_block = ""
    for q in outreach_strategy.get("questions", []):
        if q.get("target_criterion") in missing_criteria:
            questions_block += (
                f"- Ask about {q.get('target_criterion')}: {q.get('question_text')}\n"
            )

    gk_block = ""
    if expert_knowledge:
        gk_block = f"General Domain & Expert Knowledge Rules:\n{expert_knowledge}\n\n"

    return (
        "You are a friendly, knowledgeable buyer interested in purchasing the product in the listing below.\n\n"
        f"{gk_block}"
        f"Listing Title: {title}\n"
        f"Listing Description:\n{description}\n\n"
        "Outreach Strategy Guidelines:\n"
        f"- Tone: {outreach_strategy.get('tone', 'friendly, casual, polite')}\n"
        f"- Opening Hook: {outreach_strategy.get('opening_hook', 'Hi, I am interested in your item.')}\n\n"
        "Specific Questions to Inquire About:\n"
        f"{questions_block}\n"
        "Your task is to draft a cohesive, highly natural message in German (or the listing's native language) "
        "asking for the item. Smoothly blend the opening hook, showing you are informed about the item, "
        "with the questions about the missing details. Keep the message concise, inviting the seller to chat "
        "rather than sounding like an interrogation. Do not use generic placeholders. Output only the message text itself."
    )
