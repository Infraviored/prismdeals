"""Signals: what varies between the offers of a product and matters to a buyer
(docs/plan-signals.md §4).

After a hunt has found enough offers, one model call reads a sample of them at
the targets' common node and names what sets them apart -- "Rennstrecke" for
motorcycles, "OVP" for RAM, "Nichtraucher" for mattresses -- with a direction
(plus, minus, or a value to show) and a starting weight. Each becomes an
attribute through `place.define_attributes`, so its readers are checked on
real titles first; the frequency is read from the same offers. Stored per node
in `node_signals`: the next hunt for the same product gets them without a call.
"""

import datetime

from . import facts, hunts, llm, place, readers, store

# Enough offers to say what varies; how many the model reads; when to ask again.
MIN_OFFERS = 20
SAMPLE = 60
FRESH_DAYS = 30

PROMPT = """Hier sind Gebrauchtangebote für: {product}

{offers}

Was unterscheidet diese Angebote und ändert, was ein Käufer zahlen würde oder ob er es
will? Nenne 5 bis 12 Merkmale, die in mehreren Angeboten vorkommen, keine, die jedes
Angebot hat, keine Selbstverständlichkeiten. label: 1 bis 3 Wörter, wie ein Käufer es
sagt ("Unfallschaden", "OVP", "Nur Abholung"), keine Aufzählungen mit Schrägstrich.
- kind "yesno": genannt oder nicht (Unfallschaden, OVP, Scheckheft, Nichtraucher),
  mit polarity "plus" (wäre schön) oder "minus" (stört) und weight 1 bis 3 (wie sehr);
- kind "value": ein Wert, der zum Vergleichen gezeigt werden soll (Kilometerstand,
  Speicher, Größe), polarity "value", weight 0.

Antworte NUR mit JSON:
{{"signals": [{{"label": "...", "kind": "yesno|value", "polarity": "plus|minus|value",
               "weight": 2}}]}}
"""


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _offers(conn, node_id):
    """The newest offers resolved at or below the node, as listings."""
    ids = store.subtree_ids(conn, node_id)
    rows = conn.execute(
        f"""SELECT r.listing_id FROM listing_resolution r JOIN listings l ON l.id = r.listing_id
             WHERE r.node_id IN ({",".join("?" for _ in ids)}) AND r.method != 'rejected'
             ORDER BY l.id DESC LIMIT ?""",
        (*ids, SAMPLE),
    ).fetchall()
    return [x for x in (facts._listing(conn, r[0]) for r in rows) if x]


def _fresh(conn, node_id, offers):
    row = conn.execute(
        "SELECT MIN(proposed_at), MAX(total) FROM node_signals WHERE node_id = ?",
        (node_id,),
    ).fetchone()
    if not row or not row[0]:
        return False
    age = _now() - datetime.datetime.fromisoformat(row[0])
    # Asked again once the market it was read from has doubled, or grown old.
    return age.days < FRESH_DAYS and len(offers) < 2 * row[1]


def _clean(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get("signals"), list):
        raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {raw!r}")
    out = []
    for s in raw["signals"]:
        if not isinstance(s, dict):
            raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {s!r}")
        label = str(s.get("label") or "").strip()
        kind, polarity, weight = s.get("kind"), s.get("polarity"), s.get("weight")
        valid = (
            label
            and (kind, polarity)
            in (("yesno", "plus"), ("yesno", "minus"), ("value", "value"))
            and isinstance(weight, int)
            and not isinstance(weight, bool)
            and 0 <= weight <= 3
        )
        if not valid:
            raise llm.NoModel(f"Die KI hat ein unbrauchbares Merkmal genannt: {s!r}")
        out.append(
            {"label": label, "kind": kind, "polarity": polarity, "weight": weight}
        )
    return out


def propose(conn, campaign_id, ask=llm.ask_json):
    """Signals for the hunt's targets' common node; [] while too few offers, the
    stored ones while fresh. Returns [{attr_id, polarity, default_weight, found, total}]."""
    node_id = hunts._common_ancestor(conn, hunts.target_ids(conn, campaign_id))
    if node_id is None:
        return []
    offers = _offers(conn, node_id)
    if len(offers) < MIN_OFFERS:
        return []
    if not _fresh(conn, node_id, offers):
        _propose(conn, node_id, offers, ask)
    return [
        dict(zip(("attr_id", "polarity", "default_weight", "found", "total"), r))
        for r in conn.execute(
            """SELECT attr_id, polarity, default_weight, found, total FROM node_signals
                WHERE node_id = ? ORDER BY found DESC""",
            (node_id,),
        ).fetchall()
    ]


def _propose(conn, node_id, offers, ask):
    raw = ask(
        PROMPT.format(
            product=place.describe(conn, node_id)["name"]
            or store.node(conn, node_id)["name"],
            offers="\n".join(
                f"- {o['title']} | {' '.join(o['description'].split())[:300]}"
                for o in offers
            ),
        ),
        max_tokens=3000,
    )
    wanted = _clean(raw)
    hints = {
        s["label"]: "present" if s["kind"] == "yesno" else "einen Wert zeigen"
        for s in wanted
    }
    defined = place.define_attributes(
        conn, node_id, [s["label"] for s in wanted], ask=ask, hints=hints
    )
    attributes = store.effective_attributes(conn, node_id)
    now = _now().isoformat()
    conn.execute("DELETE FROM node_signals WHERE node_id = ?", (node_id,))
    for s in wanted:
        attr_id = defined.get(s["label"])
        if not attr_id or attr_id not in attributes:
            continue  # its readers misread real titles: not proposed
        attribute = attributes[attr_id]
        found = 0
        for offer in offers:
            read = readers.read(attribute, offer)
            if read is not None and (s["kind"] == "value" or read[0] is True):
                found += 1
        if not found:
            continue  # nobody states it: nothing to weigh
        conn.execute(
            """INSERT OR REPLACE INTO node_signals
                   (node_id, attr_id, polarity, default_weight, found, total, proposed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                node_id,
                attr_id,
                s["polarity"],
                -s["weight"] if s["polarity"] == "minus" else s["weight"],
                found,
                len(offers),
                now,
            ),
        )
    conn.commit()
