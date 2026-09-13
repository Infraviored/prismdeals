"""Regression tests for A-1: update_all_descriptions_session loop indentation."""

import ast
import os
import sqlite3
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))


def test_ast_loop_contains_update_statements():
    """The loop body must not be dedented out of the for loop.

    AST inspection verifies for idx, r in enumerate(rows): contains the update
    statements and detailed_description assignment.
    """
    scraper_py = os.path.join(HERE, "scraper.py")
    with open(scraper_py, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read())

    func = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef)
        and n.name == "update_all_descriptions_session"
    ][0]
    with_node = [n for n in ast.walk(func) if isinstance(n, ast.With)][0]
    for_node = [n for n in with_node.body if isinstance(n, ast.For)][0]

    assign_targets = [
        t.id
        for stmt in for_node.body
        if isinstance(stmt, ast.Assign)
        for t in stmt.targets
        if isinstance(t, ast.Name)
    ]
    assert "detailed_description" in assign_targets, (
        "detailed_description assignment must be inside the for loop body"
    )
    assert len(with_node.body) == 1, "for loop must be the sole child of the with block"


@pytest.fixture
def db(tmp_path, monkeypatch):
    import scraper

    path = tmp_path / "t.db"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE searches (
            id INTEGER PRIMARY KEY, campaign_id INTEGER, url TEXT, enabled INTEGER
        );
        CREATE TABLE listings (
            id TEXT PRIMARY KEY, url TEXT, title TEXT, search_id INTEGER,
            detailed_description TEXT, details TEXT, images TEXT,
            full_info_obtained INTEGER DEFAULT 0,
            last_description_changed_at TEXT
        );
        INSERT INTO searches VALUES (1, 1, 'http://test', 1);
        INSERT INTO listings VALUES ('item-1', 'http://test/1', 'Item 1', 1, 'old 1', '{}', '[]', 1, '2026-01-01');
        INSERT INTO listings VALUES ('item-2', 'http://test/2', 'Item 2', 1, 'old 2', '{}', '[]', 1, '2026-01-01');
        INSERT INTO listings VALUES ('item-3', 'http://test/3', 'Item 3', 1, 'old 3', '{}', '[]', 1, '2026-01-01');
    """)
    conn.commit()
    conn.close()
    monkeypatch.setattr(scraper.db_schema, "default_path", lambda: str(path))
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_LISTINGS", 0)
    return path


def test_update_all_updates_every_listing(db, monkeypatch):
    """Mock parsing and verify all N listings in DB get updated, not just the last one."""
    import scraper

    def fake_parse(url, session=None):
        num = url.split("/")[-1]
        return {
            "detailed_description": f"new description {num}",
            "details": {"key": f"val{num}"},
            "images": [f"img{num}.jpg"],
        }

    monkeypatch.setattr(scraper, "parse_listing_details_requests", fake_parse)
    scraper.update_all_descriptions_session(campaign_id=1)

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, detailed_description FROM listings ORDER BY id"
    ).fetchall()
    assert len(rows) == 3
    assert rows[0]["detailed_description"] == "new description 1"
    assert rows[1]["detailed_description"] == "new description 2"
    assert rows[2]["detailed_description"] == "new description 3"


def test_update_all_zero_rows_does_not_raise(tmp_path, monkeypatch):
    """When 0 listings match, no UnboundLocalError occurs."""
    import scraper

    path = tmp_path / "empty.db"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE searches (
            id INTEGER PRIMARY KEY, campaign_id INTEGER, url TEXT, enabled INTEGER
        );
        CREATE TABLE listings (
            id TEXT PRIMARY KEY, url TEXT, title TEXT, search_id INTEGER,
            detailed_description TEXT, details TEXT, images TEXT,
            full_info_obtained INTEGER DEFAULT 0,
            last_description_changed_at TEXT
        );
    """)
    conn.commit()
    conn.close()
    monkeypatch.setattr(scraper.db_schema, "default_path", lambda: str(path))
    scraper.update_all_descriptions_session(campaign_id=1)
