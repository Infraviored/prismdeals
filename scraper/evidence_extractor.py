import json
import re
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


class EvidenceExtractor:
    """EvidenceExtractor Module

    A deep module that encapsulates parsing, sanitizing, and validating
    raw model text responses. It isolates these concerns from agent orchestration.
    """

    def extract(
        self, response_text: str, criteria_list: List[Dict[str, Any]]
    ) -> Tuple[Optional[Dict[str, Any]], List[str]]:
        """Extract, sanitize, and validate structured facts from LLM text responses.

        Args:
            response_text: The raw string response from the LLM model.
            criteria_list: List of criteria definitions containing 'id' to validate presence.

        Returns:
            A tuple of (sanitized_data, validation_errors).
            If JSON parsing fails entirely, sanitized_data is None.
        """
        extracted = self.extract_json_block(response_text)
        if not extracted:
            return None, ["Failed to parse any valid JSON block from response"]

        sanitized = self.sanitize_extracted_data(extracted)
        errors = self.validate_extracted_data(sanitized, criteria_list)
        return sanitized, errors

    def extract_json_block(self, text: str) -> Optional[Dict[str, Any]]:
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

    def sanitize_extracted_data(self, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
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

    def validate_extracted_data(
        self, extracted_data: Dict[str, Any], criteria_list: List[Dict[str, Any]]
    ) -> List[str]:
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
