"""Placing a target in the graph (plan §3): "Honda CBR 1000 RR SC59" -> node id.

Facts are not invented here: an attribute comes into being when a hunt asks
about it (`define_attributes`), and its readers are checked on real titles.

Names first: a target whose folded text is already an alias in its category
is that node, free. Otherwise one model call returns where it belongs under
the category -- brand, model, generation with years, the names sellers use.
New nodes are `proposed` until the market names them (evidence.py).
"""

import logging
import re

from . import llm, store

logger = logging.getLogger(__name__)

KINDS = ("class", "brand", "family", "model", "generation", "config")
TYPES = ("number", "boolean", "enum", "text")

PROMPT = """Du ordnest ein Produkt in einen Produktbaum für Gebrauchtware ein.

Kategorie: {category} (Kleinanzeigen-Kategorie {code})
Produkt: {text}

Gib den Pfad UNTER der Kategorie zurück, vom Allgemeinen zum Genauen, so tief wie das
Produkt gemeint ist:
- kind: "class" (eine Art Ware: Kinderwagen, Waschmaschine), "brand", "family" (Baureihe,
  Serie), "model", "generation" (Baureihe/Jahrgang eines Modells: Golf VII, E90, Mark III),
  "config" (eine Ausstattung/Spezifikation: 256 GB, Wi-Fi + Cellular).
- Eine reine Klasse ("Kinderwagen") ist ein einzelner Knoten der Art "class".
- aliases: wie Verkäufer es in Anzeigentiteln schreiben (Schreibweisen, Codes, Spitznamen).
- years: [von, bis] für Modelle und Generationen, sonst weglassen.
- generations: beim Modell-Schritt ALLE Generationen dieses Modells (auch die nicht
  gesuchten), je {{"name", "years", "aliases"}} -- damit ein Angebot einer anderen Generation
  als solche erkannt wird.

Antworte NUR mit JSON:
{{"path": [{{"name": "...", "kind": "...", "aliases": ["..."], "years": [2008, 2011],
             "generations": [{{"name": "...", "years": [2004, 2007], "aliases": ["..."]}}]}}]}}
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
            # "\b" written once in JSON arrives as a backspace: a regex means
            # a word boundary there, never a control character.
            reader = str(reader).replace("\x08", "\\b")
            kind = reader.split(":", 1)[0]
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
    raw = ask(
        PROMPT.format(
            category=category["name"], code=category["category_code"], text=text
        )
    )
    path = _clean_path(raw)
    # A class step that is the category itself ("Motorräder & Motorroller"
    # before "Yamaha") is not a node of its own: its names are the category's.
    while (
        path
        and path[0]["kind"] == "class"
        and store.same_goods(path[0]["name"], category["name"])
    ):
        for alias in path.pop(0)["aliases"]:
            store.add_alias(conn, category["id"], alias, "name", "model")
    if not path:
        store.add_alias(conn, category["id"], text, "name", "user")
        conn.commit()
        return category["id"]
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
Ist es nur ein anderer Name für ein vorhandenes Merkmal ("Akkulaufzeit" für
"Laufzeit"), gib dessen id zurück; sonst eine neue id und:
- type: "number" | "boolean" | "enum" | "text", unit bei Zahlen, options bei enum,
- readers: in Reihenfolge, wie es gelesen wird: "details:<Name der Detailangabe>" (wenn die
  Seite es als Detail führt), "number" (Zahl mit Einheit beim Label), "keywords:wort1|wort2"
  (genannt oder verneint, für ja/nein), "regex:<Python-Regex mit genau einer Gruppe>" (z. B.
  "regex:\\\\b(\\\\d{{2,4}})\\\\s?W\\\\b" für die Leistung in Watt).

Echte Anzeigentitel dieser Art (Nummer: Titel):
{samples}
Gib je Merkmal in "examples" an, was es aus jedem dieser Titel lesen muss (Nummer -> Wert,
null wenn der Titel es nicht nennt). Deine readers werden damit geprüft.
{failures}
Antworte NUR mit JSON:
{{"attributes": [{{"label": "...", "id": "snake_case", "type": "...", "unit": null,
                  "options": null, "readers": ["..."], "examples": {{"0": null}}}}]}}
"""

# Titles a new reader is checked against before it reads the market, and how
# often the model may correct readers that misread them.
SAMPLES = 12
ATTEMPTS = 3
# Units of measure, folded: what may follow a number and change nothing.
UNITS = frozenset(
    "mm cm m km g kg t ml l gb tb mb mhz ghz hz w kw ps v mah wh zoll".split()
)
UNREADABLE = (
    "Deine Antwort war kein vollständiges JSON (abgeschnitten): halte jeden reader kurz, "
    "ohne Wiederholungen"
)


def _samples(conn, node_id):
    """Titles of offers resolved below the node; too few, those of its category.
    Not those found to be only something for it: a topper's "140 x 200 x 3cm"
    must not decide how a mattress's size is read."""
    category = next(
        n["id"]
        for n in reversed(store.ancestors(conn, node_id))
        if n["kind"] == "category"
    )
    rows = []
    for scope in dict.fromkeys((node_id, category)):
        ids = store.subtree_ids(conn, scope)
        rows = conn.execute(
            f"""SELECT l.title FROM listing_resolution r JOIN listings l ON l.id = r.listing_id
                 WHERE r.node_id IN ({",".join("?" for _ in ids)}) AND l.title IS NOT NULL
                   AND r.method != 'rejected'
                 ORDER BY l.id DESC LIMIT ?""",
            (*ids, SAMPLES),
        ).fetchall()
        if len(rows) >= SAMPLES // 2:
            break
    return [r[0] for r in rows]


def _same(read, expected):
    if read is None or expected is None:
        return read is None and expected is None
    if isinstance(expected, bool) or isinstance(read, bool):
        return read is expected
    from .numbers import leading_number

    a, b = leading_number(read), leading_number(expected)
    if a is not None and b is not None and not isinstance(read, str):
        return abs(a - b) < 1e-9
    a, b = sorted((store.fold(read), store.fold(expected)), key=len)
    # "90 x 200" is "90 x 200 cm": a unit after a measure is the same value.
    # Anything else more is not -- a number ("90 x 10" for "90 x 10 x 200"),
    # a name ("RTX 3080" for "RTX 3080 Ti"), a word ("90x200 Kaltschaum").
    return a == b or (a[-1:].isdigit() and b.startswith(a) and b[len(a) :] in UNITS)


def _failures(attr, samples, examples):
    """What the attribute's readers read wrong on the titles the model labelled.

    A wrong value where the title states one always counts. A value read where
    the model saw none, or none read where it saw one ("1,40m x 2,20m" beside
    "90x200"), counts only past a quarter of the titles: reading a little
    beyond or a little less is tolerable -- the rest stays unread, open --
    contradicting what a seller wrote is not."""
    from . import readers

    wrong, beyond, missed = [], [], []
    reading = {**attr, "options": store.options(attr["options"]), "absent": None}
    for index, title in enumerate(samples):
        if str(index) not in examples:
            continue
        found = readers.read(
            reading, {"title": title, "description": "", "details": {}}
        )
        value = found[0] if found else None
        expected = examples[str(index)]
        if not _same(value, expected):
            line = f'"{attr["label"]}" liest aus "{title}" {value!r}, erwartet {expected!r}'
            if expected is None:
                beyond.append(line)
            elif value is None:
                missed.append(line)
            else:
                wrong.append(line)
    # Beyond: a quarter of all titles. Missed: a quarter of those that state
    # it -- a reader that reads none of two is no reader.
    stated = sum(1 for i in range(len(samples)) if examples.get(str(i)) is not None)
    return (
        wrong
        + (beyond if len(beyond) > len(samples) // 4 else [])
        + (missed if len(missed) > stated // 4 else [])
    )


def _all_failures(raw, samples):
    examples = {
        store.fold(a.get("label")): a.get("examples")
        for a in raw.get("attributes") or []
        if isinstance(a, dict) and isinstance(a.get("examples"), dict)
    }
    out = []
    for attr in _clean_attributes(raw, 1):
        out += _failures(attr, samples, examples.get(store.fold(attr["label"])) or {})
    return out


def define_attributes(conn, node_id, labels, ask=llm.ask_json, hints=None):
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
    samples = _samples(conn, node_id)

    def asked(failures):
        raw = ask(
            DEFINE_PROMPT.format(
                product=describe(conn, node_id)["name"],
                category=category["name"],
                wanted="\n".join(
                    f"- {label}"
                    + (
                        f" (der Käufer will: {hints[label]})"
                        if hints and label in hints
                        else ""
                    )
                    for label in labels
                ),
                existing="\n".join(
                    f"{i}: {a['label']}" for i, a in sorted(existing.items())
                )
                or "keine",
                samples="\n".join(f"{i}: {t}" for i, t in enumerate(samples))
                or "keine",
                failures=(
                    "Deine letzten readers lasen falsch -- korrigiere sie:\n"
                    + "\n".join(f"- {f}" for f in failures)
                    + "\n"
                )
                if failures
                else "",
            ),
            # Readers and a value per sample title for each label: room for all.
            max_tokens=min(12000, 1500 + 900 * len(labels)),
        )
        if not isinstance(raw, dict):
            raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {raw!r}")
        return raw

    # Readers are checked on real titles before they read the market: asked
    # once more with what they read wrong, and a reader still wrong is not used.
    raw, failures, told = None, [], None
    for attempt in range(ATTEMPTS):
        try:
            answer = asked(told)
        except llm.NoJSON:
            logger.info("Attribute answer was no JSON, asking again")
            told = [UNREADABLE]
            continue
        raw, failures = answer, _all_failures(answer, samples)
        if not failures:
            break
        logger.info("Readers misread, asking again: %s", failures)
        told = failures
    if raw is None:
        raise llm.NoJSON("Die KI-Antwort war kein JSON.")
    if failures:
        logger.warning("Readers still misread, not used: %s", failures)
    wrong = {store.fold(f.split('"')[1]) for f in failures}
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
        if not label or label in defined or store.fold(attr["label"]) in wrong:
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
