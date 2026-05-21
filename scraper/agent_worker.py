import os
import sys
import json
import sqlite3
import datetime
import logging
from logging.handlers import RotatingFileHandler
import re
from openai import OpenAI
from config import API_KEY, LLM_MODEL
from prompts import build_evaluation_prompt, get_outreach_draft_prompt

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

# File handler with rotation (max 5MB, keep 3 backups)
file_handler = RotatingFileHandler(
    log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
)
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


def sanitize_extracted_data(extracted_data):
    """Sanitizes highlights by mapping 'kind' (or legacy 'type') to the strict frontend schema and populating defaults."""
    if not isinstance(extracted_data, dict):
        return extracted_data

    if "highlights" in extracted_data and isinstance(
        extracted_data["highlights"], list
    ):
        sanitized_highlights = []
        for h in extracted_data["highlights"]:
            if not isinstance(h, dict):
                continue

            label = h.get("label", "")
            if not isinstance(label, str):
                label = str(label)
            label = label.strip()
            if not label:
                continue

            # Map "kind" or legacy "type"
            kind_val = h.get("kind") or h.get("type") or "feature"
            k = str(kind_val).lower().strip()

            # Reconstruct legacy type
            h_type = "feature"
            if k in [
                "maintenance",
                "service",
                "tüv",
                "tuv",
                "oil change",
                "repair",
                "tires",
                "inspektion",
                "wartung",
            ]:
                h_type = "maintenance"
            elif k in [
                "warning",
                "defect",
                "issue",
                "damage",
                "flaw",
                "problem",
                "scratch",
                "unfall",
                "schade",
            ]:
                h_type = "warning"
            elif k in [
                "feature",
                "upgrade",
                "accessory",
                "extra",
                "mod",
                "modification",
                "tuning",
                "part",
                "zubehör",
            ]:
                h_type = "feature"
            else:
                # Fuzzy matching fallback
                if any(
                    x in k
                    for x in [
                        "defect",
                        "damage",
                        "broken",
                        "accident",
                        "warn",
                        "fail",
                        "issue",
                        "schade",
                        "unfall",
                        "rost",
                    ]
                ):
                    h_type = "warning"
                elif any(
                    x in k
                    for x in [
                        "service",
                        "tüv",
                        "tuv",
                        "maintenance",
                        "öl",
                        "oil",
                        "reifen",
                        "kett",
                    ]
                ):
                    h_type = "maintenance"
                else:
                    h_type = "feature"

            # Auto-populate sentiment based on type
            sentiment = "neutral"
            if h_type == "warning":
                sentiment = "negative"
            elif h_type == "feature":
                sentiment = "positive"
            elif h_type == "maintenance":
                sentiment = "neutral"

            sanitized_highlights.append(
                {
                    "label": label[:32],  # Ensure length limit under 32 chars
                    "type": h_type,
                    "sentiment": sentiment,
                    "evidence_quote": h.get("evidence_quote") or "",
                    "confidence": h.get("confidence") or "high",
                }
            )
        extracted_data["highlights"] = sanitized_highlights
    return extracted_data


def validate_extracted_data(extracted_data, criteria_list):
    """Validates the extracted JSON structure against target schema rules, strictly checking only catastrophic requirements to avoid unnecessary retries."""
    errors = []
    if not isinstance(extracted_data, dict):
        return ["Extracted data is not a JSON object"]

    # Catastrophic: missing 'criteria' top-level key
    if "criteria" not in extracted_data:
        errors.append("Missing required top-level key: 'criteria'")

    if "criteria" in extracted_data:
        criteria_part = extracted_data["criteria"]
        if not isinstance(criteria_part, dict):
            errors.append("'criteria' must be a JSON object")
        else:
            # Catastrophic: missing required criterion IDs
            for c in criteria_list:
                cid = c["id"]
                if cid not in criteria_part:
                    errors.append(
                        f"Missing required criterion ID in 'criteria': '{cid}'"
                    )

    return errors


def log_listing_analysis(
    listing_id,
    prompt,
    initial_response,
    validation_errors=None,
    retry_prompt=None,
    retry_response=None,
    parsed_json=None,
    score_contributions=None,
    final_score=None,
):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "logs",
    )
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{listing_id}_{ts}.log")

    with open(log_path, "w", encoding="utf-8") as f:
        f.write(f"=== ANALYSIS RUN: {datetime.datetime.now().isoformat()} ===\n\n")
        f.write("=== INITIAL PROMPT ===\n")
        f.write(prompt)
        f.write("\n\n=== INITIAL RESPONSE ===\n")
        f.write(initial_response or "")
        f.write("\n")

        if validation_errors:
            f.write("\n=== VALIDATION ERRORS ===\n")
            f.write("\n".join(validation_errors))
            f.write("\n")

        if retry_prompt:
            f.write("\n=== RETRY PROMPT ===\n")
            f.write(retry_prompt)
            f.write("\n\n=== RETRY RESPONSE ===\n")
            f.write(retry_response or "")
            f.write("\n")

        if parsed_json is not None:
            f.write("\n=== PARSED JSON AFTER SANITIZATION ===\n")
            f.write(json.dumps(parsed_json, indent=2))
            f.write("\n")
        if score_contributions is not None:
            f.write("\n=== SCORE CONTRIBUTIONS ===\n")
            for cid, contrib in score_contributions.items():
                if isinstance(contrib, dict) and "satisfied_if" in contrib:
                    f.write(
                        f"- {cid}: value='{contrib['value']}', expected='{contrib['satisfied_if']}', importance={contrib['importance']}, satisfied={contrib['satisfied']}, contribution={contrib['contribution']}\n"
                    )
                else:
                    f.write(f"- {cid}: {contrib}\n")
            f.write("\n")

        if final_score is not None:
            f.write(f"\n=== FINAL NICENESS SCORE: {final_score} ===\n")


def log_conversation_analysis(listing_id, prompt, response):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "logs",
    )
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{listing_id}_{ts}_conversation.log")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(
            f"=== CONVERSATION ANALYSIS RUN: {datetime.datetime.now().isoformat()} ===\n\n"
        )
        f.write("=== PROMPT ===\n")
        f.write(prompt)
        f.write("\n\n=== RESPONSE ===\n")
        f.write(response or "")
        f.write("\n")


def log_outreach_draft(listing_id, prompt, response):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "logs",
    )
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"{listing_id}_{ts}_outreach.log")
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(
            f"=== OUTREACH DRAFT RUN: {datetime.datetime.now().isoformat()} ===\n\n"
        )
        f.write("=== PROMPT ===\n")
        f.write(prompt)
        f.write("\n\n=== RESPONSE ===\n")
        f.write(response or "")
        f.write("\n")


def is_satisfied(value, satisfied_if):
    """Checks if the extracted criterion value matches the satisfied_if target.
    unknown always returns False regardless of satisfied_if — silence is not safe."""
    if value is None or satisfied_if is None:
        return False

    def normalize(val):
        if isinstance(val, bool):
            return val
        s = str(val).strip().lower()
        if s in ("yes", "y", "true", "ja", "j"):
            return True
        if s in ("no", "n", "false", "nein"):
            return False
        try:
            if s.isdigit():
                return int(s)
            return float(s)
        except ValueError:
            pass
        return s

    norm_val = normalize(value)

    # unknown never satisfies any criterion — not even risk guardrails
    if norm_val == "unknown" or norm_val is None:
        return False

    norm_target = normalize(satisfied_if)
    if norm_target == "unknown" or norm_target is None:
        return False

    if isinstance(norm_val, bool) and isinstance(norm_target, bool):
        return norm_val == norm_target

    if isinstance(norm_val, (int, float)) and isinstance(norm_target, (int, float)):
        return norm_val == norm_target

    if isinstance(norm_val, bool) and isinstance(norm_target, (int, float)):
        return norm_val == (norm_target != 0)
    if isinstance(norm_target, bool) and isinstance(norm_val, (int, float)):
        return norm_target == (norm_val != 0)

    return str(norm_val) == str(norm_target)


def calculate_blended_score(criteria, weights, dimensions):
    """Calculates the blended score: 65% criteria, 35% dimensions, with a coverage factor.

    Coverage factor: the fraction of all criteria that returned an explicit yes/no (not unknown).
    A listing with mostly unknowns is penalised — it cannot score highly on vague silence.
    Coverage below 40% caps the effective score at 50. Coverage scales linearly 40%→100%.
    """
    # 1. Criteria score
    total_possible_weight = 0
    satisfied_weight = 0
    contributions = {}

    resolved_count = 0
    total_count = max(len(weights), 1)

    for cid, cfg in weights.items():
        importance = cfg.get("importance", 0)
        satisfied_if = cfg.get("satisfied_if")
        total_possible_weight += importance

        c_val = criteria.get(cid)
        if not isinstance(c_val, dict):
            contributions[cid] = {
                "value": "unknown",
                "satisfied_if": satisfied_if,
                "importance": importance,
                "satisfied": False,
                "contribution": 0,
            }
            continue

        fact_val = c_val.get("value", "unknown")
        if fact_val in ("yes", "no"):
            resolved_count += 1

        satisfied = is_satisfied(fact_val, satisfied_if)

        if satisfied:
            satisfied_weight += importance
            contributions[cid] = {
                "value": fact_val,
                "satisfied_if": satisfied_if,
                "importance": importance,
                "satisfied": True,
                "contribution": importance,
            }
        else:
            contributions[cid] = {
                "value": fact_val,
                "satisfied_if": satisfied_if,
                "importance": importance,
                "satisfied": False,
                "contribution": 0,
            }

    if total_possible_weight > 0:
        criteria_score = (satisfied_weight / total_possible_weight) * 100
    else:
        criteria_score = 0.0

    # Coverage factor: penalise sparse/vague listings
    coverage_ratio = resolved_count / total_count
    if coverage_ratio < 0.40:
        coverage_factor = 0.0
    else:
        coverage_factor = min(1.0, (coverage_ratio - 0.40) / 0.60)

    # 2. Dimensions score
    expected_dims = [
        "trustworthiness",
        "transparency",
        "conditionConfidence",
        "documentationQuality",
        "hiddenRiskSuspicion",
        "marketAboveAverageSignal",
    ]

    dim_scores = []
    for dim_key in expected_dims:
        dim_data = dimensions.get(dim_key)
        raw_score = 3
        if isinstance(dim_data, dict):
            raw_score = dim_data.get("score", 3)
        elif isinstance(dim_data, (int, float)):
            raw_score = dim_data

        try:
            raw_score = int(float(raw_score))
        except (ValueError, TypeError):
            raw_score = 3

        raw_score = max(1, min(5, raw_score))

        if dim_key == "hiddenRiskSuspicion":
            score_for_calc = 6 - raw_score
        else:
            score_for_calc = raw_score

        norm_dim_score = ((score_for_calc - 1) / 4) * 100
        dim_scores.append(norm_dim_score)

    if dim_scores:
        dimensions_score = sum(dim_scores) / len(dim_scores)
    else:
        dimensions_score = 50.0

    raw_blended = (criteria_score * 0.65) + (dimensions_score * 0.35)

    # Apply coverage: blend between 50 (floor for unknown-heavy listings) and raw_blended
    final_score = 50.0 * (1 - coverage_factor) + raw_blended * coverage_factor
    final_score = max(0, min(100, round(final_score)))

    return final_score, criteria_score, dimensions_score, contributions


_IMPORTANCE_PTS = {"high": 3, "medium": 2, "low": 1}
_NEG_PENALTY_PTS = {3: 12, 2: 7, 1: 3}  # per confirmed-present negative criterion
_NEG_RELIEF_PTS = {3: 4, 2: 2, 1: 1}  # per confirmed-absent negative criterion


def calculate_evidence_score(
    normalized_criteria,
    item_config,
    normalized_dimensions,
    model_high_value_unknowns,
    model_risk_flags,
    normalized_ref_comp,
):
    """Evidence-first scorer for the new split-schema profiles.

    Positive criteria  → additive score (yes only).
    Negative criteria  → penalty when yes (confirmed present), small relief when no.
    High-value unknowns → confidence penalty based on how many remain unresolved.
    Risk flags         → flat penalty per flag reported by the model.
    Dimensions         → 45% weight (same inversion logic for hiddenRiskSuspicion).
    Reference comparison → ±5 modifier.
    Coverage           → floor for listings with mostly unknown answers.
    """
    pos_criteria = item_config.get("explicit_positive_criteria", [])
    neg_criteria = item_config.get("explicit_negative_criteria", [])
    all_criteria = pos_criteria + neg_criteria
    profile_hvunknowns = item_config.get("high_value_unknown_fields", [])

    # 1. Positive score (0-100)
    total_pos_weight = sum(
        _IMPORTANCE_PTS.get(c.get("importance_hint", "medium"), 2) for c in pos_criteria
    )
    earned_pos_weight = sum(
        _IMPORTANCE_PTS.get(c.get("importance_hint", "medium"), 2)
        for c in pos_criteria
        if normalized_criteria.get(c["id"], {}).get("value") == "yes"
    )
    pos_score = (earned_pos_weight / max(total_pos_weight, 1)) * 100

    # 2. Coverage factor (same as blended scorer)
    resolved = sum(
        1
        for c in all_criteria
        if normalized_criteria.get(c["id"], {}).get("value") in ("yes", "no")
    )
    coverage_ratio = resolved / max(len(all_criteria), 1)
    if coverage_ratio < 0.40:
        coverage_factor = 0.0
    else:
        coverage_factor = min(1.0, (coverage_ratio - 0.40) / 0.60)

    # 3. Negative penalty: confirmed-present bad things (0-35)
    neg_penalty = min(
        sum(
            _NEG_PENALTY_PTS.get(
                _IMPORTANCE_PTS.get(c.get("importance_hint", "medium"), 2), 7
            )
            for c in neg_criteria
            if normalized_criteria.get(c["id"], {}).get("value") == "yes"
        ),
        35,
    )

    # 4. Negative relief: confirmed-absent bad things (0-15)
    neg_relief = min(
        sum(
            _NEG_RELIEF_PTS.get(
                _IMPORTANCE_PTS.get(c.get("importance_hint", "medium"), 2), 2
            )
            for c in neg_criteria
            if normalized_criteria.get(c["id"], {}).get("value") == "no"
        ),
        15,
    )

    # 5. High-value unknowns confidence penalty (0-12)
    n_profile_hvu = len(profile_hvunknowns)
    n_model_hvu = (
        len(model_high_value_unknowns)
        if isinstance(model_high_value_unknowns, list)
        else 0
    )
    hvu_penalty = (
        round((n_model_hvu / max(n_profile_hvu, 1)) * 12) if n_profile_hvu > 0 else 0
    )
    hvu_penalty = min(hvu_penalty, 12)

    # 6. Risk flags penalty (0-15)
    n_flags = len(model_risk_flags) if isinstance(model_risk_flags, list) else 0
    risk_penalty = min(n_flags * 4, 15)

    # 7. Dimensions score (0-100) — same inversion as blended scorer
    expected_dims = [
        "trustworthiness",
        "transparency",
        "conditionConfidence",
        "documentationQuality",
        "hiddenRiskSuspicion",
        "marketAboveAverageSignal",
    ]
    dim_scores = []
    for dim_key in expected_dims:
        dim_data = normalized_dimensions.get(dim_key, {})
        raw = dim_data.get("score", 3) if isinstance(dim_data, dict) else 3
        try:
            raw = max(1, min(5, int(float(raw))))
        except (ValueError, TypeError):
            raw = 3
        effective = (6 - raw) if dim_key == "hiddenRiskSuspicion" else raw
        dim_scores.append(((effective - 1) / 4) * 100)
    dimensions_score = sum(dim_scores) / max(len(dim_scores), 1)

    # 8. Reference comparison modifier
    closer_to = (
        normalized_ref_comp.get("closer_to", "mixed")
        if isinstance(normalized_ref_comp, dict)
        else "mixed"
    )
    ref_mod = {"good": 5, "bad": -5, "mixed": 0}.get(closer_to, 0)

    # 9. Assemble: 55% positive evidence + 45% dimensions, then apply penalties
    base = 0.55 * pos_score + 0.45 * dimensions_score
    # Neg relief is added before penalties (confirmed safety is real positive signal)
    effective = base + 0.15 * neg_relief
    penalized = effective - neg_penalty - hvu_penalty - risk_penalty + ref_mod

    # Coverage floor: sparse listings collapse toward 35 instead of scoring on vague silence
    final = coverage_factor * penalized + (1.0 - coverage_factor) * 35.0
    final = max(0, min(100, round(final)))

    contributions = {
        "_pos_score": pos_score,
        "_dimensions_score": dimensions_score,
        "_neg_relief": neg_relief,
        "_neg_penalty": neg_penalty,
        "_hvu_penalty": hvu_penalty,
        "_risk_penalty": risk_penalty,
        "_ref_mod": ref_mod,
        "_coverage_factor": round(coverage_factor, 2),
    }
    return final, pos_score, dimensions_score, contributions


def process_unprocessed_listings(target_listing_id=None):
    """Finds all unprocessed listings (or a specific single listing), extracts attributes using OpenAI, and scores them"""
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Query listings that have a profile assigned and haven't been LLM processed
    if target_listing_id:
        cursor.execute(
            """
            SELECT l.id, l.title, l.detailed_description, l.details, l.search_id, k.item_json, k.expert_knowledge,
                   k.good_reference_description, k.bad_reference_description
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
            SELECT l.id, l.title, l.detailed_description, l.details, l.search_id, k.item_json, k.expert_knowledge,
                   k.good_reference_description, k.bad_reference_description
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
        details_text = ""
        try:
            details_obj = json.loads(listing["details"] or "{}")
            if details_obj:
                details_text = "\n".join(
                    [f"- {k}: {v}" for k, v in details_obj.items()]
                )
        except Exception as e:
            logger.warning(f"Failed to parse listing details for LLM prompt: {str(e)}")

        logger.info(f"Analyzing: {title} (ID: {listing_id})")

        try:
            item_config = json.loads(listing["item_json"] or "{}")
            # Support both old flat extraction_criteria and new split schema
            criteria_list = item_config.get("extraction_criteria") or item_config.get(
                "explicit_positive_criteria", []
            ) + item_config.get("explicit_negative_criteria", [])
            scoring_model = item_config.get("scoring_model", {})
        except Exception as e:
            logger.error(f"Error parsing item_json for listing {listing_id}: {str(e)}")
            continue

        # Check for legacy non-boolean criteria/weights in python
        is_legacy_profile = False
        legacy_details = []
        for c in criteria_list:
            if c.get("type") != "boolean":
                is_legacy_profile = True
                legacy_details.append(
                    f"Criterion '{c.get('id')}' has unsupported type '{c.get('type')}' (only 'boolean' is supported)."
                )

        weights = scoring_model.get("weights", {})
        for cid, w in weights.items():
            if w and not isinstance(w.get("satisfied_if"), bool):
                is_legacy_profile = True
                legacy_details.append(
                    f"Weight '{cid}' has unsupported satisfied_if value '{w.get('satisfied_if')}' (must be a boolean)."
                )

        if is_legacy_profile:
            err_msg = "; ".join(legacy_details)
            logger.error(
                f"Unsupported legacy profile for listing {listing_id}: {err_msg}"
            )

            facts_envelope = {
                "criteria": {},
                "highlights": [],
                "draft_message": "",
                "_full_info_obtained": False,
                "_unsupported_legacy_profile": True,
                "_legacy_error_details": f"Unsupported legacy profile: {err_msg}",
            }

            cursor.execute(
                """
                UPDATE listings 
                SET llm_processed = 1,
                    llm_processed_time = ?,
                    full_info_obtained = 0,
                    extracted_facts = ?,
                    niceness_score = 0,
                    status = 'Error'
                WHERE id = ?
            """,
                (
                    datetime.datetime.now().isoformat(),
                    json.dumps(facts_envelope),
                    listing_id,
                ),
            )
            conn.commit()
            continue

        item_json_str = listing["item_json"] or "{}"
        prompt = build_evaluation_prompt(
            title,
            details_text,
            description,
            item_json_str,
            listing["expert_knowledge"],
            good_reference_description=listing["good_reference_description"],
            bad_reference_description=listing["bad_reference_description"],
        )

        try:
            messages = [{"role": "user", "content": prompt}]

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

            initial_response_text = response_text
            retry_prompt_val = None
            retry_response_val = None
            initial_validation_errors = None

            extracted_data = extract_json_block(response_text)
            extracted_data = sanitize_extracted_data(extracted_data)
            validation_errors = (
                validate_extracted_data(extracted_data, criteria_list)
                if extracted_data
                else [
                    "Could not extract JSON block between START_JSON and END_JSON markers."
                ]
            )

            # Bounded One-Shot Retry
            if validation_errors:
                initial_validation_errors = list(validation_errors)
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
                retry_prompt_val = retry_prompt

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
                    retry_response_val = response_text
                    extracted_data = extract_json_block(response_text)
                    extracted_data = sanitize_extracted_data(extracted_data)
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

            high_value_unknowns = extracted_data.get("high_value_unknowns", [])
            if not isinstance(high_value_unknowns, list):
                high_value_unknowns = []

            risk_flags = extracted_data.get("risk_flags", [])
            if not isinstance(risk_flags, list):
                risk_flags = []

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

                evidence_quote = c_val.get("evidence_quote", "")
                if not isinstance(evidence_quote, str):
                    evidence_quote = (
                        str(evidence_quote) if evidence_quote is not None else ""
                    )

                reasoning = c_val.get("reasoning", "")
                if not isinstance(reasoning, str):
                    reasoning = str(reasoning) if reasoning is not None else ""

                normalized_criteria[cid] = {
                    "value": value,
                    "evidence_quote": evidence_quote,
                    "reasoning": reasoning,
                }

            # Parse dimensions
            dimensions_part = extracted_data.get("dimensions", {})
            if not isinstance(dimensions_part, dict):
                dimensions_part = {}

            expected_dims = [
                "trustworthiness",
                "transparency",
                "conditionConfidence",
                "documentationQuality",
                "hiddenRiskSuspicion",
                "marketAboveAverageSignal",
            ]
            normalized_dimensions = {}
            for dim_key in expected_dims:
                dim_data = dimensions_part.get(dim_key)
                raw_score = 3
                reasoning = ""
                if isinstance(dim_data, dict):
                    raw_score = dim_data.get("score", 3)
                    reasoning = dim_data.get("reasoning", "")
                elif isinstance(dim_data, (int, float)):
                    raw_score = dim_data

                try:
                    raw_score = int(float(raw_score))
                except (ValueError, TypeError):
                    raw_score = 3
                raw_score = max(1, min(5, raw_score))

                normalized_dimensions[dim_key] = {
                    "score": raw_score,
                    "reasoning": str(reasoning),
                }

            # Parse reference comparison
            ref_comp_part = extracted_data.get("reference_comparison", {})
            if not isinstance(ref_comp_part, dict):
                ref_comp_part = {}

            closer_to = ref_comp_part.get("closer_to", "mixed")
            if closer_to not in ["good", "bad", "mixed"]:
                closer_to = "mixed"
            ref_reasoning = ref_comp_part.get("reasoning", "")

            normalized_ref_comp = {
                "closer_to": closer_to,
                "reasoning": str(ref_reasoning),
            }

            # Score: route by schema type
            is_new_schema = bool(
                item_config.get("explicit_positive_criteria")
                or item_config.get("explicit_negative_criteria")
            )

            if is_new_schema:
                (
                    score,
                    criteria_score,
                    dimensions_score,
                    contributions,
                ) = calculate_evidence_score(
                    normalized_criteria,
                    item_config,
                    normalized_dimensions,
                    high_value_unknowns,
                    risk_flags,
                    normalized_ref_comp,
                )
            else:
                weights = scoring_model.get("weights", {})
                (
                    score,
                    criteria_score,
                    dimensions_score,
                    contributions,
                ) = calculate_blended_score(
                    normalized_criteria, weights, normalized_dimensions
                )

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
                "dimensions": normalized_dimensions,
                "reference_comparison": normalized_ref_comp,
                "highlights": highlights_part,
                "high_value_unknowns": high_value_unknowns,
                "risk_flags": risk_flags,
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

            log_listing_analysis(
                listing_id=listing_id,
                prompt=prompt,
                initial_response=initial_response_text,
                validation_errors=initial_validation_errors,
                retry_prompt=retry_prompt_val,
                retry_response=retry_response_val,
                parsed_json=facts_envelope,
                score_contributions=contributions,
                final_score=score,
            )

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
        try:
            log_outreach_draft(listing_id, prompt, draft_message)
        except Exception as log_err:
            logger.warning(
                f"Failed to log outreach draft for listing {listing_id}: {str(log_err)}"
            )
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
            dimensions = facts_envelope.get("dimensions", {})
            reference_comparison = facts_envelope.get("reference_comparison", {})
        else:
            facts = facts_envelope
            dimensions = {}
            reference_comparison = {}
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
        try:
            log_conversation_analysis(listing_id, prompt, response_text)
        except Exception as log_err:
            logger.warning(
                f"Failed to log conversation analysis for listing {listing_id}: {str(log_err)}"
            )
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
                        facts[k]["evidence_quote"] = "Clarified in chat conversation"
                        facts[k]["reasoning"] = f"Resolved via chat to: {val}."
                    else:
                        facts[k] = {
                            "value": val,
                            "evidence_quote": "Clarified in chat conversation",
                            "reasoning": f"Resolved via chat to: {val}.",
                        }
                    changes_made = True
                    logger.info(
                        f"Resolved unknown criterion '{k}' to '{val}' for listing {listing_id}"
                    )

        if changes_made:
            # Recalculate score using blended scoring: 65% criteria, 35% dimensions
            weights = scoring_model.get("weights", {})
            (
                score,
                criteria_score,
                dimensions_score,
                contributions,
            ) = calculate_blended_score(facts, weights, dimensions)

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
                    "dimensions": dimensions,
                    "reference_comparison": reference_comparison,
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
