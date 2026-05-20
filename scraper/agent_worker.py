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
log_file = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "scraper.log",
)
os.makedirs(os.path.dirname(log_file), exist_ok=True)

root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Clear existing handlers to prevent duplicates
for handler in list(root_logger.handlers):
    root_logger.removeHandler(handler)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

# Console handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

# File handler
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

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
    """Robust extraction of JSON blocks from LLM responses"""
    # 1. Try START_JSON ... END_JSON magic markers
    start_marker = "START_JSON"
    end_marker = "END_JSON"
    if start_marker in text and end_marker in text:
        try:
            start_idx = text.find(start_marker) + len(start_marker)
            end_idx = text.find(end_marker)
            json_str = text[start_idx:end_idx].strip()
            return json.loads(json_str)
        except Exception as e:
            logger.warning(f"Failed to parse JSON between magic markers: {str(e)}")

    # 2. Look for ```json ... ``` blocks
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception as e:
            logger.warning(f"Failed to parse inner JSON block: {str(e)}")

    # 3. Try parsing raw string
    try:
        return json.loads(text.strip())
    except Exception:
        pass

    return None


def validate_extracted_data(extracted_data, criteria_list):
    """Validates the extracted JSON structure against target schema rules and returns a list of error strings"""
    errors = []
    if not isinstance(extracted_data, dict):
        return ["Extracted data is not a JSON object"]

    required_keys = ["criteria", "highlights", "draft_message", "_full_info_obtained"]
    for key in required_keys:
        if key not in extracted_data:
            errors.append(f"Missing required top-level key: '{key}'")

    if "criteria" in extracted_data:
        criteria_part = extracted_data["criteria"]
        if not isinstance(criteria_part, dict):
            errors.append("'criteria' must be a JSON object")
        else:
            for c in criteria_list:
                cid = c["id"]
                if cid not in criteria_part:
                    errors.append(f"Missing criterion ID in 'criteria': '{cid}'")
                    continue
                c_val = criteria_part[cid]
                if not isinstance(c_val, dict):
                    errors.append(f"Criterion '{cid}' must be a JSON object")
                    continue

                # Check keys
                for subkey in [
                    "value",
                    "confidence",
                    "evidence_quote",
                    "evidence_source",
                    "reasoning",
                ]:
                    if subkey not in c_val:
                        errors.append(f"Criterion '{cid}' is missing key '{subkey}'")

                # Check enums
                val = c_val.get("value")
                if val not in ["yes", "no", "unknown"]:
                    errors.append(
                        f"Criterion '{cid}' has invalid value '{val}' (must be 'yes', 'no', or 'unknown')"
                    )

                conf = c_val.get("confidence")
                if conf not in ["high", "med", "low"]:
                    errors.append(
                        f"Criterion '{cid}' has invalid confidence '{conf}' (must be 'high', 'med', or 'low')"
                    )

                source = c_val.get("evidence_source")
                if source not in ["title", "description", "details"]:
                    errors.append(
                        f"Criterion '{cid}' has invalid evidence_source '{source}' (must be 'title', 'description', or 'details')"
                    )

    if "highlights" in extracted_data:
        highlights_part = extracted_data["highlights"]
        if not isinstance(highlights_part, list):
            errors.append("'highlights' must be a JSON array")
        else:
            for idx, h in enumerate(highlights_part):
                if not isinstance(h, dict):
                    errors.append(f"Highlight at index {idx} is not a JSON object")
                    continue
                for subkey in [
                    "label",
                    "type",
                    "sentiment",
                    "evidence_quote",
                    "confidence",
                ]:
                    if subkey not in h:
                        errors.append(
                            f"Highlight at index {idx} is missing key '{subkey}'"
                        )

                h_type = h.get("type")
                if h_type not in ["maintenance", "warning", "feature"]:
                    errors.append(
                        f"Highlight at index {idx} has invalid type '{h_type}'"
                    )

                h_sent = h.get("sentiment")
                if h_sent not in ["positive", "negative", "neutral"]:
                    errors.append(
                        f"Highlight at index {idx} has invalid sentiment '{h_sent}'"
                    )

                h_conf = h.get("confidence")
                if h_conf not in ["high", "med", "low"]:
                    errors.append(
                        f"Highlight at index {idx} has invalid confidence '{h_conf}'"
                    )

    return errors


def is_satisfied(value, satisfied_if):
    """Checks if the extracted criterion value matches the satisfied_if campaign target"""
    if (
        satisfied_if is True
        or satisfied_if == "yes"
        or (isinstance(satisfied_if, str) and satisfied_if.lower() == "true")
    ):
        target = "yes"
    elif (
        satisfied_if is False
        or satisfied_if == "no"
        or (isinstance(satisfied_if, str) and satisfied_if.lower() == "false")
    ):
        target = "no"
    else:
        target = "unknown"
    return value == target


def process_unprocessed_listings(target_listing_id=None):
    """Finds all unprocessed listings (or a specific single listing), extracts attributes using OpenAI, and scores them"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Query listings that have a profile assigned and haven't been LLM processed
    if target_listing_id:
        cursor.execute(
            """
            SELECT l.id, l.title, l.detailed_description, l.details, l.search_id, k.item_json, k.expert_knowledge 
            FROM listings l
            JOIN searches s ON l.search_id = s.id
            JOIN campaigns c ON s.campaign_id = c.id
            LEFT JOIN knowledge_sets k ON s.knowledge_set_id = k.id
            WHERE l.id = ?
        """,
            (target_listing_id,),
        )
    else:
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
            messages = []
            if (
                "gpt-5" in LLM_MODEL
                or LLM_MODEL.startswith("o1")
                or LLM_MODEL.startswith("o3")
            ):
                messages.append(
                    {
                        "role": "user",
                        "content": f"You are a precise, objective product analyst.\n\n{prompt}",
                    }
                )
            else:
                messages.append(
                    {
                        "role": "system",
                        "content": "You are a precise, objective product analyst.",
                    }
                )
                messages.append({"role": "user", "content": prompt})

            kwargs = {
                "model": LLM_MODEL,
                "messages": messages,
                "max_completion_tokens": 16000,
            }
            if not (
                "gpt-5" in LLM_MODEL
                or LLM_MODEL.startswith("o1")
                or LLM_MODEL.startswith("o3")
            ):
                kwargs["temperature"] = 0.0
            response = client.chat.completions.create(**kwargs)
            response_text = response.choices[0].message.content.strip()

            extracted_data = extract_json_block(response_text)
            validation_errors = (
                validate_extracted_data(extracted_data, criteria_list)
                if extracted_data
                else [
                    "Could not extract JSON block between START_JSON and END_JSON markers."
                ]
            )

            # Bounded One-Shot Retry
            if validation_errors:
                logger.warning(
                    f"Validation failed for listing {listing_id}. Errors: {validation_errors}. Retrying one-shot..."
                )
                errors_str = "\n".join([f"- {err}" for err in validation_errors])
                retry_prompt = (
                    f"{prompt}\n\n"
                    "--- VALIDATION FAILURE ---\n"
                    "Your previous response failed validation with the following errors:\n"
                    f"{errors_str}\n\n"
                    "--- PREVIOUS RESPONSE ---\n"
                    f"{response_text}\n\n"
                    "Please correct the errors and output the complete corrected JSON strictly between START_JSON and END_JSON lines conforming to the TARGET JSON SCHEMA."
                )

                retry_messages = []
                if (
                    "gpt-5" in LLM_MODEL
                    or LLM_MODEL.startswith("o1")
                    or LLM_MODEL.startswith("o3")
                ):
                    retry_messages.append({"role": "user", "content": retry_prompt})
                else:
                    retry_messages.append(
                        {
                            "role": "system",
                            "content": "You are a precise, objective product analyst.",
                        }
                    )
                    retry_messages.append({"role": "user", "content": retry_prompt})

                retry_kwargs = {
                    "model": LLM_MODEL,
                    "messages": retry_messages,
                    "max_completion_tokens": 16000,
                }
                if not (
                    "gpt-5" in LLM_MODEL
                    or LLM_MODEL.startswith("o1")
                    or LLM_MODEL.startswith("o3")
                ):
                    retry_kwargs["temperature"] = 0.0

                try:
                    response = client.chat.completions.create(**retry_kwargs)
                    response_text = response.choices[0].message.content.strip()
                    extracted_data = extract_json_block(response_text)
                    validation_errors = (
                        validate_extracted_data(extracted_data, criteria_list)
                        if extracted_data
                        else [
                            "Could not extract JSON block between START_JSON and END_JSON markers after retry."
                        ]
                    )
                    if validation_errors:
                        logger.error(
                            f"Validation failed after retry for listing {listing_id}. Errors: {validation_errors}. Proceeding with best-effort parsing."
                        )
                except Exception as retry_err:
                    logger.error(
                        f"Error during retry for listing {listing_id}: {str(retry_err)}"
                    )

            if not extracted_data or not isinstance(extracted_data, dict):
                extracted_data = {}

            criteria_part = extracted_data.get("criteria", {})
            if not isinstance(criteria_part, dict):
                criteria_part = {}

            highlights_part = extracted_data.get("highlights", [])
            if not isinstance(highlights_part, list):
                highlights_part = []

            draft_message = extracted_data.get("draft_message", "")
            full_info_obtained = extracted_data.get("_full_info_obtained", False)

            # Populate and normalize criteria list
            normalized_criteria = {}
            for c in criteria_list:
                cid = c["id"]
                c_val = criteria_part.get(cid)
                if not isinstance(c_val, dict):
                    c_val = {}

                value = c_val.get("value")
                if value is None:
                    value = extracted_data.get(cid)
                if value not in ["yes", "no", "unknown"]:
                    if value is True or (
                        isinstance(value, str) and value.lower() in ["true", "yes"]
                    ):
                        value = "yes"
                    elif value is False or (
                        isinstance(value, str) and value.lower() in ["false", "no"]
                    ):
                        value = "no"
                    else:
                        value = "unknown"

                confidence = c_val.get("confidence")
                if confidence not in ["high", "med", "low"]:
                    confidence = "low" if value == "unknown" else "med"

                evidence_quote = c_val.get("evidence_quote", "")
                if not isinstance(evidence_quote, str):
                    evidence_quote = (
                        str(evidence_quote) if evidence_quote is not None else ""
                    )

                evidence_source = c_val.get("evidence_source", "description")
                if evidence_source not in ["title", "description", "details"]:
                    evidence_source = "description"

                reasoning = c_val.get("reasoning", "")
                if not reasoning:
                    reasoning = f"Value determined as '{value}'."

                normalized_criteria[cid] = {
                    "value": value,
                    "confidence": confidence,
                    "evidence_quote": evidence_quote,
                    "evidence_source": evidence_source,
                    "reasoning": reasoning,
                }

            # Score from normalized importance weights with confidence mapping
            weights = scoring_model.get("weights", {})
            score = 0
            for cid, cfg in weights.items():
                c_val = normalized_criteria.get(cid)
                if not isinstance(c_val, dict):
                    continue
                fact_val = c_val.get("value", "unknown")
                confidence = c_val.get("confidence", "low")

                satisfied_if = cfg.get("satisfied_if")

                if fact_val != "unknown" and is_satisfied(fact_val, satisfied_if):
                    if confidence == "high":
                        mult = 1.0
                    elif confidence == "med":
                        mult = 0.6
                    else:
                        mult = 0.25
                    score += cfg.get("importance", 0) * mult

            score = max(0, min(100, score))
            status = "New"
            full_info = (
                1
                if (
                    full_info_obtained is True
                    or all(
                        v["value"] != "unknown" for v in normalized_criteria.values()
                    )
                )
                else 0
            )

            # Reconstruct full nested facts envelope for the DB
            facts_envelope = {
                "criteria": normalized_criteria,
                "highlights": highlights_part,
                "draft_message": draft_message,
                "_full_info_obtained": bool(full_info),
                "_audit": {"_raw_model_response": response_text},
            }

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
                    full_info,
                    json.dumps(facts_envelope),
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
        kwargs = {
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You write elegant, friendly outreach messages for prospective buyers.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_completion_tokens": 2000,
        }
        if not (
            "gpt-5" in LLM_MODEL
            or LLM_MODEL.startswith("o1")
            or LLM_MODEL.startswith("o3")
        ):
            kwargs["temperature"] = 0.7
        response = client.chat.completions.create(**kwargs)
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
        facts_envelope = json.loads(row["extracted_facts"] or "{}")
        if isinstance(facts_envelope, dict) and "criteria" in facts_envelope:
            facts = facts_envelope["criteria"]
        else:
            facts = facts_envelope
        item_config = json.loads(row["item_json"] or "{}")
        criteria_list = item_config.get("extraction_criteria", [])
        scoring_model = item_config.get("scoring_model", {})
    except Exception as e:
        logger.error(f"Error parsing metadata for listing {listing_id}: {str(e)}")
        conn.close()
        return

    # Check if there are any unknowns to resolve
    unknown_keys = []
    for k, v in facts.items():
        if isinstance(v, dict) and v.get("value") == "unknown":
            unknown_keys.append(k)
        elif v == "unknown":
            unknown_keys.append(k)

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
        kwargs = {
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a precise, objective chat analyzer.",
                },
                {"role": "user", "content": prompt},
            ],
            "max_completion_tokens": 2000,
        }
        if not (
            "gpt-5" in LLM_MODEL
            or LLM_MODEL.startswith("o1")
            or LLM_MODEL.startswith("o3")
        ):
            kwargs["temperature"] = 0.0
        response = client.chat.completions.create(**kwargs)
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
            if k in facts and v != "unknown":
                val = "unknown"
                if v is True or (isinstance(v, str) and v.lower() in ["true", "yes"]):
                    val = "yes"
                elif v is False or (
                    isinstance(v, str) and v.lower() in ["false", "no"]
                ):
                    val = "no"

                # Check if it was previously unknown
                is_prev_unknown = False
                if isinstance(facts[k], dict):
                    if facts[k].get("value") == "unknown":
                        is_prev_unknown = True
                elif facts[k] == "unknown":
                    is_prev_unknown = True

                if is_prev_unknown and val != "unknown":
                    if isinstance(facts[k], dict):
                        facts[k]["value"] = val
                        facts[k]["confidence"] = "high"
                        facts[k]["evidence_quote"] = "Clarified in chat conversation"
                        facts[k]["evidence_source"] = "description"
                        facts[k]["reasoning"] = f"Resolved via chat to: {val}."
                    else:
                        facts[k] = {
                            "value": val,
                            "confidence": "high",
                            "evidence_quote": "Clarified in chat conversation",
                            "evidence_source": "description",
                            "reasoning": f"Resolved via chat to: {val}.",
                        }
                    changes_made = True
                    logger.info(
                        f"Resolved unknown criterion '{k}' to '{val}' for listing {listing_id}"
                    )

        if changes_made:
            # Recalculate score using normalized importance weights & confidence weighting
            weights = scoring_model.get("weights", {})
            score = 0
            for cid, cfg in weights.items():
                c_val = facts.get(cid)
                if not isinstance(c_val, dict):
                    continue
                fact_val = c_val.get("value", "unknown")
                confidence = c_val.get("confidence", "low")

                satisfied_if = cfg.get("satisfied_if")

                # Check if satisfied
                if fact_val != "unknown" and is_satisfied(fact_val, satisfied_if):
                    if confidence == "high":
                        mult = 1.0
                    elif confidence == "med":
                        mult = 0.6
                    else:
                        mult = 0.25
                    score += cfg.get("importance", 0) * mult

            score = max(0, min(100, score))
            status = "Negotiating"

            # Check if all criteria are now known
            full_info = True
            for k, v in facts.items():
                if isinstance(v, dict):
                    if v.get("value") == "unknown":
                        full_info = False
                elif v == "unknown":
                    full_info = False

            # Put back into envelope
            if isinstance(facts_envelope, dict):
                facts_envelope["criteria"] = facts
                facts_envelope["_full_info_obtained"] = full_info
            else:
                facts_envelope = {
                    "criteria": facts,
                    "highlights": [],
                    "draft_message": "",
                    "_full_info_obtained": full_info,
                }

            cursor.execute(
                """
                UPDATE listings 
                SET extracted_facts = ?,
                    niceness_score = ?,
                    status = ?,
                    full_info_obtained = ?
                WHERE id = ?
            """,
                (
                    json.dumps(facts_envelope),
                    score,
                    status,
                    1 if full_info else 0,
                    listing_id,
                ),
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
        if len(sys.argv) >= 3:
            process_unprocessed_listings(sys.argv[2])
        else:
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
