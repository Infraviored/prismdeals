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
    found = [r[0] for r in rows]
    if not found:
        # "Honda CBR 1000 RR" is the model's name with its brand: no single
        # alias, but the name the graph gives the node.
        found = [
            i
            for i in subtree
            if store.node(conn, i)["kind"] != "category"
            and store.fold(describe(conn, i)["name"]) == folded
        ]
    if not found:
        return None
    # The deepest of the matches: "sc59" under the CBR, not a brand of that name.
    return max(found, key=lambda i: len(store.ancestors(conn, i)))


def _list(value, what):
    """A list the model gave, or none; anything else is not an answer."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar ({what}: {value!r}).")
    return value


def _names(value):
    """Aliases as the model gave them: a list of names, or one name."""
    if isinstance(value, str):
        value = [value]
    return [str(a) for a in _list(value, "aliases") if str(a).strip()]


def _clean_path(raw):
    if not isinstance(raw, dict):
        raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {raw!r}")
    path = []
    for step in _list(raw.get("path"), "path"):
        if not isinstance(step, dict):
            raise llm.NoModel(f"Ungültiger Pfad-Schritt: {step!r}")
        name = str(step.get("name") or "").strip()
        kind = step.get("kind")
        if not name or kind not in KINDS:
            raise PlaceError(f"Ungültiger Pfad-Schritt: {step!r}")
        path.append(
            {
                "name": name,
                "kind": kind,
                "aliases": _names(step.get("aliases")),
                "years": _years(step.get("years")),
                "generations": [
                    _clean_generation(g)
                    for g in _list(step.get("generations"), "generations")
                ],
            }
        )
    if not path:
        raise PlaceError("Die KI hat keinen Pfad geliefert.")
    return path


def _years(value):
    """[from, to] -- `to` null for what is still built (the current generation)
    -- or None when the model gives no years."""
    if value is None:
        return None
    if (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], int)
        and not isinstance(value[0], bool)
        and (
            value[1] is None
            or (
                isinstance(value[1], int)
                and not isinstance(value[1], bool)
                and value[1] >= value[0]
            )
        )
    ):
        return value
    raise llm.NoModel(f"Die KI hat unbrauchbare Jahre geliefert: {value!r}")


def _clean_generation(raw):
    if not isinstance(raw, dict) or not str(raw.get("name") or "").strip():
        raise llm.NoModel(f"Ungültige Generation: {raw!r}")
    return {
        "name": str(raw["name"]).strip(),
        "years": _years(raw.get("years")),
        "aliases": _names(raw.get("aliases")),
    }


def _clean_attributes(raw, depth):
    out = []
    for attr in _list(raw.get("attributes"), "attributes"):
        if not isinstance(attr, dict):
            raise llm.NoModel(f"Ungültiges Merkmal: {attr!r}")
        attr_id = store.slug(attr.get("id") or attr.get("label") or "").replace(
            "-", "_"
        )
        type_ = attr.get("type")
        readers = []
        for reader in _list(attr.get("readers"), "readers"):
            kind = str(reader).split(":", 1)[0]
            if kind not in ("details", "number", "keywords", "regex"):
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
    # "Laptop" in "Laptops & Notebooks" is the category itself: everything
    # listed there is one, and a class below it would leave most unrecognised.
    if store.same_goods(text, category["name"]):
        store.add_alias(conn, category["id"], text, "name", "user")
        conn.commit()
        return category["id"]
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
    depth = len(path)
    # A class step that is the category itself ("Motorräder & Motorroller"
    # before "Yamaha") is not a node of its own: its names are the category's.
    while (
        path
        and path[0]["kind"] == "class"
        and store.same_goods(path[0]["name"], category["name"])
    ):
        for alias in path.pop(0)["aliases"]:
            store.add_alias(conn, category["id"], alias, "name", "model")
    dropped = depth - len(path)
    if not path:
        store.add_alias(conn, category["id"], text, "name", "user")
        conn.commit()
        return category["id"]
    # A fact the category already has under another id is not a new one
    # ("kilometerstand" beside the site's "km" labelled "Kilometerstand").
    taken = {store.fold(a["label"]) for a in existing.values()} | {
        store.fold(i) for i in existing
    }
    attributes = [
        a
        for a in _clean_attributes(raw, depth)
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
            ids[max(attr["at"] - dropped, 0)],
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


DEFINE_PROMPT = """Ein Käufer sucht gebraucht: {product} (Kategorie {category}).
Er verlangt diese Merkmale, die wir aus Kleinanzeigen-Anzeigen (Titel, Beschreibung,
Detailangaben) lesen müssen:
{wanted}

Schon vorhandene Merkmale (id: label):
{existing}

Gib für JEDES verlangte Merkmal an, wie es gelesen wird -- mit genau dem label von oben.
Ist es nur ein anderer Name für ein vorhandenes Merkmal ("Laufleistung" für
"Kilometerstand"), gib dessen id zurück; sonst eine neue id und:
- type: "number" | "boolean" | "enum" | "text", unit bei Zahlen, options bei enum,
- readers: in Reihenfolge, wie es gelesen wird: "details:<Name der Detailangabe>" (wenn die
  Seite es als Detail führt), "number" (Zahl mit Einheit beim Label), "keywords:wort1|wort2"
  (genannt oder verneint, für ja/nein), "regex:<Python-Regex mit genau einer Gruppe>" (z. B.
  "regex:\\\\b(\\\\d{{1,2}})\\\\s?x\\\\s?\\\\d{{1,3}}\\\\s?GB" für die Anzahl Riegel).

Antworte NUR mit JSON:
{{"attributes": [{{"label": "...", "id": "snake_case", "type": "...", "unit": null,
                  "options": null, "readers": ["..."]}}]}}
"""


def define_attributes(conn, node_id, labels, ask=llm.ask_json):
    """{label: attr_id} for facts a hunt asks about and the graph cannot read
    yet, set at `node_id` so every later hunt below it reads them too. One model
    call; an attribute it cannot say how to read is not invented.

    A label the model names as an attribute the node already has ("Laufleistung"
    as the site's "km") maps to that one: it is never redefined, which would
    shadow the site's detail reader and filter below this node."""
    node = store.node(conn, node_id)
    category = next(
        n for n in reversed(store.ancestors(conn, node_id)) if n["kind"] == "category"
    )
    existing = store.effective_attributes(conn, node_id)
    raw = ask(
        DEFINE_PROMPT.format(
            product=describe(conn, node_id)["name"],
            category=category["name"],
            wanted="\n".join(f"- {label}" for label in labels),
            existing="\n".join(
                f"{i}: {a['label']}" for i, a in sorted(existing.items())
            )
            or "keine",
        )
    )
    if not isinstance(raw, dict):
        raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {raw!r}")
    taken = {store.fold(i): i for i in existing} | {
        store.fold(a["label"]): i for i, a in existing.items()
    }
    wanted = {store.fold(label): label for label in labels}
    defined = {}
    for attr in (
        raw.get("attributes") if isinstance(raw.get("attributes"), list) else []
    ):
        # Naming a present attribute needs no readers: map it first.
        if not isinstance(attr, dict):
            continue
        label = wanted.get(store.fold(attr.get("label")))
        same = taken.get(store.fold(attr.get("id"))) if attr.get("id") else None
        if label and same:
            defined[label] = same
    for attr in _clean_attributes(raw, 1):
        label = wanted.get(store.fold(attr["label"]))
        if not label or label in defined:
            continue
        if store.fold(attr["id"]) in taken:  # defined a moment ago for another label
            defined[label] = taken[store.fold(attr["id"])]
            continue
        store.set_attribute(
            conn,
            node["id"],
            attr["id"],
            label,
            attr["type"],
            attr["readers"],
            "model",
            unit=attr["unit"],
            options=attr["options"],
        )
        taken[store.fold(attr["id"])] = attr["id"]
        taken[store.fold(label)] = attr["id"]
        defined[label] = attr["id"]
    return defined
