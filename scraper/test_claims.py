"""Tests for knowledge claims and research bridge (P7).

Covers:
- Node path ancestors and inheritance order
- Claim expiry and TTLs
- Research value decision table (product-core section 5)
- Prompt shapes (hard frame, soft middle, output format)
- Parser robustness (brief response, classify response)
- URL source validation and verification
- Compact prompt formatting
- End-to-end fixture execution
"""

import datetime
import json
import sqlite3
import pytest

import claims
import db_schema
import profiles
import research_bridge


@pytest.fixture
def test_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db_schema.apply_schema(conn)
    conn.commit()
    yield conn
    conn.close()


# ---------------------------------------------------------------------------
# 1. Node path & inheritance order
# ---------------------------------------------------------------------------


def test_ancestors_resolution():
    assert claims.ancestors("motorrad/supersport/yamaha-r1/rn19") == [
        "motorrad/supersport/yamaha-r1",
        "motorrad/supersport",
        "motorrad",
    ]
    assert claims.ancestors("motorrad") == []
    assert claims.node_and_ancestors("motorrad/supersport") == [
        "motorrad/supersport",
        "motorrad",
    ]


def test_claims_inheritance_order(test_db):
    # Insert claim at root, intermediate, and leaf
    root_id = claims.insert_claim(
        test_db,
        "motorrad",
        {
            "kind": "check",
            "statement": "Reifenprofiltiefe und DOT-Nummer prüfen.",
            "sources": ["https://adac.de/motorradreifen"],
        },
        approved=True,
    )
    mid_id = claims.insert_claim(
        test_db,
        "motorrad/supersport/yamaha-r1",
        {
            "kind": "weakness",
            "statement": "Getriebeschäden im 2. Gang bei frühen Baujahren.",
            "sources": ["https://r1-forum.de/getriebe"],
        },
        approved=True,
    )
    leaf_id = claims.insert_claim(
        test_db,
        "motorrad/supersport/yamaha-r1/rn19",
        {
            "kind": "weakness",
            "statement": "Drosselklappenpotentiometer neigt zu Ausfällen.",
            "sources": ["https://r1-forum.de/tps"],
        },
        approved=True,
    )
    # Also insert an unapproved claim at leaf
    claims.insert_claim(
        test_db,
        "motorrad/supersport/yamaha-r1/rn19",
        {
            "kind": "check",
            "statement": "Unbestätigtes Gerücht über Ventilfedern.",
            "sources": ["https://forum.example.com"],
        },
        approved=False,
    )

    inherited = claims.claims_for(test_db, "motorrad/supersport/yamaha-r1/rn19")

    # Only approved claims returned
    assert len(inherited) == 3
    # Nearest ancestor (leaf) first, then parent, then root
    assert inherited[0]["id"] == leaf_id
    assert inherited[0]["node_key"] == "motorrad/supersport/yamaha-r1/rn19"
    assert inherited[1]["id"] == mid_id
    assert inherited[1]["node_key"] == "motorrad/supersport/yamaha-r1"
    assert inherited[2]["id"] == root_id
    assert inherited[2]["node_key"] == "motorrad"


# ---------------------------------------------------------------------------
# 2. Expiry and TTL
# ---------------------------------------------------------------------------


def test_claims_expiry(test_db):
    now = datetime.datetime.now(datetime.timezone.utc)
    past = (now - datetime.timedelta(days=400)).isoformat()

    # Expired claim
    test_db.execute(
        """INSERT INTO claims
               (node_key, kind, axis, statement, check_path, weight, sources, created_at, expires_at, approved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "motorrad",
            "good_terms",
            "",
            "Alter Suchbegriff",
            "text",
            "minor",
            json.dumps(["https://example.com"]),
            past,
            (now - datetime.timedelta(days=10)).isoformat(),
            1,
        ),
    )

    # Fresh claim
    claims.insert_claim(
        test_db,
        "motorrad",
        {
            "kind": "check",
            "statement": "Frischer Prüfpunkt",
            "sources": ["https://example.com/fresh"],
        },
        approved=True,
    )
    test_db.commit()

    active = claims.claims_for(test_db, "motorrad")
    assert len(active) == 1
    assert active[0]["statement"] == "Frischer Prüfpunkt"


# ---------------------------------------------------------------------------
# 3. Research value decision table (product-core section 5)
# ---------------------------------------------------------------------------


def test_research_value_decision_table():
    vehicle = profiles.PROFILES["vehicle"]
    perf_tech = profiles.PROFILES["performance_tech"]
    furniture = profiles.PROFILES["large_furniture"]
    wear = profiles.PROFILES["wear_device"]
    spec = profiles.PROFILES["spec"]

    # 1. Yamaha R1 (high price, high hidden, model dependent) -> deep
    assert claims.research_value(8000, vehicle) == "deep"

    # 2. Bean-to-cup machine (300 EUR, mid hidden, model dependent) -> shallow
    assert claims.research_value(300, wear) == "shallow"

    # 3. Mattress (200 EUR, not model dependent) -> category
    class DummyMattressProfile:
        hidden = 2
        model_dependent = False
        research = "category"

    assert claims.research_value(200, DummyMattressProfile()) == "category"

    # 4. RAM / spec (100 EUR, low hidden, not model dependent) -> none or profile
    assert claims.research_value(100, spec) == "none"

    # 5. Wardrobe / furniture (50 EUR, low hidden, not model dependent) -> none
    assert claims.research_value(50, furniture) == "none"


def test_needs_research_stops_when_node_has_claims(test_db):
    vehicle = profiles.PROFILES["vehicle"]
    node_key = "motorrad/supersport/yamaha-r1/rn19"

    # Without claims: research recommended
    level, _ = claims.needs_research(8000, vehicle, node_key=node_key, conn=test_db)
    assert level == "deep"

    # Add an approved claim
    claims.insert_claim(
        test_db,
        node_key,
        {
            "kind": "weakness",
            "statement": "Lichtmaschinenrotor",
            "sources": ["https://motorradonline.de/r1"],
        },
        approved=True,
    )

    # With claims: none needed
    level_after, reason = claims.needs_research(
        8000, vehicle, node_key=node_key, conn=test_db
    )
    assert level_after == "none"
    assert "already has" in reason


# ---------------------------------------------------------------------------
# 4. Prompt shapes & Profile Headings
# ---------------------------------------------------------------------------


def test_brief_prompt_shape():
    intent = {"text": "Yamaha R1 RN19 bis 8000 €", "musts": [{"label": "TÜV neu"}]}
    profile = profiles.PROFILES["vehicle"]
    market = {"median": 7500, "count": 28}

    prompt = research_bridge.build_brief_prompt(intent, profile, market, [])
    # Hard frame
    assert "Du bist ein Kaufberater" in prompt
    assert "REGELN:" in prompt
    # Soft middle
    assert "## Suchabsicht" in prompt
    assert "Yamaha R1 RN19" in prompt
    assert "TÜV neu" in prompt
    assert "## Profil: Fahrzeug" in prompt
    assert "## Markt" in prompt
    # Output format
    assert "## Ausgabeformat" in prompt
    assert "ENTSCHEIDUNG:" in prompt
    assert "WAS ZU WISSEN IST:" in prompt
    assert "SUCHAUFTRAG:" in prompt


def test_search_brief_headings():
    profile = profiles.PROFILES["vehicle"]
    what_to_know = ["Drosselklappen", "Lichtmaschine"]
    brief = research_bridge.build_search_brief(
        profile, what_to_know, "Recherchiere RN19", model_name="Yamaha R1"
    )

    # Hard frame & rules
    assert "Recherchiere gruendlich zu folgendem Gebrauchtprodukt" in brief
    assert "WICHTIG: Nenne zu jeder Aussage die vollstaendige URL der Quelle" in brief
    # Fixed headings per vehicle profile
    for heading in profile.research_headings:
        assert f"## {heading}" in brief


def test_classify_prompt_shape():
    prompt = research_bridge.build_classify_prompt(
        "Die RN19 hat Probleme mit dem TPS Sensor. Quelle: https://example.com/tps",
        "motorrad/supersport/yamaha-r1/rn19",
        profiles.PROFILES["vehicle"],
    )
    assert "Du bist ein Analyst fuer Gebrauchtware" in prompt
    assert "motorrad/supersport/yamaha-r1/rn19" in prompt
    assert "Ausgabeformat" in prompt
    assert '"kind":' in prompt
    assert '"statement":' in prompt


# ---------------------------------------------------------------------------
# 5. Parser robustness
# ---------------------------------------------------------------------------


def test_parse_brief_response():
    resp = (
        "ENTSCHEIDUNG: lohnt sich\n\n"
        "WAS ZU WISSEN IST:\n"
        "- Drosselklappensensor neigt zu Ausfällen\n"
        "- Ventilspielkontrolle bei 40.000 km ist sehr teuer\n"
        "- Lichtmaschinen-Rotor kann reißen\n\n"
        "SUCHAUFTRAG:\n"
        "Recherchiere die Zuverlässigkeit der Yamaha R1 RN19 mit Schwerpunkt auf Motor und Elektrik."
    )
    parsed = research_bridge.parse_brief_response(resp)
    assert parsed["decision"] == "lohnt sich"
    assert len(parsed["what_to_know"]) == 3
    assert "Drosselklappensensor" in parsed["what_to_know"][0]
    assert "Yamaha R1 RN19" in parsed["search_brief"]


def test_parse_brief_response_nicht_noetig():
    resp = "ENTSCHEIDUNG: nicht noetig\n\nWAS ZU WISSEN IST:\nSUCHAUFTRAG:"
    parsed = research_bridge.parse_brief_response(resp)
    assert parsed["decision"] == "nicht noetig"


def test_parse_classify_response():
    resp = """```json
    [
      {
        "kind": "weakness",
        "statement": "Lichtmaschinenrotor kann zerbrechen.",
        "check_path": "on_site",
        "weight": "costly",
        "sources": ["https://motorrad.de/yamaha-r1-dauertest"],
        "unsourced": false
      },
      {
        "kind": "seller_question",
        "statement": "Wurde das Ventilspiel bei 40.000 km eingestellt?",
        "check_path": "ask",
        "weight": "minor",
        "sources": [],
        "unsourced": true
      }
    ]
    ```"""
    claims_list = research_bridge.parse_classify_response(resp)
    assert len(claims_list) == 2
    assert claims_list[0]["kind"] == "weakness"
    assert claims_list[0]["sources"] == ["https://motorrad.de/yamaha-r1-dauertest"]
    assert claims_list[0]["unsourced"] is False

    assert claims_list[1]["kind"] == "seller_question"
    assert claims_list[1]["unsourced"] is True


# ---------------------------------------------------------------------------
# 6. URL source checking with fake checker
# ---------------------------------------------------------------------------


def test_validate_claim():
    valid = {
        "kind": "weakness",
        "statement": "Ölverbrauch erhöht",
        "sources": ["https://example.com/test"],
    }
    ok, _ = claims.validate_claim(valid)
    assert ok is True

    # No statement
    ok, err = claims.validate_claim(
        {"kind": "weakness", "sources": ["https://example.com"]}
    )
    assert ok is False and "statement" in err

    # Unknown kind
    ok, err = claims.validate_claim(
        {"kind": "invented", "statement": "foo", "sources": ["https://example.com"]}
    )
    assert ok is False and "recognised" in err

    # No valid URL
    ok, err = claims.validate_claim(
        {"kind": "weakness", "statement": "foo", "sources": ["Forum Post 123"]}
    )
    assert ok is False and "URL" in err


def test_verify_sources_with_fake_checker():
    lookup = {
        "https://alive.com": True,
        "https://dead.com": False,
    }

    def fake_checker(url):
        return lookup.get(url, None)

    claim_alive = {
        "kind": "check",
        "statement": "Alive source",
        "sources": ["https://alive.com"],
    }
    claim_dead = {
        "kind": "weakness",
        "statement": "Dead source",
        "sources": ["https://dead.com"],
    }
    claim_inconclusive = {
        "kind": "check",
        "statement": "Unknown source",
        "sources": ["https://flaky-server.com"],
    }

    kept, dropped = claims.verify_sources(
        [claim_alive, claim_dead, claim_inconclusive], fake_checker
    )

    assert len(kept) == 2
    assert kept[0]["statement"] == "Alive source"
    assert kept[1]["statement"] == "Unknown source"
    assert kept[1]["sources_unverified"] is True

    assert len(dropped) == 1
    assert dropped[0]["claim"]["statement"] == "Dead source"


# ---------------------------------------------------------------------------
# 7. Prompt claims compact formatting
# ---------------------------------------------------------------------------


def test_claims_for_prompt(test_db):
    claims.insert_claim(
        test_db,
        "motorrad/supersport/yamaha-r1",
        {
            "kind": "weakness",
            "statement": "Getriebeschaden 2. Gang",
            "check_path": "on_site",
            "weight": "costly",
            "sources": ["https://example.com"],
        },
        approved=True,
    )
    text = claims.claims_for_prompt(test_db, "motorrad/supersport/yamaha-r1")
    assert "Known facts about this product" in text
    assert "- weakness [costly]: Getriebeschaden 2. Gang (check: on_site)" in text
    # Sources are kept out of prompt to save token budget
    assert "https://example.com" not in text
