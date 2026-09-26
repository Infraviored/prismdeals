"""A hunt changed in words: the answer checked, nodes kept, changes computed."""

import pytest

import hunt_edit

BEFORE = {
    "name": "Supersportler",
    "category_code": "305",
    "frame": {"max_price": 9000, "radius_km": 200, "location_id": 6411},
    "targets": [
        {"node_id": 7, "typed": "CBR", "name": "Honda CBR 1000 RR", "conditions": []},
        {"node_id": 9, "typed": "R1", "name": "Yamaha R1", "conditions": []},
    ],
    "conditions": [],
}


def test_a_constraint_for_one_target_lands_on_that_target():
    def answer(prompt):
        assert "nur SC59" in prompt and "node_id" not in prompt
        return {
            "name": "Supersportler",
            "max_price": 9000,
            "radius_km": 200,
            "targets": [
                {
                    "name": "Honda CBR 1000 RR SC59",
                    "conditions": [
                        {
                            "label": "Kilometerstand",
                            "op": "max",
                            "value": "5.000",
                            "importance": "must",
                        }
                    ],
                },
                {"name": "Yamaha R1", "conditions": []},
            ],
            "conditions": [],
        }

    after, changes = hunt_edit.edit(
        BEFORE, "nur SC59 bei der CBR, unter 5000 km", ask=answer
    )
    cbr, r1 = after["targets"]
    # A renamed target is placed anew; an unchanged one keeps its node.
    assert "node_id" not in cbr and cbr["typed"] == "Honda CBR 1000 RR SC59"
    assert r1["node_id"] == 9
    assert cbr["conditions"] == [
        {"label": "Kilometerstand", "op": "max", "value": 5000, "importance": "must"}
    ]
    assert after["frame"]["location_id"] == 6411 and after["category_code"] == "305"
    assert changes == [
        "Ziel: Honda CBR 1000 RR → Honda CBR 1000 RR SC59",
        "Honda CBR 1000 RR SC59: Kilometerstand bis 5000 (Muss)",
    ]


def test_what_cannot_be_judged_is_dropped():
    answer = {
        "name": "x",
        "targets": [
            {
                "name": "Yamaha R1",
                "conditions": [{"label": "Farbe", "op": "schön", "importance": "must"}],
            }
        ],
        "conditions": [{"label": "ABS", "op": "present", "importance": "wish"}],
    }
    after, _ = hunt_edit.edit(BEFORE, "egal", ask=lambda p: answer)
    assert after["targets"][0]["conditions"] == []
    assert after["conditions"] == [
        {"label": "ABS", "op": "present", "value": None, "importance": "wish"}
    ]


def test_a_reply_without_targets_is_refused():
    with pytest.raises(ValueError):
        hunt_edit.edit(BEFORE, "alles weg", ask=lambda p: {"targets": []})


def test_numbers_with_units_are_read_and_what_is_dropped_is_said():
    answer = {
        "name": "Supersportler",
        "max_price": "9.500 €",
        "radius_km": "150 km",
        "targets": [
            {
                "name": "Honda CBR 1000 RR",
                "conditions": [
                    {
                        "label": "Kilometerstand",
                        "op": "max",
                        "value": "5000 km",
                        "importance": "must",
                    },
                    {"label": "Farbe", "op": "schön", "importance": "must"},
                ],
            },
            {"name": "Yamaha R1", "conditions": []},
        ],
        "conditions": [],
    }
    after, changes = hunt_edit.edit(BEFORE, "unter 5000 km", ask=lambda p: answer)
    assert after["frame"]["max_price"] == 9500 and after["frame"]["radius_km"] == 150
    assert after["targets"][0]["conditions"] == [
        {"label": "Kilometerstand", "op": "max", "value": 5000, "importance": "must"}
    ]
    assert "nicht übernommen: Farbe" in changes


def test_a_malformed_reply_is_refused_not_a_crash():
    for answer in (
        {"targets": ["Yamaha R1"]},
        {"targets": "Yamaha R1"},
        {"targets": [{"name": "Yamaha R1"}], "max_price": "viel"},
    ):
        with pytest.raises(ValueError):
            hunt_edit.edit(BEFORE, "x", ask=lambda p: answer)
