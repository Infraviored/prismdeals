"""A listing's facts, read once (plan §4).

For the listing's node: every attribute it has or inherits, by its readers,
plus every attribute the detail page states even where no node asks for it
yet, plus whether it is a request ("Suche …"). Re-read only when the listing's
text or its node's attributes changed. A model node whose generations have
years is resolved further by the listing's year, and read again there.
"""

import hashlib
import json

from . import readers, resolve, store


def _listing(conn, listing_id):
    row = conn.execute(
        """SELECT id, title, url, COALESCE(detailed_description, short_description, ''), details
             FROM listings WHERE id = ?""",
        (str(listing_id),),
    ).fetchone()
    if not row:
        return None
    try:
        details = json.loads(row[4]) if row[4] else {}
    except ValueError:
        details = {}
    return {
        "id": row[0],
        "title": row[1] or "",
        "url": row[2] or "",
        "description": row[3] or "",
        "details": details if isinstance(details, dict) else {},
    }


def _hash(listing, attributes):
    signature = json.dumps(
        [
            listing["title"],
            listing["description"],
            listing["details"],
            sorted(attributes.items(), key=str),
        ],
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(signature.encode("utf-8")).hexdigest()[:24]


def _read(listing, attributes):
    """{attr_id: (value, source, quote)} for one node's attributes."""
    out = {
        attr_id: (value, "details", quote)
        for attr_id, (value, quote) in readers.detail_facts(listing["details"]).items()
    }
    for attr_id, attribute in attributes.items():
        found = readers.read(attribute, listing)
        if found is not None:
            out[attr_id] = found
    out["is_request"] = (resolve.is_request(listing["title"]), "title", None)
    return out


def _store(conn, listing_id, facts, text_hash):
    conn.execute("DELETE FROM listing_facts WHERE listing_id = ?", (str(listing_id),))
    now = store.now()
    conn.executemany(
        """INSERT INTO listing_facts (listing_id, attr_id, value_json, source, quote,
                                      text_hash, extracted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                str(listing_id),
                attr_id,
                json.dumps(value, ensure_ascii=False),
                source,
                quote,
                text_hash,
                now,
            )
            for attr_id, (value, source, quote) in facts.items()
        ],
    )


def facts_of(conn, listing_id):
    """{attr_id: value} as stored."""
    return {
        attr_id: json.loads(value)
        for attr_id, value in conn.execute(
            "SELECT attr_id, value_json FROM listing_facts WHERE listing_id = ?",
            (str(listing_id),),
        ).fetchall()
    }


def process(conn, listing_id, prior=()):
    """Resolve the listing and read its facts. Returns the node id (or None)."""
    listing = _listing(conn, listing_id)
    if not listing:
        return None
    node_id, confidence, method = resolve.resolve(conn, listing, prior)
    if node_id is None:
        return None
    # The model placed it once: names that know less do not undo that.
    asked = conn.execute(
        "SELECT node_id FROM listing_resolution WHERE listing_id = ? AND method = 'model'",
        (str(listing_id),),
    ).fetchone()
    if asked and len(store.ancestors(conn, asked[0])) >= len(
        store.ancestors(conn, node_id)
    ):
        node_id, confidence, method = asked[0], 0.8, "model"
    attributes = store.effective_attributes(conn, node_id)
    facts = _read(listing, attributes)
    # A model whose generations have years: the listing's year names one.
    deeper = resolve.by_years(
        conn, node_id, resolve.year_of({k: v[0] for k, v in facts.items()})
    )
    if deeper:
        node_id, method = deeper, "years"
        attributes = store.effective_attributes(conn, node_id)
        facts = _read(listing, attributes)
    resolve.store_resolution(conn, listing_id, node_id, confidence, method)
    text_hash = _hash(listing, attributes)
    stored = conn.execute(
        "SELECT text_hash FROM listing_facts WHERE listing_id = ? LIMIT 1",
        (str(listing_id),),
    ).fetchone()
    if not stored or stored[0] != text_hash:
        _store(conn, listing_id, facts, text_hash)
    return node_id
