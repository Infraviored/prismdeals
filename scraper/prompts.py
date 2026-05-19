def get_generalized_analysis_prompt(
    title, description, criteria_list, expert_knowledge=None
):
    """Returns a highly optimized prompt for analyzing any listing against dynamic custom criteria"""
    criteria_instructions = ""
    json_keys = {}

    for c in criteria_list:
        cid = c.get("id")
        desc = c.get("description")
        ctype = c.get("type", "boolean")
        criteria_instructions += (
            f"- ID: '{cid}'\n  Type: {ctype}\n  Instruction: {desc}\n\n"
        )

        if ctype == "boolean":
            json_keys[cid] = 'true / false / "unknown"'
        else:
            json_keys[cid] = f'extracted value (type {ctype}) / "unknown"'

    json_schema_lines = [f'  "{k}": {v}' for k, v in json_keys.items()]
    json_schema_lines.append('  "_full_info_obtained": true / false')
    schema_str = "{\n" + ",\n".join(json_schema_lines) + "\n}"

    gk_block = ""
    if expert_knowledge:
        gk_block = f"General Domain & Expert Knowledge Rules:\n{expert_knowledge}\n\n"

    return (
        "You are an expert product analyst. Carefully analyze the following listing to extract specific attributes.\n\n"
        f"{gk_block}"
        "Here are the extraction criteria you need to evaluate:\n"
        f"{criteria_instructions}"
        "First, think through your reasoning step-by-step for each criterion. "
        "Then, provide your final answers in a raw, valid JSON block.\n\n"
        "Format your output exactly like this:\n"
        "Reasoning:\n"
        "<Your detailed step-by-step reasoning for each criterion>\n\n"
        "```json\n"
        f"{schema_str}\n"
        "```\n\n"
        "Remember:\n"
        '1. For boolean fields, output true (boolean), false (boolean), or the string "unknown".\n'
        "2. Set '_full_info_obtained' to true if and only if NO attributes are \"unknown\". If any attribute is \"unknown\", set '_full_info_obtained' to false.\n\n"
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
