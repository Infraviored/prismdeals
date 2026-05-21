import unittest
import sys
import os

# Ensure the parent directory or current directory is in the path to import scoring
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from scoring import (  # noqa: E402
    is_satisfied,
    calculate_blended_score,
    calculate_evidence_score,
    score_listing,
    ScoringResult,
)


class TestScoringEngine(unittest.TestCase):
    def test_is_satisfied(self):
        # 1. Exact boolean / string combinations
        self.assertTrue(is_satisfied("yes", True))
        self.assertTrue(is_satisfied("no", False))
        self.assertFalse(is_satisfied("unknown", True))
        # Silence is not safe: unknown should NEVER satisfy risk flags/criteria
        self.assertFalse(is_satisfied("unknown", False))
        self.assertFalse(is_satisfied("yes", False))
        self.assertFalse(is_satisfied("no", True))

        # 2. String/boolean variations
        self.assertTrue(is_satisfied("Ja", True))
        self.assertTrue(is_satisfied("nein", False))
        self.assertTrue(is_satisfied("true", True))
        self.assertTrue(is_satisfied("false", False))

        # 3. Numeric matches
        self.assertTrue(is_satisfied(1, 1))
        self.assertTrue(is_satisfied("1", 1))
        self.assertTrue(is_satisfied("yes", 1))
        self.assertFalse(is_satisfied("no", 1))
        self.assertFalse(is_satisfied("unknown", 1))
        self.assertFalse(is_satisfied("yes", 0))
        self.assertTrue(is_satisfied("no", 0))

        # 4. Non-matching types & empty/None handling
        self.assertFalse(is_satisfied("yes", "different"))
        self.assertFalse(is_satisfied(None, True))
        self.assertFalse(is_satisfied("yes", None))

    def test_legacy_blended_scoring_perfect(self):
        # Blended score: 65% criteria, 35% dimensions
        criteria = {"c1": {"value": "yes"}, "c2": {"value": "no"}}
        weights = {
            "c1": {"importance": 3, "satisfied_if": True},
            "c2": {"importance": 2, "satisfied_if": False},
        }
        # Max dimensions (all 5) -> hiddenRiskSuspicion is inverted, so score of 1 means high, but wait:
        # dim_key == "hiddenRiskSuspicion" -> 6 - raw_score. So raw_score = 1 gives effective score = 5 (max!).
        # other keys -> raw_score = 5 gives effective score = 5 (max!).
        dimensions = {
            "trustworthiness": {"score": 5},
            "transparency": {"score": 5},
            "conditionConfidence": {"score": 5},
            "documentationQuality": {"score": 5},
            "hiddenRiskSuspicion": {"score": 1},
            "marketAboveAverageSignal": {"score": 5},
        }

        (
            score,
            criteria_score,
            dimensions_score,
            contributions,
        ) = calculate_blended_score(criteria, weights, dimensions)

        self.assertEqual(criteria_score, 100.0)
        self.assertEqual(dimensions_score, 100.0)
        self.assertEqual(score, 100)

    def test_legacy_blended_scoring_coverage_penalty(self):
        # Only 1 out of 3 criteria resolved -> coverage = 33.3%, factor = 33.3% / 60% = 0.55
        criteria = {
            "c1": {"value": "yes"},
            "c2": {"value": "unknown"},
            "c3": {"value": "unknown"},
        }
        weights = {
            "c1": {"importance": 1, "satisfied_if": True},
            "c2": {"importance": 1, "satisfied_if": True},
            "c3": {"importance": 1, "satisfied_if": True},
        }
        dimensions = {
            "trustworthiness": {"score": 3},
            "transparency": {"score": 3},
            "conditionConfidence": {"score": 3},
            "documentationQuality": {"score": 3},
            "hiddenRiskSuspicion": {"score": 3},
            "marketAboveAverageSignal": {"score": 3},
        }

        (
            score,
            criteria_score,
            dimensions_score,
            contributions,
        ) = calculate_blended_score(criteria, weights, dimensions)

        self.assertAlmostEqual(criteria_score, 33.33, places=1)
        self.assertEqual(dimensions_score, 50.0)
        self.assertEqual(score, 44)

    def test_evidence_scoring_math(self):
        item_config = {
            "explicit_positive_criteria": [
                {"id": "p1", "importance_hint": "high"},  # weight 3
                {"id": "p2", "importance_hint": "medium"},  # weight 2
            ],
            "explicit_negative_criteria": [
                {
                    "id": "n1",
                    "importance_hint": "medium",
                },  # weight 2 (penalty 7, relief 2)
                {
                    "id": "n2",
                    "importance_hint": "low",
                },  # weight 1 (penalty 3, relief 1)
            ],
            "high_value_unknown_fields": ["hvu1", "hvu2"],
        }

        # 1. Base run: 100% positive criteria met, negative criteria absent, no risk flags, no missing HVU
        normalized_criteria = {
            "p1": {"value": "yes"},
            "p2": {"value": "yes"},
            "n1": {"value": "no"},
            "n2": {"value": "no"},
        }
        dimensions = {
            "trustworthiness": {"score": 4},  # (4-1)/4 = 75
            "transparency": {"score": 4},  # 75
            "conditionConfidence": {"score": 4},  # 75
            "documentationQuality": {"score": 4},  # 75
            "hiddenRiskSuspicion": {"score": 2},  # 6-2 = 4 -> 75
            "marketAboveAverageSignal": {"score": 4},  # 75
        }

        score, pos_score, dim_score, contrib = calculate_evidence_score(
            normalized_criteria=normalized_criteria,
            item_config=item_config,
            normalized_dimensions=dimensions,
            model_high_value_unknowns=[],
            model_risk_flags=[],
            normalized_ref_comp={"closer_to": "mixed"},
        )

        self.assertEqual(pos_score, 100.0)
        self.assertEqual(dim_score, 75.0)
        self.assertEqual(contrib["_neg_relief"], 3)  # n1: 2, n2: 1 = 3
        self.assertEqual(contrib["_neg_penalty"], 0)
        self.assertEqual(contrib["_hvu_penalty"], 0)
        self.assertEqual(contrib["_risk_penalty"], 0)

        # base score = 0.45 * 100 + 0.55 * 75 = 45 + 41.25 = 86.25
        # plus 0.15 * neg_relief = 0.45 -> 86.7
        # score = 87
        self.assertEqual(score, 87)

    def test_evidence_scoring_penalties(self):
        item_config = {
            "explicit_positive_criteria": [{"id": "p1", "importance_hint": "high"}],
            "explicit_negative_criteria": [
                {
                    "id": "n1",
                    "importance_hint": "high",
                }  # weight 3 (penalty 12, relief 4)
            ],
            "high_value_unknown_fields": ["hvu1", "hvu2"],
        }

        # Positive criterion met, but negative criterion present, 1 risk flag, 1 model HVU
        normalized_criteria = {"p1": {"value": "yes"}, "n1": {"value": "yes"}}
        dimensions = {
            "trustworthiness": {"score": 3},
            "transparency": {"score": 3},
            "conditionConfidence": {"score": 3},
            "documentationQuality": {"score": 3},
            "hiddenRiskSuspicion": {"score": 3},
            "marketAboveAverageSignal": {"score": 3},
        }

        score, pos_score, dim_score, contrib = calculate_evidence_score(
            normalized_criteria=normalized_criteria,
            item_config=item_config,
            normalized_dimensions=dimensions,
            model_high_value_unknowns=["hvu1"],
            model_risk_flags=["alarm1"],
            normalized_ref_comp={"closer_to": "bad"},  # ref_mod = -5
        )

        self.assertEqual(pos_score, 100.0)
        self.assertEqual(dim_score, 50.0)
        self.assertEqual(contrib["_neg_penalty"], 12)
        self.assertEqual(
            contrib["_hvu_penalty"], 1
        )  # hvu_ratio = 1/2 = 0.5 -> round(0.5 * 2) = 1
        self.assertEqual(contrib["_risk_penalty"], 1)  # 1 flag * 1 = 1
        self.assertEqual(contrib["_ref_mod"], 0)

        # base = 0.45 * 100 + 0.55 * 50 = 45 + 27.5 = 72.5
        # penalized = 72.5 - 12 - 1 - 1 + 0 = 58.5
        # coverage: resolved 2/2 -> 100% -> coverage_factor = 1.0
        # final = 58 (rounds 58.5 to nearest even, which is 58)
        self.assertEqual(score, 58)

    def test_score_listing_routing(self):
        # Test that score_listing automatically routes based on schema config
        legacy_config = {
            "scoring_model": {
                "weights": {"c1": {"importance": 1, "satisfied_if": True}}
            }
        }
        legacy_facts = {"criteria": {"c1": {"value": "yes"}}, "dimensions": {}}

        res_legacy = score_listing(legacy_facts, legacy_config)
        self.assertIsInstance(res_legacy, ScoringResult)
        self.assertFalse(res_legacy.is_new_schema)

        # New config with multiple criteria to test coverage floor
        new_config = {
            "explicit_positive_criteria": [
                {"id": "p1"},
                {"id": "p2"},
                {"id": "p3"},
                {"id": "p4"},
                {"id": "p5"},
            ]
        }
        new_facts = {
            "criteria": {
                "p1": {"value": "yes"},
                "p2": {"value": "unknown"},
                "p3": {"value": "unknown"},
                "p4": {"value": "unknown"},
                "p5": {"value": "unknown"},
            },
            "dimensions": {},
        }

        # Coverage: resolved 1/5 -> coverage_ratio = 0.20 -> coverage_factor = 0.333
        # Since it is unknown-heavy, it should default heavily toward 50.0 floor
        res_new = score_listing(new_facts, new_config)
        self.assertTrue(res_new.is_new_schema)
        # raw blended = 0.45 * 20 + 0.55 * 50 = 9 + 27.5 = 36.5
        # final = 0.333 * 36.5 + 0.667 * 50 = 12.16 + 33.33 = 45.5 -> 46
        self.assertEqual(res_new.score, 46)


if __name__ == "__main__":
    unittest.main()
