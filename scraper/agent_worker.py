import os
import sys
import json
import sqlite3
import datetime
import logging
import re
from openai import OpenAI
from config import API_KEY, LLM_MODEL
from prompts import get_generalized_analysis_prompt, get_outreach_draft_prompt

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai_key = os.environ.get("OPENAI_API_KEY") or API_KEY
client = OpenAI(api_key=openai_key)

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "scraper.db",
)


def get_db_connection():
    return sqlite3.connect(DB_PATH)


def extract_json_block(text):
    """Robust extraction of JSON blocks from LLM markdown responses"""
    # Look for ```json ... ``` blocks
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception as e:
            logger.warning(f"Failed to parse inner JSON block: {str(e)}")

    # Try parsing raw string
    try:
        return json.loads(text)
    except Exception:
        pass

    return None


def process_unprocessed_listings():
    """Finds all unprocessed listings, extracts attributes using OpenAI, and scores them"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Query listings that have a profile assigned and haven't been LLM processed
    cursor.execute(
        """
        SELECT l.id, l.title, l.detailed_description, l.details, l.search_id, k.item_json, k.expert_knowledge 
        FROM listings l
        JOIN searches s ON l.search_id = s.id
        JOIN campaigns c ON s.campaign_id = c.id
        LEFT JOIN knowledge_sets k ON s.knowledge_set_id = k.id
        WHERE l.llm_processed = 0
    """
    )
    listings = cursor.fetchall()

    if not listings:
        logger.info("No unprocessed listings found.")
        conn.close()
        return

    logger.info(f"Processing {len(listings)} listings...")

    for listing in listings:
        listing_id = listing["id"]
        title = listing["title"]
        description = listing["detailed_description"] or ""
        try:
            details_obj = json.loads(listing["details"] or "{}")
            if details_obj:
                details_text = "\n".join(
                    [f"- {k}: {v}" for k, v in details_obj.items()]
                )
                description = f"Key attributes/details:\n{details_text}\n\nDescription:\n{description}"
        except Exception as e:
            logger.warning(f"Failed to parse listing details for LLM prompt: {str(e)}")

        logger.info(f"Analyzing: {title} (ID: {listing_id})")

        try:
            item_config = json.loads(listing["item_json"] or "{}")
            criteria_list = item_config.get("extraction_criteria", [])
            scoring_model = item_config.get("scoring_model", {})
        except Exception as e:
            logger.error(f"Error parsing item_json for listing {listing_id}: {str(e)}")
            continue

        prompt = get_generalized_analysis_prompt(
            title, description, criteria_list, listing["expert_knowledge"]
        )

        try:
            response = client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise, objective product analyst.",
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=800,
                temperature=0.0,
            )
            response_text = response.choices[0].message.content.strip()

            extracted_data = extract_json_block(response_text)

            if not extracted_data:
                logger.warning(
                    f"Could not extract JSON from response for listing {listing_id}. Response: {response_text}"
                )
                continue

            # Separate custom criteria facts from the meta variables
            full_info_obtained = extracted_data.pop("_full_info_obtained", False)

            # Map values back to criteria list (normalize boolean and missing string fields)
            facts = {}
            for c in criteria_list:
                cid = c["id"]
                val = extracted_data.get(cid, "unknown")

                # Normalize values
                if isinstance(val, str):
                    val_lower = val.lower().strip()
                    if val_lower == "true":
                        val = True
                    elif val_lower == "false":
                        val = False
                    elif val_lower == "unknown":
                        val = "unknown"
                facts[cid] = val

            # Score calculation
            base_score = scoring_model.get("base_score", 50)
            score = base_score
            is_dealbreaker_triggered = False

            if "rules" in scoring_model:
                for rule in scoring_model["rules"]:
                    rcid = rule["criterion_id"]
                    rval = rule["value"]

                    if facts.get(rcid) == rval:
                        if rule.get("is_dealbreaker", False):
                            is_dealbreaker_triggered = True
                        score += rule.get("weight", 0)

            status = "New"
            if is_dealbreaker_triggered:
                score = -9999
                status = "Dealbreaker"

            # Update Listing
            cursor.execute(
                """
                UPDATE listings 
                SET llm_processed = 1,
                    llm_processed_time = ?,
                    full_info_obtained = ?,
                    extracted_facts = ?,
                    niceness_score = ?,
                    status = ?
                WHERE id = ?
            """,
                (
                    datetime.datetime.now().isoformat(),
                    1 if full_info_obtained else 0,
                    json.dumps(facts),
                    score,
                    status,
                    listing_id,
                ),
            )
            conn.commit()

            logger.info(
                f"Successfully processed and scored listing {listing_id}: Score = {score}, Status = {status}"
            )

        except Exception as e:
            logger.error(f"Error processing listing {listing_id} with OpenAI: {str(e)}")

    conn.close()


def generate_outreach_draft(listing_id):
    """Generates a first-touch personalized outreach draft based on missing (unknown) attributes"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT l.title, l.detailed_description, l.details, l.extracted_facts, k.item_json, k.expert_knowledge 
        FROM listings l
        JOIN searches s ON l.search_id = s.id
        JOIN campaigns c ON s.campaign_id = c.id
        LEFT JOIN knowledge_sets k ON s.knowledge_set_id = k.id
        WHERE l.id = ?
    """,
        (listing_id,),
    )
    row = cursor.fetchone()

    if not row:
        print("Error: Listing or Profile not found.")
        conn.close()
        sys.exit(1)

    title = row["title"]
    description = row["detailed_description"] or ""
    try:
        details_obj = json.loads(row["details"] or "{}")
        if details_obj:
            details_text = "\n".join([f"- {k}: {v}" for k, v in details_obj.items()])
            description = f"Key attributes/details:\n{details_text}\n\nDescription:\n{description}"
    except Exception as e:
        print(f"Failed to parse listing details for outreach draft: {str(e)}")

    try:
        facts = json.loads(row["extracted_facts"] or "{}")
        item_config = json.loads(row["item_json"] or "{}")
        strategy = item_config.get("outreach_strategy", {})
    except Exception as e:
        print(f"Error parsing listing metrics: {str(e)}")
        conn.close()
        sys.exit(1)

    # Check for missing/unknown criteria
    missing_criteria = [k for k, v in facts.items() if v == "unknown"]

    # Generate outreach prompt
    prompt = get_outreach_draft_prompt(
        title, description, facts, strategy, missing_criteria, row["expert_knowledge"]
    )

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You write elegant, friendly outreach messages for prospective buyers.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.7,
        )
        draft_message = response.choices[0].message.content.strip()
        print(draft_message)
    except Exception as e:
        print(f"Error generating outreach draft from OpenAI: {str(e)}")
        sys.exit(1)

    conn.close()


def analyze_conversation(listing_id):
    """Analyzes dynamic chats/negotiations to clarify outstanding unknowns in extracted facts"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Fetch listing, its facts, and matching profile extraction criteria
    cursor.execute(
        """
        SELECT l.extracted_facts, l.search_id, s.item_json
        FROM listings l
        JOIN searches s ON l.search_id = s.id
        WHERE l.id = ?
    """,
        (listing_id,),
    )
    row = cursor.fetchone()

    if not row:
        logger.warning(
            f"No listing/profile found for conversation analysis on listing {listing_id}"
        )
        conn.close()
        return

    try:
        facts = json.loads(row["extracted_facts"] or "{}")
        item_config = json.loads(row["item_json"] or "{}")
        criteria_list = item_config.get("extraction_criteria", [])
        scoring_model = item_config.get("scoring_model", {})
    except Exception as e:
        logger.error(f"Error parsing metadata for listing {listing_id}: {str(e)}")
        conn.close()
        return

    # Check if there are any unknowns to resolve
    unknown_keys = [k for k, v in facts.items() if v == "unknown"]
    if not unknown_keys:
        logger.info(f"No unknown criteria to resolve for listing {listing_id}.")
        conn.close()
        return

    # 2. Fetch synced messages
    cursor.execute(
        """
        SELECT sender_name, is_outbound, message_text 
        FROM messages 
        WHERE listing_id = ? 
        ORDER BY message_date ASC
    """,
        (listing_id,),
    )
    msgs = cursor.fetchall()

    if not msgs:
        logger.info(f"No synced messages found to analyze for listing {listing_id}.")
        conn.close()
        return

    # Format chat log
    chat_log = ""
    for m in msgs:
        sender = "Buyer" if m["is_outbound"] else (m["sender_name"] or "Seller")
        chat_log += f"{sender}: {m['message_text']}\n"

    # Build dynamic questions prompt
    target_criteria = [c for c in criteria_list if c["id"] in unknown_keys]
    criteria_instructions = ""
    for c in target_criteria:
        criteria_instructions += f"- ID: '{c['id']}'\n  Type: {c.get('type', 'boolean')}\n  Instruction: {c['description']}\n\n"

    prompt = (
        "You are an expert product analyst reviewing a conversation between a prospective buyer and seller.\n\n"
        "Here is the chat history:\n"
        f"{chat_log}\n"
        "And here are the attributes currently marked as 'unknown' that we want to resolve:\n"
        f"{criteria_instructions}"
        "Your task is to analyze the seller's replies in the chat history. "
        "Determine if the seller has clarified the value of any of these attributes.\n\n"
        "Provide your answers in a raw, valid JSON block. "
        "Do not include any explanations outside the JSON block. "
        "Keep the attribute value as 'unknown' if it has not been clarified.\n\n"
        "Format:\n"
        "```json\n"
        "{\n"
        + ",\n".join([f'  "{k}": true/false/"unknown"' for k in unknown_keys])
        + "\n"
        "}\n"
        "```"
    )

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise, objective chat analyzer.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=400,
            temperature=0.0,
        )
        response_text = response.choices[0].message.content.strip()
        updated_data = extract_json_block(response_text)

        if not updated_data:
            logger.warning(
                f"Could not extract JSON from conversation analysis for listing {listing_id}."
            )
            conn.close()
            return

        # Update facts map
        changes_made = False
        for k, v in updated_data.items():
            if k in facts and facts[k] == "unknown" and v != "unknown":
                # Normalize boolean
                if isinstance(v, str):
                    if v.lower() == "true":
                        v = True
                    elif v.lower() == "false":
                        v = False
                facts[k] = v
                changes_made = True
                logger.info(
                    f"Resolved unknown criterion '{k}' to '{v}' for listing {listing_id}"
                )

        if changes_made:
            # Recalculate score
            base_score = scoring_model.get("base_score", 50)
            score = base_score
            is_dealbreaker = False

            if "rules" in scoring_model:
                for rule in scoring_model["rules"]:
                    rcid = rule["criterion_id"]
                    rval = rule["value"]
                    if facts.get(rcid) == rval:
                        if rule.get("is_dealbreaker", False):
                            is_dealbreaker = True
                        score += rule.get("weight", 0)

            status = "Negotiating"
            if is_dealbreaker:
                score = -9999
                status = "Dealbreaker"

            full_info = all(val != "unknown" for val in facts.values())

            cursor.execute(
                """
                UPDATE listings 
                SET extracted_facts = ?,
                    niceness_score = ?,
                    status = ?,
                    full_info_obtained = ?
                WHERE id = ?
            """,
                (json.dumps(facts), score, status, 1 if full_info else 0, listing_id),
            )
            conn.commit()
            logger.info(
                f"Updated listing {listing_id} score to {score} after resolved chat unknowns."
            )

    except Exception as e:
        logger.error(
            f"Error during conversation analysis for listing {listing_id}: {str(e)}"
        )

    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python3 agent_worker.py [process | draft <listing_id> | analyze <listing_id>]"
        )
        sys.exit(1)

    command = sys.argv[1]

    if command == "process":
        process_unprocessed_listings()
    elif command == "draft":
        if len(sys.argv) < 3:
            print("Usage: python3 agent_worker.py draft <listing_id>")
            sys.exit(1)
        generate_outreach_draft(sys.argv[2])
    elif command == "analyze":
        if len(sys.argv) < 3:
            print("Usage: python3 agent_worker.py analyze <listing_id>")
            sys.exit(1)
        analyze_conversation(sys.argv[2])
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
