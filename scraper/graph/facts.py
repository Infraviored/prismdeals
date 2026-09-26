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
        """SELECT id, title, url, COALESCE(detailed_description, short_description, ''), details,
                  price_eur
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
        "price": row[5],
    }


def _hash(listing, attributes, named=()):
    signature = json.dumps(
        [
            listing["title"],
            listing["description"],
            listing["details"],
            listing.get("price"),
            sorted(attributes.items(), key=str),
            list(named),
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
    out["is_swap"] = (
        resolve.is_swap(listing["title"], listing.get("price")),
        "title",
        None,
    )
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


def _class_named(conn, category_id, art):
    for child in store.children(conn, category_id):
        if child["kind"] == "class" and store.fold(art) in store.aliases(
            conn, child["id"]
        ):
            return child["id"]
    return None


def _named_kinds(conn, listing, node_id):
    """The kinds of goods of its category the title names ("Haibike SDURO
    Trekking" names "Trekking"): brand and kind are separate things, and the
    node a listing sits at holds only one of them."""
    category = next(
        n["id"]
        for n in reversed(store.ancestors(conn, node_id))
        if n["kind"] == "category"
    )
    keys = resolve.title_keys(listing["title"])
    return sorted(
        i
        for i in store.subtree_ids(conn, category)
        if store.node(conn, i)["kind"] == "class" and keys & set(store.aliases(conn, i))
    )


def process(conn, listing_id, prior=()):
    """Resolve the listing and read its facts. Returns the node id (or None)."""
    listing = _listing(conn, listing_id)
    if not listing:
        return None
    node_id, confidence, method = resolve.resolve(conn, listing, prior)
    if node_id is None:
        return None
    # The model placed it once, or said it is no product of this kind (an
    # accessory, a spare part): names that know less do not undo that.
    asked = conn.execute(
        """SELECT node_id, method FROM listing_resolution
            WHERE listing_id = ? AND method IN ('model', 'rejected')""",
        (str(listing_id),),
    ).fetchone()
    if asked and (
        asked[1] == "rejected"
        or len(store.ancestors(conn, asked[0])) >= len(store.ancestors(conn, node_id))
    ):
        node_id, confidence, method = asked[0], 0.8, asked[1]
    attributes = store.effective_attributes(conn, node_id)
    facts = _read(listing, attributes)
    # The page's own "Art" names a kind of goods the category holds: a
    # listing filed under "Matratzen" is a Matratze, whatever its title says.
    # Neither moves a listing the model said is no product of this kind.
    rejected = method == "rejected"
    art = store.art_attr_id(attributes)
    if (
        not rejected
        and store.node(conn, node_id)["kind"] == "category"
        and art
        and facts.get(art)
    ):
        kind = _class_named(conn, node_id, facts[art][0])
        if kind:
            node_id, confidence, method = kind, 0.8, "art"
            attributes = store.effective_attributes(conn, node_id)
            facts = _read(listing, attributes)
    # A model whose generations have years: the listing's year names one.
    year = resolve.year_of({k: v[0] for k, v in facts.items()})
    deeper = not rejected and resolve.by_years(conn, node_id, year)
    # A named generation the year contradicts, with a sibling the year fits:
    # "SC59, Facelift" from 2013 is the SC59 Facelift, which shares its code.
    node = store.node(conn, node_id)
    if not rejected and not deeper and node["kind"] == "generation" and year:
        to = node["years_to"] or 9999
        if node["years_from"] and not node["years_from"] <= year <= to + 1:
            sibling = resolve.by_years(conn, node["parent_id"], year)
            if sibling and sibling != node_id:
                deeper = sibling
    if deeper:
        node_id, method = deeper, "years"
        attributes = store.effective_attributes(conn, node_id)
        facts = _read(listing, attributes)
    resolve.store_resolution(conn, listing_id, node_id, confidence, method)
    named = _named_kinds(conn, listing, node_id)
    if named:
        facts["named_kinds"] = (named, "title", None)
    text_hash = _hash(listing, attributes, named)
    stored = conn.execute(
        "SELECT text_hash FROM listing_facts WHERE listing_id = ? LIMIT 1",
        (str(listing_id),),
    ).fetchone()
    if not stored or stored[0] != text_hash:
        _store(conn, listing_id, facts, text_hash)
    return node_id
