import unittest
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from evidence_extractor import EvidenceExtractor


class TestEvidenceExtractor(unittest.TestCase):
    def setUp(self):
        self.extractor = EvidenceExtractor()

    def test_extract_json_block_markers(self):
        text = 'Some random LLM chat preamble\nSTART_JSON\n{\n  "criteria": {}\n}\nEND_JSON\npostamble'
        res = self.extractor.extract_json_block(text)
        self.assertIsNotNone(res)
        self.assertEqual(res["criteria"], {})

    def test_extract_json_block_backticks(self):
        text = 'Preamble\n```json\n{\n  "criteria": {"c1": "yes"}\n}\n```\nPostamble'
        res = self.extractor.extract_json_block(text)
        self.assertIsNotNone(res)
        self.assertEqual(res["criteria"]["c1"], "yes")

    def test_sanitize_highlights(self):
        raw_data = {
            "highlights": [
                {
                    "label": "New tires in 2025",
                    "kind": "tires",
                    "evidence_quote": "Reifen neu 2025",
                },
                {
                    "label": "Scratched exhaust",
                    "type": "scratch",
                    "evidence_quote": "Auspuff verkratzt",
                },
                {"label": "Upgraded suspension", "kind": "mod"},
            ]
        }
        sanitized = self.extractor.sanitize_extracted_data(raw_data)
        highlights = sanitized["highlights"]
        self.assertEqual(len(highlights), 3)

        # First highlight (maintenance)
        self.assertEqual(highlights[0]["type"], "maintenance")
        self.assertEqual(highlights[0]["sentiment"], "neutral")
        self.assertEqual(highlights[0]["evidence_quote"], "Reifen neu 2025")

        # Second highlight (warning)
        self.assertEqual(highlights[1]["type"], "warning")
        self.assertEqual(highlights[1]["sentiment"], "negative")

        # Third highlight (feature)
        self.assertEqual(highlights[2]["type"], "feature")
        self.assertEqual(highlights[2]["sentiment"], "positive")

    def test_validate_extracted_data(self):
        criteria_list = [{"id": "c1"}, {"id": "c2"}]

        # Valid payload
        valid_data = {"criteria": {"c1": "yes", "c2": "no"}}
        errors = self.extractor.validate_extracted_data(valid_data, criteria_list)
        self.assertEqual(len(errors), 0)

        # Invalid payload (missing key)
        invalid_data = {"criteria": {"c1": "yes"}}
        errors = self.extractor.validate_extracted_data(invalid_data, criteria_list)
        self.assertEqual(len(errors), 1)
        self.assertIn("Missing required criterion ID in 'criteria': 'c2'", errors[0])

    def test_extract_unified(self):
        text = '```json\n{\n  "criteria": {"c1": "yes", "c2": "no"},\n  "highlights": [{"label": "tüv", "kind": "tüv"}]\n}\n```'
        criteria_list = [{"id": "c1"}, {"id": "c2"}]
        data, errors = self.extractor.extract(text, criteria_list)
        self.assertIsNotNone(data)
        self.assertEqual(len(errors), 0)
        self.assertEqual(data["criteria"]["c1"], "yes")
        self.assertEqual(data["highlights"][0]["type"], "maintenance")


if __name__ == "__main__":
    unittest.main()
