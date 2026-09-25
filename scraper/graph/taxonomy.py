"""The graph's root layer from the Kleinanzeigen taxonomy (plan §3).

Every category becomes a node with its code; every attribute filter the site
offers for it ("Kilometerstand", "Erstzulassungsjahr", "Marke") becomes an
attribute of that node, read from the detail page and usable to narrow the
crawl. What the site does not filter (a RAM kit's CAS latency) is added by
placing a target (place.py). Idempotent: running it twice changes nothing.
"""

import json
import os

from . import store

TAXONOMY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "kleinanzeigen_taxonomy.json",
)

_TYPES = {"attribute_range": "number", "attribute_enum": "enum"}


def attr_id_for_filter(key):
    """ "motorraeder_roller.km_i" -> "km"."""
    name = key.split(".")[-1]
    for suffix in ("_i", "_s", "_b", "_d"):
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return name


def category_node_id(conn, category_code):
    row = conn.execute(
        "SELECT id FROM nodes WHERE kind = 'category' AND category_code = ? AND merged_into IS NULL",
        (str(category_code),),
    ).fetchone()
    return row[0] if row else None


def seed(conn, taxonomy_path=TAXONOMY_PATH):
    """Categories and their site filters. Returns counts."""
    with open(taxonomy_path, encoding="utf-8") as f:
        categories = json.load(f)["categories"]
    by_id = {c["id"]: c for c in categories}
    created = {}

    visiting = set()

    def ensure(category):
        if category["id"] in created:
            return created[category["id"]]
        visiting.add(category["id"])
        parent = by_id.get(category.get("parent_id") or "")
        # The taxonomy has a cycle (400 <-> 401, "Nachbarschaftshilfe"): a
        # parent already on the way up is no parent.
        if parent and parent["id"] in visiting:
            parent = None
        parent_node = ensure(parent) if parent else None
        node_id = store.create_node(
            conn,
            parent_node,
            "category",
            category["name"],
            "taxonomy",
            # The site's slugs repeat ("auto-rad-boot" is also a service
            # category): the path through the parents is unique.
            key=(f"{store.node(conn, parent_node)['key']}/" if parent_node else "")
            + category["slug"].split("/")[-1],
            category_code=str(category["id"]),
            status="confirmed",
        )
        created[category["id"]] = node_id
        visiting.discard(category["id"])
        return node_id

    attributes = 0
    for category in categories:
        node_id = ensure(category)
        store.add_alias(conn, node_id, category["name"], "name", "taxonomy")
        for flt in category.get("filters") or []:
            type_ = _TYPES.get(flt.get("type"))
            if not type_:
                continue  # price, seller type, ad type: the frame, not the product
            options = [o.get("value") for o in flt.get("options") or []] or None
            store.set_attribute(
                conn,
                node_id,
                attr_id_for_filter(flt["key"]),
                flt["label"],
                type_,
                [f"details:{flt['label']}"],
                "taxonomy",
                options=options,
                site_filter=flt["key"],
            )
            attributes += 1

    conn.commit()
    return {"categories": len(created), "attributes": attributes}
