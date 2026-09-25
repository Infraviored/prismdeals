"""Resolving a listing into the graph, once (plan §4).

1. Names: the node aliases found in the title -- glued runs of words, never
   across punctuation ("WR 125 R - 1. HAND" gives no "r1").
2. Consistency: a deeper match counts only on its own chain ("sc59" names the
   CBR's generation only when the CBR, or the searching target, is there).
3. Years: a model node whose generations have years resolves further by the
   listing's year fact (a CBR from 2009 is an SC59).
4. The model: listings of a live hunt that resolve above the target's depth
   are asked about in one batch; each answer becomes an alias, so the next
   such title is free.
"""

import re

from . import llm, store

_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})
_LISTING_CATEGORY = re.compile(r"/s-anzeige/[^/]+/\d+-(\d+)-\d+")
_REQUEST = re.compile(r"^\s*(suche|ich suche|gesucht|kaufe)\b", re.IGNORECASE)
_YEAR_WORDS = ("jahr", "baujahr", "erstzulassung", "ez")


def title_keys(title, span=4):
    """Words and glued runs of up to `span` words, never across punctuation."""
    runs, current = [], []
    for chunk in str(title or "").lower().translate(_UMLAUTS).split():
        clean = re.sub(r"[.,;:!?()]+$", "", chunk)
        parts = [p for p in re.split(r"[^a-z0-9]+", clean) if p]
        if not parts:
            if current:
                runs.append(current)
            current = []
            continue
        current.extend(parts)
        if clean != chunk:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    keys = set()
    for run in runs:
        for i in range(len(run)):
            for j in range(i + 1, min(len(run), i + span) + 1):
                keys.add("".join(run[i:j]))
    return keys


def category_code(url):
    found = _LISTING_CATEGORY.search(url or "")
    return found.group(1) if found else None


def is_request(title):
    """Somebody wanting one, not offering one."""
    return bool(_REQUEST.search(title or ""))


def _matches(conn, title, within):
    """{node_id} whose aliases the title names, inside `within` (ids) if given."""
    keys = sorted(title_keys(title))
    if not keys:
        return set()
    marks = ",".join("?" for _ in keys)
    rows = conn.execute(
        f"""SELECT DISTINCT a.node_id FROM node_aliases a JOIN nodes n ON n.id = a.node_id
             WHERE a.alias IN ({marks}) AND n.merged_into IS NULL AND n.status != 'retired'
               AND n.kind != 'category'""",
        keys,
    ).fetchall()
    found = {r[0] for r in rows}
    return found & within if within is not None else found


def _consistent(conn, node_id, matched, prior):
    """A match counts when the brand above it is named too, or is the searching
    target's own chain: "r1" is Yamaha's only next to "Yamaha", while a series
    between brand and model need not be written ("Honda CBR1000RR")."""
    for above in store.ancestors(conn, node_id)[:-1]:
        if (
            above["kind"] == "brand"
            and above["id"] not in matched
            and above["id"] not in prior
        ):
            return False
    return True


def year_of(facts):
    """The listing's year from its facts: first registration, build or release year."""
    for attr_id, value in facts.items():
        if (
            isinstance(value, int)
            and 1950 <= value <= 2049
            and any(w in attr_id for w in _YEAR_WORDS)
        ):
            return value
    return None


def by_years(conn, node_id, year):
    """The one generation below `node_id` whose years hold `year`, or None.

    A first registration never precedes the build year but may follow it: the
    range is [from, to + 1], with no slack below.
    """
    if year is None:
        return None
    fits = [
        c["id"]
        for c in store.children(conn, node_id)
        if c["kind"] == "generation"
        and c["years_from"]
        and c["years_from"] <= year <= (c["years_to"] or c["years_from"]) + 1
    ]
    return fits[0] if len(fits) == 1 else None


def resolve(conn, listing, prior=()):
    """(node_id, confidence, method) for a listing {title, url}; the deepest
    consistent alias match, else the listing's category node."""
    code = category_code(listing.get("url"))
    category = None
    if code:
        row = conn.execute(
            "SELECT id FROM nodes WHERE kind = 'category' AND category_code = ?",
            (code,),
        ).fetchone()
        category = row[0] if row else None
    within = set(store.subtree_ids(conn, category)) if category else None
    prior_chain = {n["id"] for p in prior for n in store.ancestors(conn, p)}
    matched = _matches(conn, listing.get("title"), within)
    consistent = [n for n in matched if _consistent(conn, n, matched, prior_chain)]
    if consistent:
        best = max(
            consistent, key=lambda n: (len(store.ancestors(conn, n)), n in prior_chain)
        )
        return best, 0.9, "alias"
    if category:
        return category, 0.3, "category"
    return None, 0.0, "none"


def store_resolution(conn, listing_id, node_id, confidence, method):
    conn.execute(
        """INSERT INTO listing_resolution (listing_id, node_id, confidence, method, resolved_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(listing_id) DO UPDATE SET node_id = excluded.node_id,
               confidence = excluded.confidence, method = excluded.method,
               resolved_at = excluded.resolved_at""",
        (str(listing_id), node_id, confidence, method, store.now()),
    )


BATCH_PROMPT = """Ordne Kleinanzeigen-Titel in einen Produktbaum ein.

Unterhalb von: {parent}
Bekannte Knoten darunter (Schlüssel: Name):
{known}

Titel:
{titles}

Für jeden Titel: der Schlüssel eines bekannten Knotens, wenn er genau dieses Produkt ist,
mit "alias" = dem Teil des Titels, der das Produkt nennt; sonst ein neuer Pfad unter
"{parent}" (Namen vom Allgemeinen zum Genauen, z. B. Marke, Modell) mit den Schreibweisen
aus dem Titel als aliases; null, wenn es kein Produkt dieser Art ist (Zubehör, Ersatzteil).
Antworte NUR mit JSON: [{{"i": 0, "key": "...", "alias": "..."}} | {{"i": 1, "path":
[{{"name": "...", "kind": "brand|family|model|generation|config", "aliases": ["..."]}}]}}
| {{"i": 2, "key": null}}]
"""


def resolve_with_model(conn, listings, parent_id, ask=llm.ask_json):
    """Asks once for listings that names could not place below `parent_id`.
    Learns an alias from each answer. Returns {listing_id: node_id|None}."""
    if not listings:
        return {}
    parent = store.node(conn, parent_id)
    known = _descendants(conn, parent_id)
    answer = ask(
        BATCH_PROMPT.format(
            parent=parent["key"],
            known="\n".join(f"{n['key']}: {n['name']}" for n in known) or "(keine)",
            titles="\n".join(
                f"{i}: {item['title']}" for i, item in enumerate(listings)
            ),
        )
    )
    if not isinstance(answer, list):
        raise llm.NoModel("Die KI hat keine Liste geliefert.")
    out = {}
    for item in answer:
        if not isinstance(item, dict) or not isinstance(item.get("i"), int):
            continue
        if not 0 <= item["i"] < len(listings):
            continue
        listing = listings[item["i"]]
        node_id = None
        if item.get("key"):
            found = store.by_key(conn, item["key"])
            if found and found["id"] in {n["id"] for n in known}:
                node_id = found["id"]
                # How this title names it: the next such title resolves by name.
                if item.get("alias"):
                    store.add_alias(conn, node_id, item["alias"], "name", "learned")
        elif isinstance(item.get("path"), list):
            node_id = parent_id
            for step in item["path"]:
                name = str(step.get("name") or "").strip()
                kind = step.get("kind") if step.get("kind") in store.KINDS else "model"
                if not name:
                    break
                node_id = store.create_node(conn, node_id, kind, name, "model")
                for alias in [name, *(step.get("aliases") or [])]:
                    store.add_alias(conn, node_id, alias, "name", "model")
        out[listing["id"]] = node_id
    conn.commit()
    return out


def _descendants(conn, node_id):
    return [
        store.node(conn, i) for i in store.subtree_ids(conn, node_id) if i != node_id
    ]
