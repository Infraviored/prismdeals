#!/usr/bin/env python3
"""Usage: PYTHONPATH=scraper python scripts/resave_hunts.py

Re-save every hunt after dropping the model-made attributes: each condition's
attribute is defined again, its readers checked on real titles."""

import json
import db_schema
from graph import hunts

conn = db_schema.connect(db_schema.default_path())
conn.execute("DELETE FROM node_attributes WHERE source IN ('model', 'hunt')")
conn.commit()
ids = [
    r[0]
    for r in conn.execute("SELECT DISTINCT campaign_id FROM hunt_targets ORDER BY 1")
]
for cid in ids:
    camp = conn.execute(
        "SELECT name, intent_json, frame_json FROM campaigns WHERE id = ?", (cid,)
    ).fetchone()
    code = conn.execute(
        "SELECT n.category_code FROM hunt_targets t JOIN nodes n ON n.id = t.node_id WHERE t.campaign_id = ? LIMIT 1",
        (cid,),
    ).fetchone()[0]
    targets = [
        {"node_id": nid, "typed": typed, "conditions": []}
        for nid, typed in conn.execute(
            "SELECT node_id, typed FROM hunt_targets WHERE campaign_id = ? ORDER BY position",
            (cid,),
        )
    ]
    general = []
    for nid, label, op, value, imp in conn.execute(
        "SELECT node_id, label, op, value_json, importance FROM hunt_conditions WHERE campaign_id = ? ORDER BY id",
        (cid,),
    ):
        c = {
            "label": label,
            "op": op,
            "value": json.loads(value) if value else None,
            "importance": imp,
        }
        if nid is None:
            general.append(c)
        else:
            next(t for t in targets if t["node_id"] == nid)["conditions"].append(c)
    doc = {
        "name": camp[0],
        "text": json.loads(camp[1] or "{}").get("text", ""),
        "category_code": code,
        "frame": json.loads(camp[2]),
        "targets": targets,
        "conditions": general,
    }
    hunts.save(conn, doc, campaign_id=cid)
    print(cid, camp[0], "saved", flush=True)
for cid in ids:
    print(cid, hunts.refine(conn, cid), flush=True)
