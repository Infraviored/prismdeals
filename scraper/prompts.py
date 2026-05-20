def get_generalized_analysis_prompt(
    title, description, criteria_list, expert_knowledge=None
):
    """Returns a highly optimized prompt for analyzing any listing against dynamic custom criteria, returning a nested JSON structure."""
    criteria_instructions = ""
    criteria_keys = {}
    reasoning_keys = {}

    for c in criteria_list:
        cid = c.get("id")
        desc = c.get("description")
        ctype = c.get("type", "boolean")
        criteria_instructions += (
            f"- ID: '{cid}'\n  Type: {ctype}\n  Instruction: {desc}\n\n"
        )

        if ctype == "boolean":
            criteria_keys[cid] = 'true / false / "unknown"'
        else:
            criteria_keys[cid] = f'extracted value (type {ctype}) / "unknown"'

        reasoning_keys[
            cid
        ] = '"detailed explanation explaining why this value was determined from the text"'

    criteria_schema = ",\n    ".join([f'"{k}": {v}' for k, v in criteria_keys.items()])
    reasoning_schema = ",\n    ".join(
        [f'"{k}": {v}' for k, v in reasoning_keys.items()]
    )

    schema_str = (
        "{\n"
        '  "criteria": {\n'
        f"    {criteria_schema}\n"
        "  },\n"
        '  "reasoning": {\n'
        f"    {reasoning_schema}\n"
        "  },\n"
        '  "special_info": [\n'
        "    \"Specific colored highlights or warnings found in text, e.g. '7 Jahre Stillstand' or 'TÜV abgelaufen' (leave list empty if none found)\"\n"
        "  ],\n"
        '  "draft_message": "Draft an outreach buyer first-message in German (or the listing\'s language). '
        "Follow these conversational guidelines: "
        "Show interest in the item, show you are knowledgeable (referencing any expert domain details "
        "from the checklist or rules if applicable), and ask only a few soft, friendly questions that invite "
        'the seller to chat. Do not sound like you are interrogating or hunting defects.",\n'
        '  "_full_info_obtained": true / false\n'
        "}"
    )

    gk_block = ""
    if expert_knowledge:
        gk_block = f"General Domain & Expert Knowledge Rules:\n{expert_knowledge}\n\n"

    return (
        "You are an expert product analyst and customer outreach advisor. "
        "Carefully analyze the following listing to extract specific attributes and draft a first-touch buyer outreach message.\n\n"
        f"{gk_block}"
        "Here are the extraction criteria you need to evaluate:\n"
        f"{criteria_instructions}"
        "Provide your entire, complete response in a single raw, valid JSON block matching this schema EXACTLY:\n\n"
        "```json\n"
        f"{schema_str}\n"
        "```\n\n"
        "Remember:\n"
        '1. For boolean criteria fields, output true (boolean), false (boolean), or the string "unknown".\n'
        "2. For special_info, extract important negative warnings or standing alerts (such as long storage times, missing registration, or component age) that a smart buyer would want to see immediately.\n"
        "3. For draft_message, generate a beautiful, ready-to-send outreach draft in German using the soft conversational style (showing interest first, mentioning model-specific details gently, then inviting a reply with friendly soft questions).\n"
        "4. Set '_full_info_obtained' to true if and only if NO criteria attributes are \"unknown\".\n\n"
        f"Title: {title}\n\n"
        f"Description:\n{description}\n"
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
