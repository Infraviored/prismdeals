import os
import json

_INTERNAL_PROMPT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "prompts",
    "internal_prompt.md",
)


def build_evaluation_prompt(
    title, details_text, description, item_json_str, expert_knowledge
):
    """Fill internal_prompt.md placeholders, build JSON skeleton, and return the complete prompt string."""
    with open(_INTERNAL_PROMPT_PATH, encoding="utf-8") as f:
        template = f.read()

    # Build the JSON skeleton dynamically from criteria
    criteria_list = []
    try:
        if item_json_str:
            item_config = json.loads(item_json_str)
            criteria_list = item_config.get("extraction_criteria", [])
    except Exception:
        pass

    skeleton_criteria = {}
    for c in criteria_list:
        cid = c.get("id")
        if cid:
            skeleton_criteria[cid] = {
                "value": "unknown",
                "evidence_quote": "",
                "reasoning": "",
            }

    skeleton = {
        "criteria": skeleton_criteria,
        "highlights": [],
        "draft_message": "",
        "_full_info_obtained": False,
    }
    skeleton_str = json.dumps(skeleton, indent=2)

    filled = (
        template.replace("{{EXPERT_KNOWLEDGE}}", expert_knowledge or "")
        .replace("{{ITEM_JSON}}", item_json_str)
        .replace("{{LISTING_TITLE}}", title)
        .replace("{{LISTING_DETAILS}}", details_text)
        .replace("{{LISTING_DESCRIPTION}}", description)
        .replace("{{JSON_SKELETON}}", skeleton_str)
    )
    return filled


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
