"""The product graph: nodes, aliases, attributes (docs/plan-product-graph.md §2.1).

The one writer of the graph tables. Everything refers to nodes by id; the
`key` path is derived from the ancestors and exists for people and logs.
"""

import datetime
import json
import re

KINDS = ("category", "class", "brand", "family", "model", "generation", "config")
STATUSES = ("proposed", "confirmed", "retired")

_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def words(text):
    """Folded words: lowercase, umlauts spelled out, anything else a break."""
    return [
        w
        for w in re.split(r"[^a-z0-9]+", str(text or "").lower().translate(_UMLAUTS))
        if w
    ]


def fold(text):
    """The one alias form: folded words glued ("CBR 1000 RR" -> "cbr1000rr")."""
    return "".join(words(text))


def slug(text):
    return "-".join(words(text)) or "x"


def _row(cursor_row, columns):
    return dict(zip(columns, cursor_row)) if cursor_row else None


_NODE_COLUMNS = (
    "id",
    "parent_id",
    "kind",
    "key",
    "name",
    "category_code",
    "years_from",
    "years_to",
    "status",
    "merged_into",
    "evidence_json",
    "source",
    "created_at",
    "confirmed_at",
)


def node(conn, node_id):
    """The node, following merges, or None."""
    for _ in range(10):
        row = _row(
            conn.execute(
                f"SELECT {', '.join(_NODE_COLUMNS)} FROM nodes WHERE id = ?", (node_id,)
            ).fetchone(),
            _NODE_COLUMNS,
        )
        if not row or not row["merged_into"]:
            return row
        node_id = row["merged_into"]
    raise ValueError(f"merge chain too long at node {node_id}")


def by_key(conn, key):
    row = conn.execute("SELECT id FROM nodes WHERE key = ?", (key,)).fetchone()
    return node(conn, row[0]) if row else None


def children(conn, node_id):
    rows = conn.execute(
        f"SELECT {', '.join(_NODE_COLUMNS)} FROM nodes "
        "WHERE parent_id = ? AND merged_into IS NULL ORDER BY name",
        (node_id,),
    ).fetchall()
    return [_row(r, _NODE_COLUMNS) for r in rows]


def ancestors(conn, node_id):
    """The node and everything above it, root first."""
    chain = []
    current = node(conn, node_id)
    while current:
        chain.append(current)
        current = node(conn, current["parent_id"]) if current["parent_id"] else None
    return list(reversed(chain))


def subtree_ids(conn, node_id):
    """The node and everything below it."""
    rows = conn.execute(
        """WITH RECURSIVE sub(id) AS (
               SELECT ? UNION ALL
               SELECT n.id FROM nodes n JOIN sub ON n.parent_id = sub.id
                WHERE n.merged_into IS NULL)
           SELECT id FROM sub""",
        (node_id,),
    ).fetchall()
    return [r[0] for r in rows]


def create_node(conn, parent_id, kind, name, source, **fields):
    """A new node under `parent_id`, or the existing one with the same key."""
    if kind not in KINDS:
        raise ValueError(f"unknown node kind {kind!r}")
    parent = node(conn, parent_id) if parent_id else None
    key = fields.get("key") or (
        f"{parent['key']}/{slug(name)}" if parent else slug(name)
    )
    existing = by_key(conn, key)
    if existing:
        return existing["id"]
    category_code = fields.get("category_code") or (parent or {}).get("category_code")
    cursor = conn.execute(
        """INSERT INTO nodes (parent_id, kind, key, name, category_code, years_from,
                              years_to, status, evidence_json, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)""",
        (
            parent["id"] if parent else None,
            kind,
            key,
            name,
            category_code,
            fields.get("years_from"),
            fields.get("years_to"),
            fields.get("status", "proposed"),
            source,
            now(),
        ),
    )
    return cursor.lastrowid


def add_alias(conn, node_id, alias, kind, source):
    """Record a name for the node; returns the folded alias ('' when empty)."""
    folded = fold(alias)
    if not folded:
        return ""
    conn.execute(
        "INSERT OR IGNORE INTO node_aliases (node_id, alias, kind, source) VALUES (?, ?, ?, ?)",
        (node_id, folded, kind, source),
    )
    return folded


def aliases(conn, node_id):
    return [
        r[0]
        for r in conn.execute(
            "SELECT alias FROM node_aliases WHERE node_id = ? ORDER BY length(alias) DESC",
            (node_id,),
        ).fetchall()
    ]


READER_KINDS = ("details", "number", "keywords", "regex")


def set_attribute(conn, node_id, attr_id, label, type_, readers, source, **fields):
    """An attribute of the node, read by `readers` in order ("details:Kilometerstand",
    "number", "keywords:abs", "regex:\\bcl\\s?(\\d{2})\\b")."""
    if type_ not in ("number", "boolean", "enum", "text"):
        raise ValueError(f"unknown attribute type {type_!r}")
    for reader in readers:
        if reader.split(":", 1)[0] not in READER_KINDS:
            raise ValueError(f"unknown reader {reader!r}")
    conn.execute(
        """INSERT INTO node_attributes (node_id, attr_id, label, type, unit, options_json,
                                        readers_json, site_filter, absent_json, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(node_id, attr_id) DO UPDATE SET
               label = excluded.label, type = excluded.type, unit = excluded.unit,
               options_json = excluded.options_json, readers_json = excluded.readers_json,
               site_filter = excluded.site_filter, absent_json = excluded.absent_json""",
        (
            node_id,
            attr_id,
            label,
            type_,
            fields.get("unit"),
            json.dumps(fields["options"], ensure_ascii=False)
            if fields.get("options")
            else None,
            json.dumps(list(readers), ensure_ascii=False),
            fields.get("site_filter"),
            json.dumps(fields["absent"]) if "absent" in fields else None,
            source,
        ),
    )


_ATTR_COLUMNS = (
    "node_id",
    "attr_id",
    "label",
    "type",
    "unit",
    "options_json",
    "readers_json",
    "site_filter",
    "absent_json",
    "source",
)


def effective_attributes(conn, node_id):
    """{attr_id: attribute} over the node and its ancestors; the deeper one wins."""
    out = {}
    for ancestor in ancestors(conn, node_id):
        for row in conn.execute(
            f"SELECT {', '.join(_ATTR_COLUMNS)} FROM node_attributes WHERE node_id = ?",
            (ancestor["id"],),
        ).fetchall():
            attr = dict(zip(_ATTR_COLUMNS, row))
            attr["options"] = json.loads(attr.pop("options_json") or "null")
            attr["readers"] = json.loads(attr.pop("readers_json"))
            absent = attr.pop("absent_json")
            attr["absent"] = json.loads(absent) if absent is not None else None
            out[attr["attr_id"]] = attr
    return out


def confirm(conn, node_id, evidence):
    """The market names this node: it is real now."""
    current = node(conn, node_id)
    merged = {**json.loads(current["evidence_json"] or "{}"), **evidence}
    conn.execute(
        """UPDATE nodes SET status = 'confirmed', evidence_json = ?,
                  confirmed_at = COALESCE(confirmed_at, ?)
            WHERE id = ?""",
        (json.dumps(merged, ensure_ascii=False), now(), current["id"]),
    )


def merge(conn, from_id, into_id):
    """`from_id` is the same product as `into_id`; its names and children move."""
    if from_id == into_id:
        return
    conn.execute(
        "UPDATE OR IGNORE node_aliases SET node_id = ? WHERE node_id = ?",
        (into_id, from_id),
    )
    conn.execute("DELETE FROM node_aliases WHERE node_id = ?", (from_id,))
    conn.execute(
        "UPDATE nodes SET parent_id = ? WHERE parent_id = ?", (into_id, from_id)
    )
    conn.execute(
        "UPDATE listing_resolution SET node_id = ? WHERE node_id = ?",
        (into_id, from_id),
    )
    conn.execute("UPDATE nodes SET merged_into = ? WHERE id = ?", (into_id, from_id))
