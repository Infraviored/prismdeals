"""Tests for model proposals and hallucination guard (Package P5).

Asserts:
  - Hallucination guard pure function logic (drops models with 0 title hits after 2 probes)
  - 30-day caching in class_models table
  - Probe counts and title hits database updates
  - Narrow probe_models interface raising NotImplementedError
"""

import datetime
import os
import sqlite3
import sys
import tempfile

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_CURRENT_DIR)
if _CURRENT_DIR not in sys.path:
    sys.path.insert(0, _CURRENT_DIR)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

from model_proposals import (
    apply_hallucination_guard,
    get_cached_proposals,
    make_node_key,
    propose_models,
    save_proposals,
    update_probe_counts,
)


def test_title_tokens_find_the_model_the_way_sellers_write_it():
    from model_probe import title_matches, title_tokens

    r1 = title_tokens("Yamaha YZF-R1")
    assert title_matches("Yamaha R1 RN19 2008 top Zustand", r1)
    assert not title_matches("Yamaha MT-07 wenig km", r1)
    cbr = title_tokens("Honda CBR1000RR Fireblade")
    assert title_matches("Honda CBR 1000 RR SC57", cbr)
    assert not title_matches("Honda Fireblade 900", cbr)


def test_probe_models_counts_title_hits_and_median_offline():
    from model_probe import probe_models

    page = open(
        __import__("os").path.join(
            __import__("os").path.dirname(__file__), "testdata", "model_probe_page.html"
        ),
        encoding="utf-8",
    ).read()

    class Response:
        status_code = 200
        text = page

    out = probe_models(
        ["Yamaha YZF-R1"], {"category_code": "c305"}, fetch_fn=lambda url: Response()
    )
    assert out["Yamaha YZF-R1"]["title_hits"] == 2
    assert (
        out["Yamaha YZF-R1"]["median"] == 52
    )  # 60 and 45; the MT-07 at 100 is not an R1


def test_no_model_answer_means_no_proposals_and_nothing_cached(tmp_path):
    db = str(tmp_path / "p.db")
    assert propose_models("1000cc supersport", offline=True, db_path=db) == []
    import sqlite3

    import db_schema

    conn = sqlite3.connect(db)
    db_schema.apply_schema(conn)
    assert conn.execute("SELECT COUNT(*) FROM class_models").fetchone()[0] == 0


def test_hallucination_guard_pure_function():
    """Pure function drops models never seen in titles after 2 probes."""
    history = {
        "Yamaha R1": {"probe_count": 0, "title_hits": 0},
        "Honda CBR1000RR": {"probe_count": 0, "title_hits": 0},
        "Fantasy 1000 GT": {"probe_count": 0, "title_hits": 0},
    }

    # First probe: Yamaha and Honda get hits; Fantasy gets 0 hits
    probe_run_1 = {
        "Yamaha R1": {"total": 50, "title_hits": 35},
        "Honda CBR1000RR": {"total": 40, "title_hits": 28},
        "Fantasy 1000 GT": {"total": 0, "title_hits": 0},
    }

    surviving_1, dropped_1 = apply_hallucination_guard(history, probe_run_1)
    # After 1 probe, Fantasy has probe_count=1, title_hits=0 -> still survives
    assert len(dropped_1) == 0
    assert "Fantasy 1000 GT" in surviving_1
    assert surviving_1["Fantasy 1000 GT"]["probe_count"] == 1
    assert surviving_1["Fantasy 1000 GT"]["title_hits"] == 0

    # Second probe: Fantasy gets 0 hits again
    probe_run_2 = {
        "Yamaha R1": {"total": 52, "title_hits": 38},
        "Honda CBR1000RR": {"total": 41, "title_hits": 30},
        "Fantasy 1000 GT": {"total": 0, "title_hits": 0},
    }

    surviving_2, dropped_2 = apply_hallucination_guard(surviving_1, probe_run_2)
    # After 2 probes with 0 hits, Fantasy must be dropped!
    assert "Fantasy 1000 GT" in dropped_2
    assert "Fantasy 1000 GT" not in surviving_2

    # Yamaha and Honda survive with cumulative stats
    assert "Yamaha R1" in surviving_2
    assert surviving_2["Yamaha R1"]["probe_count"] == 2
    assert surviving_2["Yamaha R1"]["title_hits"] == 73


def test_model_proposals_caching_and_ttl():
    """Proposals are cached in class_models for 30 days."""
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
        db_path = tmp.name

        node_key = make_node_key("305", "1000cc Supersportler")
        assert node_key == "305:1000cc-supersportler"

        # 1. Initially uncached
        assert get_cached_proposals(node_key, db_path=db_path) is None

        # 2. Save proposals
        synthetic_models = [
            {"model": "Yamaha YZF-R1", "years": "2004-2008"},
            {"model": "Honda CBR1000RR", "years": "2004-2007"},
            {"model": "Suzuki GSX-R 1000", "years": "2003-2006"},
            {"model": "Kawasaki Ninja ZX-10R", "years": "2004-2007"},
            {"model": "Aprilia RSV 1000 R", "years": "2004-2008"},
            {"model": "Ducati 999", "years": "2003-2006"},
        ]
        save_proposals(node_key, synthetic_models, db_path=db_path)

        # 3. Read back from cache
        cached = get_cached_proposals(node_key, db_path=db_path)
        assert cached is not None
        assert len(cached) == 6
        assert {m["model"] for m in cached} == {m["model"] for m in synthetic_models}

        # 4. Propose models returns cached without calling model
        result = propose_models(
            "1000cc Supersportler",
            budget=7000,
            category="305",
            db_path=db_path,
        )
        assert len(result) == 6

        # 5. Simulate 31-day expiration in DB
        conn = sqlite3.connect(db_path)
        expired_date = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=31)
        ).isoformat()
        conn.execute(
            "UPDATE class_models SET proposed_at = ? WHERE node_key = ?",
            (expired_date, node_key),
        )
        conn.commit()
        conn.close()

        # Cache check should now return None (expired)
        assert get_cached_proposals(node_key, db_path=db_path) is None


def test_update_probe_counts_filters_hallucinated_models():
    """DB probe updates track counts and exclude dropped models from cache."""
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
        db_path = tmp.name
        node_key = make_node_key("305", "1000cc Supersportler")

        models = [
            {"model": "Yamaha YZF-R1", "years": "2004-2008"},
            {"model": "Honda CBR1000RR", "years": "2004-2007"},
            {"model": "Suzuki GSX-R 1000", "years": "2003-2006"},
            {"model": "Kawasaki Ninja ZX-10R", "years": "2004-2007"},
            {"model": "Aprilia RSV 1000 R", "years": "2004-2008"},
            {"model": "FakeGhostModel 1000", "years": "2005-2007"},
        ]
        save_proposals(node_key, models, db_path=db_path)

        # Probe 1: FakeGhostModel gets 0 hits
        update_probe_counts(
            node_key,
            {
                "Yamaha YZF-R1": {"total": 10, "title_hits": 5},
                "FakeGhostModel 1000": {"total": 0, "title_hits": 0},
            },
            db_path=db_path,
        )
        cached_1 = get_cached_proposals(node_key, db_path=db_path)
        assert any(m["model"] == "FakeGhostModel 1000" for m in cached_1)

        # Probe 2: FakeGhostModel gets 0 hits again -> dropped
        surviving, dropped = update_probe_counts(
            node_key,
            {
                "Yamaha YZF-R1": {"total": 12, "title_hits": 6},
                "FakeGhostModel 1000": {"total": 0, "title_hits": 0},
            },
            db_path=db_path,
        )
        assert "FakeGhostModel 1000" in dropped

        cached_2 = get_cached_proposals(node_key, db_path=db_path)
        assert not any(m["model"] == "FakeGhostModel 1000" for m in cached_2)
        assert len(cached_2) == 5
