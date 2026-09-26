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
        if re.search(r"[.,;:/|+]", clean):
            # "1.Hand" is a word of its own: gluing it to the run before made
            # "Raptor 700 R 1.Hand" read as an R1. A hyphen joins ("YZF-R1").
            if current:
                runs.append(current)
            runs.append(parts)
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
    # A kind of goods is named inside German compounds: "Standventilator",
    # "Kaltschaummatratze". Only for classes, and only aliases long enough
    # not to be an accident inside another word.
    words = set(store.words(title))
    for node_id, alias in conn.execute(
        """SELECT a.node_id, a.alias FROM node_aliases a JOIN nodes n ON n.id = a.node_id
            WHERE n.kind = 'class' AND n.merged_into IS NULL AND n.status != 'retired'
              AND length(a.alias) >= 5"""
    ).fetchall():
        if any(w.endswith(alias) for w in words):
            found.add(node_id)
    return found & within if within is not None else found


_BELOW_MODEL = ("generation", "config")


def _consistent(conn, node_id, matched, prior):
    """A match counts when the brand above it is named too, or is the searching
    target's own chain: "r1" is Yamaha's only next to "Yamaha", while a series
    between brand and model need not be written ("Honda CBR1000RR").

    A generation or configuration names nothing on its own: "Gen 9" is the X1
    Carbon's only next to "X1 Carbon" (or when the X1 Carbon is searched) --
    "ThinkPad T14 Gen 9" is no X1 Carbon. Its model or family must be there."""
    chain = store.ancestors(conn, node_id)
    known = matched | prior
    for above in chain[:-1]:
        if above["kind"] == "brand" and above["id"] not in known:
            return False
    if chain[-1]["kind"] in _BELOW_MODEL:
        for above in reversed(chain[:-1]):
            if above["id"] in known:
                break
            if above["kind"] not in _BELOW_MODEL:
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

    The generation whose own years hold it wins; only when none does, a first
    registration one year after the last build year counts (a late SC57 in
    2008 is still an SC57 when no SC59 was built that year). A generation
    without a last year is the current one: open to the end.
    """
    if year is None:
        return None
    generations = [
        c
        for c in store.children(conn, node_id)
        if c["kind"] == "generation" and c["years_from"]
    ]
    for slack in (0, 1):
        # No last year: the generation is still built.
        fits = [
            c["id"]
            for c in generations
            if c["years_from"]
            <= year
            <= (9999 if c["years_to"] is None else c["years_to"] + slack)
        ]
        if fits:
            return fits[0] if len(fits) == 1 else None
    return None


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
        keys = title_keys(listing.get("title"))

        def named(n):
            """The longest name of the node the title carries: "sc59facelift"
            says more than "sc59", which the searching target also answers to."""
            return max((len(a) for a in store.aliases(conn, n) if a in keys), default=0)

        best = max(
            consistent,
            key=lambda n: (len(store.ancestors(conn, n)), named(n), n in prior_chain),
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


_PATH_KINDS = ("class", "brand", "family", "model", "generation", "config")


def _named_above(conn, node_id, folded):
    """Whether `folded` is already a name of something above `node_id`."""
    above = [n["id"] for n in store.ancestors(conn, node_id)[:-1]]
    return bool(
        above
        and conn.execute(
            f"""SELECT 1 FROM node_aliases WHERE alias = ?
                  AND node_id IN ({",".join("?" for _ in above)}) LIMIT 1""",
            (folded, *above),
        ).fetchone()
    )


def _learnable(conn, node_id, alias, title):
    """Whether `alias` may name `node_id` from now on: only what the title
    really says, long enough not to be an accident, and not a name of
    something above the node -- "Honda" learned for the CBR would make every
    Honda a CBR."""
    folded = store.fold(alias)
    return (
        len(folded) >= 3
        and folded in title_keys(title)
        and not _named_above(conn, node_id, folded)
    )


def _checked_answer(answer, listings, known_ids, conn):
    """The model's batch answer as [(listing, node_id | None, alias | None, path | None)];
    raises NoModel on anything it cannot use -- nothing is written then."""
    if not isinstance(answer, list):
        raise llm.NoModel("Die KI hat keine Liste geliefert.")
    out = []
    for item in answer:
        if not isinstance(item, dict) or not isinstance(item.get("i"), int):
            raise llm.NoModel(f"Unbrauchbare KI-Antwort: {item!r}")
        if not 0 <= item["i"] < len(listings):
            continue  # names no title of the batch: says nothing about any
        listing = listings[item["i"]]
        if item.get("key"):
            found = store.by_key(conn, str(item["key"]))
            if not found or found["id"] not in known_ids:
                raise llm.NoModel(f"Die KI nennt einen unbekannten Knoten: {item!r}")
            alias = item.get("alias")
            out.append(
                (listing, found["id"], alias if isinstance(alias, str) else None, None)
            )
        elif "path" in item:
            if not isinstance(item["path"], list) or not item["path"]:
                raise llm.NoModel(f"Unbrauchbarer Pfad: {item!r}")
            path = []
            for step in item["path"]:
                if not isinstance(step, dict):
                    raise llm.NoModel(f"Unbrauchbarer Pfad-Schritt: {step!r}")
                name = str(step.get("name") or "").strip()
                aliases = step.get("aliases") or []
                if (
                    not name
                    or step.get("kind") not in _PATH_KINDS
                    or not isinstance(aliases, list)
                ):
                    raise llm.NoModel(f"Unbrauchbarer Pfad-Schritt: {step!r}")
                path.append(
                    {
                        "name": name,
                        "kind": step["kind"],
                        "aliases": [str(a) for a in aliases],
                    }
                )
            out.append((listing, None, None, path))
        elif "key" in item:
            out.append((listing, None, None, None))  # not a product of this kind
        else:
            raise llm.NoModel(f"Unbrauchbare KI-Antwort: {item!r}")
    return out


def resolve_with_model(conn, listings, parent_id, ask=llm.ask_json):
    """Asks once for listings that names could not place below `parent_id`.
    Learns an alias from each answer. Returns {listing_id: node_id|None} for
    the listings the answer speaks about; None means not a product of this kind."""
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
    checked = _checked_answer(answer, listings, {n["id"] for n in known}, conn)
    out = {}
    for listing, node_id, alias, path in checked:
        title = listing["title"]
        if node_id is not None and alias:
            # How this title names it: the next such title resolves by name.
            if _learnable(conn, node_id, alias, title):
                store.add_alias(conn, node_id, alias, "name", "learned")
        if path is not None:
            node_id = parent_id
            for step in path:
                folded = store.fold(step["name"])
                if folded in store.aliases(conn, node_id) or _named_above(
                    conn, node_id, folded
                ):
                    continue  # the node it sits under, named again
                node_id = store.create_node(
                    conn, node_id, step["kind"], step["name"], "model"
                )
                # The name is the model's word for it; aliases must be the title's.
                store.add_alias(conn, node_id, step["name"], "name", "model")
                for a in step["aliases"]:
                    if _learnable(conn, node_id, a, title):
                        store.add_alias(conn, node_id, a, "name", "model")
        out[listing["id"]] = node_id
    conn.commit()
    return out


def _descendants(conn, node_id):
    return [
        store.node(conn, i) for i in store.subtree_ids(conn, node_id) if i != node_id
    ]
