"""Placing a target in the graph (plan §3): "Honda CBR 1000 RR SC59" -> node id.

Names first: a target whose folded text is already an alias in its category
is that node, free. Otherwise one model call returns where it belongs under
the category -- brand, model, generation with years, the names sellers use --
and which facts matter for this kind of product beyond what the site filters.
New nodes are `proposed` until the market names them (evidence.py).
"""

import re

from . import llm, store

KINDS = ("class", "brand", "family", "model", "generation", "config")
TYPES = ("number", "boolean", "enum", "text")

PROMPT = """Du ordnest ein Produkt in einen Produktbaum für Gebrauchtware ein.

Kategorie: {category} (Kleinanzeigen-Kategorie {code})
Vorhandene Merkmale der Kategorie: {attributes}
Produkt: {text}

Gib den Pfad UNTER der Kategorie zurück, vom Allgemeinen zum Genauen, so tief wie das
Produkt gemeint ist:
- kind: "class" (eine Art Ware: Ventilator, Kleiderschrank), "brand", "family" (Baureihe,
  Serie), "model", "generation" (Baureihe/Jahrgang eines Modells: RN19, SC59, Gen 3, Mk2),
  "config" (eine Ausstattung/Spezifikation: 2x16 GB DDR4-3200 CL16).
- Eine reine Klasse ("Ventilator") ist ein einzelner Knoten der Art "class".
- aliases: wie Verkäufer es in Anzeigentiteln schreiben (Schreibweisen, Codes, Spitznamen).
- years: [von, bis] für Modelle und Generationen, sonst weglassen.
- generations: beim Modell-Schritt ALLE Generationen dieses Modells (auch die nicht
  gesuchten), je {{"name", "years", "aliases"}} -- damit ein Angebot einer anderen Generation
  als solche erkannt wird.

Dazu 0 bis 6 Merkmale, die für GENAU diese Art Produkt beim Gebrauchtkauf zählen und
NICHT schon unter den vorhandenen Merkmalen sind. Je Merkmal:
- id (snake_case), label (deutsch), type ("number" | "boolean" | "enum" | "text"),
  unit (bei Zahlen), options (bei enum),
- readers: Liste, wie es aus Titel/Beschreibung gelesen wird:
  "number" (Zahl mit Einheit beim Label), "keywords:wort1|wort2" (genannt oder verneint),
  "regex:<Python-Regex mit genau einer Gruppe>" (z. B. "regex:\\\\bCL\\\\s?(\\\\d{{2}})\\\\b"),
- at: Index im Pfad, ab dem es gilt (0 = oberster Pfad-Knoten).

Antworte NUR mit JSON:
{{"path": [{{"name": "...", "kind": "...", "aliases": ["..."], "years": [2008, 2011],
             "generations": [{{"name": "...", "years": [2004, 2007], "aliases": ["..."]}}]}}],
  "attributes": [{{"id": "...", "label": "...", "type": "...", "unit": "...",
                   "readers": ["..."], "at": 0}}]}}
"""


class PlaceError(ValueError):
    pass


def _category(conn, category_code):
    row = conn.execute(
        "SELECT id FROM nodes WHERE kind = 'category' AND category_code = ? AND merged_into IS NULL",
        (str(category_code),),
    ).fetchone()
    if not row:
        raise PlaceError(f"Kategorie {category_code} ist nicht im Graphen.")
    return store.node(conn, row[0])


def find(conn, text, category_id):
    """The node in the category's subtree that the text names exactly, or None."""
    folded = store.fold(text)
    if not folded:
        return None
    subtree = store.subtree_ids(conn, category_id)
    marks = ",".join("?" for _ in subtree)
    rows = conn.execute(
        f"""SELECT n.id FROM nodes n JOIN node_aliases a ON a.node_id = n.id
             WHERE a.alias = ? AND n.id IN ({marks}) AND n.status != 'retired'""",
        (folded, *subtree),
    ).fetchall()
    if not rows:
        return None
    # The deepest of the matches: "sc59" under the CBR, not a brand of that name.
    return max((r[0] for r in rows), key=lambda i: len(store.ancestors(conn, i)))


def _clean_path(raw):
    path = []
    for step in raw.get("path") or []:
        name = str(step.get("name") or "").strip()
        kind = step.get("kind")
        if not name or kind not in KINDS:
            raise PlaceError(f"Ungültiger Pfad-Schritt: {step!r}")
        aliases = [str(a) for a in step.get("aliases") or [] if str(a).strip()]
        generations = [
            g for g in map(_clean_generation, step.get("generations") or []) if g
        ]
        path.append(
            {
                "name": name,
                "kind": kind,
                "aliases": aliases,
                "years": _years(step.get("years")),
                "generations": generations,
            }
        )
    if not path:
        raise PlaceError("Die KI hat keinen Pfad geliefert.")
    return path


def _years(value):
    if (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(y, int) for y in value)
    ):
        return value
    return None


def _clean_generation(raw):
    if not isinstance(raw, dict) or not str(raw.get("name") or "").strip():
        return None
    return {
        "name": str(raw["name"]).strip(),
        "years": _years(raw.get("years")),
        "aliases": [str(a) for a in raw.get("aliases") or [] if str(a).strip()],
    }


def _clean_attributes(raw, depth):
    out = []
    for attr in raw.get("attributes") or []:
        attr_id = store.slug(attr.get("id") or attr.get("label") or "").replace(
            "-", "_"
        )
        type_ = attr.get("type")
        readers = []
        for reader in attr.get("readers") or []:
            kind = str(reader).split(":", 1)[0]
            if kind not in ("number", "keywords", "regex"):
                continue
            if kind == "regex":
                try:
                    if re.compile(str(reader)[6:]).groups != 1:
                        continue
                except re.error:
                    continue
            readers.append(str(reader))
        if not attr_id or type_ not in TYPES or not readers:
            continue
        at = attr.get("at") if isinstance(attr.get("at"), int) else 0
        out.append(
            {
                "id": attr_id,
                "label": str(attr.get("label") or attr_id),
                "type": type_,
                "unit": attr.get("unit"),
                "options": attr.get("options")
                if isinstance(attr.get("options"), list)
                else None,
                "readers": readers,
                "at": min(max(at, 0), depth - 1),
            }
        )
    return out


def _aliases(name, parent_names):
    """The name as sellers write it: whole, and without the brand above it."""
    out = {name}
    for parent in parent_names:
        if name.lower().startswith(parent.lower() + " "):
            out.add(name[len(parent) + 1 :])
    return out


def place(conn, text, category_code, ask=llm.ask_json):
    """The node id for `text` in the category; creates what is missing."""
    category = _category(conn, category_code)
    known = find(conn, text, category["id"])
    if known:
        return known
    existing = store.effective_attributes(conn, category["id"])
    raw = ask(
        PROMPT.format(
            category=category["name"],
            code=category["category_code"],
            attributes=", ".join(
                f"{a['label']} ({i})" for i, a in sorted(existing.items())
            )
            or "keine",
            text=text,
        )
    )
    path = _clean_path(raw)
    # A fact the category already has under another id is not a new one
    # ("kilometerstand" beside the site's "km" labelled "Kilometerstand").
    taken = {store.fold(a["label"]) for a in existing.values()} | {
        store.fold(i) for i in existing
    }
    attributes = [
        a
        for a in _clean_attributes(raw, len(path))
        if store.fold(a["label"]) not in taken and store.fold(a["id"]) not in taken
    ]
    parent_id, names, ids = category["id"], [], []
    for step in path:
        node_id = store.create_node(
            conn,
            parent_id,
            step["kind"],
            step["name"],
            "model",
            years_from=(step["years"] or [None, None])[0],
            years_to=(step["years"] or [None, None])[1],
        )
        for alias in _aliases(step["name"], names) | set(step["aliases"]):
            store.add_alias(conn, node_id, alias, "name", "model")
        # Every generation of a model, the wanted one or not: an offer of
        # another generation is then recognised as that one.
        for generation in step["generations"]:
            child = store.create_node(
                conn,
                node_id,
                "generation",
                generation["name"],
                "model",
                years_from=(generation["years"] or [None, None])[0],
                years_to=(generation["years"] or [None, None])[1],
            )
            for alias in {generation["name"], *generation["aliases"]}:
                store.add_alias(conn, child, alias, "code", "model")
        names.append(step["name"])
        ids.append(node_id)
        parent_id = node_id
    for attr in attributes:
        store.set_attribute(
            conn,
            ids[attr["at"]],
            attr["id"],
            attr["label"],
            attr["type"],
            attr["readers"],
            "model",
            unit=attr["unit"],
            options=attr["options"],
        )
    # The typed text names the target too ("Honda CBR 1000 RR SC59").
    store.add_alias(conn, ids[-1], text, "name", "user")
    conn.commit()
    return ids[-1]


def describe(conn, node_id):
    """The node as a hunt shows it: its name path, years, key.

    A name that already contains the one above it stands for both ("CBR" ->
    "CBR 1000 RR" reads "Honda CBR 1000 RR", not "Honda CBR CBR 1000 RR").
    """
    chain = store.ancestors(conn, node_id)
    target = chain[-1]
    parts = []
    for n in chain:
        if n["kind"] in ("category", "class"):
            continue
        if parts and n["name"].lower().startswith(parts[-1].lower()):
            parts[-1] = n["name"]
        else:
            parts.append(n["name"])
    return {
        "id": target["id"],
        "key": target["key"],
        "name": " ".join(parts) or target["name"],
        "kind": target["kind"],
        "status": target["status"],
        "years": [target["years_from"], target["years_to"]]
        if target["years_from"]
        else None,
        "category_code": target["category_code"],
        "path": [n["name"] for n in chain],
    }
