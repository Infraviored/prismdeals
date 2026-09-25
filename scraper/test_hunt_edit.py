import json

import pytest

import hunt_edit

BEFORE = {
    "name": "Yamaha R1 / Honda CBR 1000 RR",
    "max_price": 7000,
    "radius_km": 200,
    "models": [
        {"name": "Yamaha R1 RN19", "requirements": []},
        {"name": "Honda CBR 1000 RR", "requirements": []},
    ],
    "requirements": [
        {
            "id": "own_abs",
            "label": "ABS",
            "importance": "low",
            "own": True,
            "buyer_wants": {"present": True},
        },
    ],
}


def _reply(after):
    return lambda prompt: "```json\n" + json.dumps(after) + "\n```"


def test_a_constraint_for_one_model_lands_on_that_model():
    after = json.loads(json.dumps(BEFORE))
    after["models"][1] = {
        "name": "Honda CBR 1000 RR SC59",
        "requirements": [
            {
                "label": "Kilometerstand km",
                "importance": "high",
                "buyer_wants": {"max": "5.000"},
            }
        ],
    }
    doc, found = hunt_edit.edit(
        BEFORE, "CBR nur SC59, unter 5000 km", ask=_reply(after)
    )
    cbr = doc["models"][1]
    assert cbr["name"] == "Honda CBR 1000 RR SC59"
    assert cbr["requirements"][0]["buyer_wants"] == {"max": 5000}
    assert cbr["requirements"][0]["id"] == "own_kilometerstand_km"
    assert doc["models"][0]["requirements"] == []
    assert "Modell: Honda CBR 1000 RR → Honda CBR 1000 RR SC59" in found
    assert not any("entfernt" in f for f in found)
    assert "Honda CBR 1000 RR SC59: Kilometerstand km bis 5000 (Muss)" in found
    assert not any("ABS" in f for f in found)


def test_what_scoring_cannot_read_is_dropped():
    after = json.loads(json.dumps(BEFORE))
    after["requirements"].append({"label": "Farbe", "buyer_wants": {"colour": "rot"}})
    doc, _ = hunt_edit.edit(BEFORE, "rot", ask=_reply(after))
    assert [r["label"] for r in doc["requirements"]] == ["ABS"]


def test_a_reply_without_models_is_refused():
    after = dict(BEFORE, models=[])
    with pytest.raises(ValueError):
        hunt_edit.edit(BEFORE, "alles weg", ask=_reply(after))


def test_no_model_answer_says_so():
    with pytest.raises(ValueError, match="nicht erreichbar"):
        hunt_edit.edit(BEFORE, "x", ask=lambda prompt: None)
