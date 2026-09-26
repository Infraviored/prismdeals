"""A hunt as a query on the graph (plan §5): targets, conditions, frame.

The document the setup, the edit screen and "Mit KI ändern" all send:

    {"name": "Supersportler", "text": "CBR SC59 oder R1 RN19",
     "category_code": "305",
     "frame": {"max_price": 9000, "location_id": 6411, "place": "Landsberg",
               "radius_km": 200},
     "targets": [{"typed": "Honda CBR 1000 RR SC59", "node_id": 42,
                  "conditions": [{"label": "Kilometerstand", "op": "max",
                                  "value": 5000, "importance": "must"}]}],
     "conditions": [{"label": "ABS", "op": "present", "importance": "wish"}]}

`save` places every target without a node (place.py), maps each condition to
an attribute of the node it applies to -- adding the attribute there when the
node has none of that name, so "Innenraum" becomes a fact of every Ventilator
-- and derives the crawl: one family of search terms, one per crawled node,
in the frame's place, radius and price, narrowed by site filters where a must
condition applies to every target.
"""

import json
import logging
import re

import family_store
import search_url

from . import llm, place, store
from .numbers import leading_number

logger = logging.getLogger(__name__)

OPS = ("min", "max", "eq", "in", "not_in", "present", "absent")
IMPORTANCE = ("must", "wish")
# Kinds a listing title names rarely enough that searching for them loses
# offers: an SC59 is found by searching the CBR and judging the year.
_NOT_CRAWLED = ("generation", "config")


class HuntError(ValueError):
    pass


def clean_condition(raw):
    op = raw.get("op")
    importance = raw.get("importance")
    label = str(raw.get("label") or raw.get("attr_id") or "").strip()
    if op not in OPS or importance not in IMPORTANCE or not label:
        raise HuntError(f"Ungültige Bedingung: {raw!r}")
    value = raw.get("value")
    if op in ("min", "max"):
        # "5000", "5.000 km": the number the words say.
        value = leading_number(value)
        if value is None:
            raise HuntError(f"„{label}“ braucht eine Zahl.")
    if op in ("in", "not_in") and not (isinstance(value, list) and value):
        raise HuntError(f"„{label}“ braucht eine Liste.")
    if op == "eq" and value in (None, ""):
        raise HuntError(f"„{label}“ braucht einen Wert.")
    # A wish weighs -3..+3 (minus .. plus, 0 shown only); a must is a gate.
    weight = raw.get("weight")
    if weight is None:
        weight = 2 if importance == "wish" else 0
    if not isinstance(weight, int) or isinstance(weight, bool) or not -3 <= weight <= 3:
        raise HuntError(f"„{label}“: Gewicht {weight!r} liegt nicht zwischen -3 und 3.")
    return {
        "attr_id": raw.get("attr_id"),
        "label": label,
        "op": op,
        "value": value if op not in ("present", "absent") else None,
        "importance": importance,
        "weight": weight if importance == "wish" else 0,
    }


def _target_weight(raw):
    weight = raw.get("weight") or 0
    if not isinstance(weight, int) or isinstance(weight, bool) or not 0 <= weight <= 3:
        raise HuntError(f"Ziel-Vorliebe {weight!r} liegt nicht zwischen 0 und 3.")
    return weight


def _existing(conn, node_id, condition):
    """The attr_id at `node_id` (or above) the condition names, or None: the
    id it carries, else the attribute of that label, else of that id -- "Art"
    in Baby- & Kinderkleidung is type_s, while its art_s is "Mädchen & Jungen"."""
    attributes = store.effective_attributes(conn, node_id)
    if condition["attr_id"] in attributes:
        return condition["attr_id"]
    wanted = store.fold(condition["label"])
    for attr_id, attribute in attributes.items():
        if store.fold(attribute["label"]) == wanted:
            return attr_id
    for attr_id in attributes:
        if store.fold(attr_id) == wanted:
            return attr_id
    return None


def _attributes(conn, pairs, ask):
    """attr_id per (node_id, condition); what the graph cannot read yet is
    defined at that node by one model call per node (place.define_attributes)."""
    missing, hints = {}, {}
    for node_id, c in pairs:
        if _existing(conn, node_id, c) is None:
            missing.setdefault(node_id, {})[store.fold(c["label"])] = c["label"]
            # What the hunt wants of it says its kind: "max 16" is a number.
            hints[c["label"]] = (
                f"{c['op']} {c['value']}" if c["value"] is not None else c["op"]
            )
    # A label the model names as a present attribute ("Laufleistung" as the
    # site's "km") is that attribute; it is not found by name alone.
    named = {}
    for node_id, labels in missing.items():
        for label, attr_id in place.define_attributes(
            conn, node_id, list(labels.values()), ask=ask, hints=hints
        ).items():
            named[(node_id, store.fold(label))] = attr_id
    out = []
    for node_id, c in pairs:
        attr_id = _existing(conn, node_id, c) or named.get(
            (node_id, store.fold(c["label"]))
        )
        if attr_id is None:
            raise HuntError(f"„{c['label']}“ lässt sich aus Anzeigen nicht lesen.")
        out.append(attr_id)
    return out


def _fitted(conn, node_id, condition, attr_id):
    """The condition in its attribute's terms. A range needs a number; an
    option is stored as the label the readers store ("Sehr Gut"), whether the
    buyer's screen sent that or the site's value ("like_new")."""
    attribute = store.effective_attributes(conn, node_id)[attr_id]
    label = condition["label"]
    if condition["op"] in ("min", "max") and attribute["type"] != "number":
        chosen = _ordinal(attribute["options"], condition)
        if chosen is not None:
            return {**condition, "op": "in", "value": chosen}
        raise HuntError(
            f"„{label}“ ist keine Zahl, sondern eine Auswahl: "
            "bitte eine oder mehrere Optionen wählen statt einer Grenze."
            if attribute["options"]
            else f"„{label}“ ist keine Zahl: eine Grenze passt nicht."
        )
    if condition["op"] not in ("eq", "in", "not_in") or not attribute["options"]:
        return condition
    wanted = condition["value"] if condition["op"] != "eq" else [condition["value"]]
    labels = []
    for value in wanted:
        option = next(
            (
                o
                for o in attribute["options"]
                if store.fold(value) in (store.fold(o["label"]), store.fold(o["value"]))
            ),
            None,
        )
        if option is None or not store.fold(value):
            raise HuntError(
                f"„{value}“ ist keine Option von „{label}“ "
                f"({', '.join(o['label'] for o in attribute['options'])})."
            )
        labels.append(option["label"])
    return {**condition, "value": labels[0] if condition["op"] == "eq" else labels}


def _ordinal(options, condition):
    """A bound over options that are numbers ("0" … "4", "Mehr als 4"; "256
    GB" … "2 TB" only in one unit) as the options it lets through; None when
    they are no such scale. An option with words before its number is open
    upward: it meets any minimum and no maximum."""
    bound = leading_number(condition["value"])
    scale = []
    for o in options or []:
        found = re.match(r"\s*(\D*?)\s*(\d+(?:[.,]\d+)?)\s*(\D*)$", o["label"])
        if found:
            number = float(found.group(2).replace(",", "."))
            scale.append(
                (o["label"], number, bool(found.group(1)), store.fold(found.group(3)))
            )
    if bound is None or not scale or len({unit for *_, unit in scale}) > 1:
        return None
    wanted = condition["op"] == "min"
    return [
        label
        for label, number, open_up, _ in scale
        if (wanted if open_up else (number >= bound if wanted else number <= bound))
    ] or None


def _common_ancestor(conn, node_ids):
    chains = [[n["id"] for n in store.ancestors(conn, i)] for i in node_ids]
    common = None
    for step in zip(*chains):
        if len(set(step)) != 1:
            break
        common = step[0]
    return common


def crawl_node(conn, node_id):
    """The node whose name is searched for this target: the nearest one above
    a generation or configuration."""
    for n in reversed(store.ancestors(conn, node_id)):
        if n["kind"] not in _NOT_CRAWLED:
            return n
    return store.node(conn, node_id)


def crawl_term(conn, node_id):
    """The search words for a node: its described name ("Honda CBR 1000 RR");
    a category or class is searched by its name alone."""
    node = crawl_node(conn, node_id)
    if node["kind"] == "category":
        return None
    return place.describe(conn, node["id"])["name"]


def _site_filters(conn, conditions, target_ids):
    """URL filters for must conditions that apply to every target and read an
    attribute the site filters ("motorraeder_roller.km_i:,5000")."""
    out = []
    for c in conditions:
        if c["importance"] != "must" or c["node_id"] is not None:
            continue
        attrs = [
            store.effective_attributes(conn, t).get(c["attr_id"]) for t in target_ids
        ]
        # Every target must read it, and by the same filter: a filter one
        # target lacks would drop that target's offers.
        if not attrs or any(a is None for a in attrs):
            continue
        keys = {a.get("site_filter") for a in attrs}
        if len(keys) != 1 or None in keys:
            continue
        key = keys.pop()
        if c["op"] in ("min", "max"):
            if any(a["type"] != "number" for a in attrs):
                continue  # a range filters numbers only
            low = c["value"] if c["op"] == "min" else ""
            high = c["value"] if c["op"] == "max" else ""
            out.append(f"{key}:{_num(low)},{_num(high)}")
        elif c["op"] in ("eq", "in"):
            # The same key twice means "either of these" to the site.
            wanted = c["value"] if c["op"] == "in" else [c["value"]]
            values = [_option_value(attrs[0], w) for w in wanted]
            if all(values):
                out += [f"{key}:{v}" for v in values]
    return out


def _option_value(attribute, wanted):
    """The site's value for an option the buyer names by label ("Speicher")."""
    for option in attribute.get("options") or []:
        if store.fold(wanted) in (
            store.fold(option["label"]),
            store.fold(option["value"]),
        ):
            return option["value"]
    return None


def _num(value):
    if value == "":
        return ""
    return str(int(value)) if float(value).is_integer() else str(value)


def _clean(doc):
    name = str(doc.get("name") or "").strip()
    category_code = str(doc.get("category_code") or "").strip()
    targets = doc.get("targets") or []
    if not name:
        raise HuntError("Die Suche braucht einen Namen.")
    if not category_code:
        raise HuntError("Die Suche braucht eine Kategorie.")
    if not targets:
        raise HuntError("Die Suche braucht mindestens ein Ziel.")
    frame = doc.get("frame") or {}
    return {
        "name": name,
        "text": str(doc.get("text") or ""),
        "category_code": category_code,
        "frame": {
            "max_price": frame.get("max_price"),
            "location_id": frame.get("location_id"),
            "place": frame.get("place"),
            "radius_km": frame.get("radius_km"),
        },
        "targets": [
            {
                "typed": str(t.get("typed") or "").strip(),
                "node_id": t.get("node_id"),
                "weight": _target_weight(t),
                "conditions": [clean_condition(c) for c in t.get("conditions") or []],
            }
            for t in targets
        ],
        "conditions": [clean_condition(c) for c in doc.get("conditions") or []],
    }


def save(conn, doc, campaign_id=None, ask=llm.ask_json):
    """Stores the hunt; returns its campaign id."""
    doc = _clean(doc)
    category_id = conn.execute(
        "SELECT id FROM nodes WHERE kind = 'category' AND category_code = ?",
        (doc["category_code"],),
    ).fetchone()
    if not category_id:
        raise HuntError(f"Kategorie {doc['category_code']} ist nicht im Graphen.")

    targets = []
    for t in doc["targets"]:
        node_id = t["node_id"]
        if node_id is None or store.node(conn, node_id) is None:
            if not t["typed"]:
                raise HuntError("Ein Ziel ohne Namen.")
            node_id = place.place(conn, t["typed"], doc["category_code"], ask=ask)
        node_id = store.node(conn, node_id)["id"]  # follows merges
        if category_id[0] not in {n["id"] for n in store.ancestors(conn, node_id)}:
            raise HuntError(f"„{t['typed']}“ liegt nicht in der Kategorie.")
        targets.append({**t, "node_id": node_id})
    target_ids = list(dict.fromkeys(t["node_id"] for t in targets))

    # A condition for one target reads at that target; one for all at what
    # the targets have in common, so "ABS" becomes a fact of every motorcycle.
    shared = _common_ancestor(conn, target_ids)
    scoped = [(t["node_id"], c) for t in targets for c in t["conditions"]]
    pairs = scoped + [(shared, c) for c in doc["conditions"]]
    conditions = [
        {
            **_fitted(conn, node_id, c, attr_id),
            "attr_id": attr_id,
            "node_id": node_id if i < len(scoped) else None,
        }
        for i, ((node_id, c), attr_id) in enumerate(
            zip(pairs, _attributes(conn, pairs, ask))
        )
    ]

    taken = conn.execute(
        "SELECT id FROM campaigns WHERE name = ? AND id IS NOT ?",
        (doc["name"], campaign_id),
    ).fetchone()
    if taken:
        raise HuntError(f"Eine Suche „{doc['name']}“ gibt es schon.")
    frame_json = json.dumps(doc["frame"], ensure_ascii=False)
    intent_json = json.dumps({"text": doc["text"]}, ensure_ascii=False)
    if campaign_id is None:
        campaign_id = conn.execute(
            "INSERT INTO campaigns (name, intent_json, frame_json) VALUES (?, ?, ?)",
            (doc["name"], intent_json, frame_json),
        ).lastrowid
    else:
        conn.execute(
            "UPDATE campaigns SET name = ?, intent_json = ?, frame_json = ? WHERE id = ?",
            (doc["name"], intent_json, frame_json, campaign_id),
        )
    conn.execute("DELETE FROM hunt_targets WHERE campaign_id = ?", (campaign_id,))
    conn.executemany(
        """INSERT INTO hunt_targets (campaign_id, node_id, position, typed, name, weight)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [
            (
                campaign_id,
                node_id,
                pos,
                next(t["typed"] for t in targets if t["node_id"] == node_id)
                or place.describe(conn, node_id)["name"],
                place.describe(conn, node_id)["name"],
                max(t["weight"] for t in targets if t["node_id"] == node_id),
            )
            for pos, node_id in enumerate(target_ids)
        ],
    )
    conn.execute("DELETE FROM hunt_conditions WHERE campaign_id = ?", (campaign_id,))
    conn.executemany(
        """INSERT INTO hunt_conditions (campaign_id, node_id, attr_id, op, value_json,
                                        importance, label, weight)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                campaign_id,
                c["node_id"],
                c["attr_id"],
                c["op"],
                json.dumps(c["value"], ensure_ascii=False),
                c["importance"],
                c["label"],
                c["weight"],
            )
            for c in conditions
        ],
    )
    _kinds_by_art(conn, target_ids, conditions)
    _crawl(conn, campaign_id, doc, target_ids, conditions)
    conn.commit()
    return campaign_id


def _single(condition):
    """The one value an "eq" or a one-element "in" condition asks for."""
    if condition["op"] == "eq":
        return str(condition["value"])
    if condition["op"] == "in" and len(condition["value"]) == 1:
        return str(condition["value"][0])
    return None


def _art_of(conn, node_id, conditions):
    """The "Art" a must condition selects that names this class of goods."""
    node = store.node(conn, node_id)
    parent = store.node(conn, node["parent_id"]) if node["parent_id"] else None
    if node["kind"] != "class" or not parent or parent["kind"] != "category":
        return None
    art = store.art_attr_id(store.effective_attributes(conn, node_id))
    for c in conditions:
        if (
            art
            and c["attr_id"] == art
            and c["importance"] == "must"
            and c["node_id"] in (None, node_id)
            and _single(c) is not None
            and store.same_goods(node["name"], _single(c))
        ):
            return _single(c)
    return None


def _kinds_by_art(conn, target_ids, conditions):
    """A class the "Art" filter names is what a listing filed under it is."""
    for node_id in target_ids:
        art = _art_of(conn, node_id, conditions)
        if art:
            store.add_alias(conn, node_id, art, "art", "hunt")


def _crawl(conn, campaign_id, doc, target_ids, conditions):
    """The hunt's family of searches: one term per crawled node."""
    terms = []
    for node_id in target_ids:
        # A kind of goods the site's own "Art" filter already selects needs
        # no search word: "matratze" would drop the "Kaltschaummatratze".
        if _art_of(conn, node_id, conditions):
            term = None
        else:
            term = crawl_term(conn, node_id)
        if term not in terms:
            terms.append(term)
    frame = doc["frame"]
    base_url = search_url.for_hunt(
        category_code=doc["category_code"],
        price={"max": frame["max_price"]} if frame["max_price"] else None,
        location_id=frame["location_id"],
        radius_km=frame["radius_km"],
        attributes=_site_filters(conn, conditions, target_ids),
    )
    row = conn.execute(
        "SELECT id FROM search_families WHERE campaign_id = ?", (campaign_id,)
    ).fetchone()
    if row is None:
        family_store.save_family(
            conn,
            name=doc["name"],
            base_url=base_url,
            terms=[{"term": t or "", "label": t or doc["name"]} for t in terms],
            campaign_id=campaign_id,
        )
        return
    existing = {
        slug: tid
        for tid, slug in conn.execute(
            "SELECT id, term FROM search_family_terms WHERE family_id = ?", (row[0],)
        ).fetchall()
    }
    family_store.update_family(
        conn,
        row[0],
        name=doc["name"],
        base_url=base_url,
        terms=[
            {
                "id": existing.get(search_url.slugify(t or "")),
                "term": t or "",
                "label": t or doc["name"],
            }
            for t in terms
        ],
    )


def search_urls(conn, campaign_id):
    """The URLs the hunt crawls now: what a save compares to know whether to crawl."""
    return {
        r[0]
        for r in conn.execute(
            """SELECT s.url FROM search_families f
                 JOIN search_family_searches sfs ON sfs.family_id = f.id AND sfs.active = 1
                 JOIN searches s ON s.id = sfs.search_id
                WHERE f.campaign_id = ?""",
            (campaign_id,),
        ).fetchall()
    }


def listing_ids(conn, campaign_id):
    """Every listing the hunt's searches ever found."""
    return [
        r[0]
        for r in conn.execute(
            """SELECT DISTINCT lsh.listing_id
                 FROM search_families f
                 JOIN search_family_searches sfs ON sfs.family_id = f.id
                 JOIN listing_search_hits lsh ON lsh.search_id = sfs.search_id
                WHERE f.campaign_id = ?""",
            (campaign_id,),
        ).fetchall()
    ]


def target_ids(conn, campaign_id):
    return [
        r[0]
        for r in conn.execute(
            "SELECT node_id FROM hunt_targets WHERE campaign_id = ? ORDER BY position",
            (campaign_id,),
        ).fetchall()
    ]


_BATCH = 40


def _titled(conn, ids):
    """The listings as the model reads them; one without a title says nothing
    and is not asked -- it came back empty and was asked again every crawl."""
    titles = {}
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        titles.update(
            conn.execute(
                f"SELECT id, title FROM listings WHERE id IN ({','.join('?' for _ in chunk)})",
                chunk,
            ).fetchall()
        )
    return [{"id": i, "title": titles[i]} for i in ids if (titles.get(i) or "").strip()]


def refine(conn, campaign_id, ask=llm.ask_json):
    """Reads every listing of the hunt with its targets as prior, then asks the
    model once per batch about those still resolved above the searched node --
    the brand, the category -- so each learns where it belongs. Asked once: the
    answer is stored with method "model" and never asked again."""
    from . import facts, resolve

    targets = target_ids(conn, campaign_id)
    # Above the searched node: its model is not known. Below it (a CBR without
    # a year, for an SC59 target) the title cannot say more -- the facts do.
    above = {
        n["id"]
        for t in targets
        for n in store.ancestors(conn, crawl_node(conn, t)["id"])[:-1]
    }
    ids = listing_ids(conn, campaign_id)
    for listing_id in ids:
        facts.process(conn, listing_id, prior=targets)
    pending = {}
    rows = []
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        rows += conn.execute(
            f"""SELECT listing_id, node_id, method FROM listing_resolution
                 WHERE listing_id IN ({",".join("?" for _ in chunk)})""",
            chunk,
        ).fetchall()
    for listing_id, node_id, method in rows:
        if node_id in above and method not in ("model", "rejected"):
            pending.setdefault(node_id, []).append(listing_id)
    asked = 0
    for parent_id, members in pending.items():
        group = _titled(conn, members)
        for start in range(0, len(group), _BATCH):
            batch = group[start : start + _BATCH]
            answers = resolve.resolve_with_model(conn, batch, parent_id, ask=ask)
            asked += len(batch)
            for item in batch:
                if item["id"] not in answers:
                    continue  # the answer left it out: asked again next time
                node_id = answers[item["id"]]
                if node_id is None:
                    # Not a product of this kind (an accessory, a spare part):
                    # it stays where names put it, and says so.
                    resolve.store_resolution(
                        conn, item["id"], parent_id, 0.8, "rejected"
                    )
                else:
                    resolve.store_resolution(conn, item["id"], node_id, 0.8, "model")
                # Read again where the answer put it (and by any alias it taught).
                facts.process(conn, item["id"], prior=targets)
    conn.commit()
    asked += _check_kind(conn, ids, targets, ask)
    # What varies between the offers, once there are enough of them. A model
    # that cannot be asked leaves the resolution above as it is.
    from . import signals

    try:
        found, asked_now = signals.propose(conn, campaign_id, ask=ask)
    except llm.NoModel as error:
        logger.warning("Signals for hunt %s not proposed: %s", campaign_id, error)
        found, asked_now = [], False
    proposed = len(found)
    # New attributes are read on the hunt's offers at once, not at the next crawl.
    if asked_now:
        for listing_id in ids:
            facts.process(conn, listing_id, prior=targets)
        conn.commit()
    return {"listings": len(ids), "asked": asked, "signals": proposed}


def _check_kind(conn, ids, targets, ask):
    """Names put a "Matratzenbezug" on the Matratze and "Toner für L2750DW" on
    the printer: whether it is the product itself or only something for it is
    asked once per listing and target. A no is stored as "rejected", which no
    name undoes; a yes in listing_kind_checks. Returns how many were asked."""
    from . import facts, resolve

    below = {}
    for t in targets:
        for n in store.subtree_ids(conn, t):
            below.setdefault(n, t)
    pending = {}
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        marks = ",".join("?" for _ in chunk)
        checked = set(
            conn.execute(
                f"SELECT listing_id, node_id FROM listing_kind_checks WHERE listing_id IN ({marks})",
                chunk,
            ).fetchall()
        )
        # A kind the title names is where it belongs too ("… Trekking" under a brand).
        named = {
            listing_id: json.loads(value)
            for listing_id, value in conn.execute(
                f"""SELECT listing_id, value_json FROM listing_facts
                     WHERE attr_id = 'named_kinds' AND listing_id IN ({marks})""",
                chunk,
            ).fetchall()
        }
        for listing_id, node_id in conn.execute(
            f"""SELECT r.listing_id, r.node_id FROM listing_resolution r
                 WHERE r.listing_id IN ({marks})
                   AND r.method NOT IN ('model', 'rejected')""",
            chunk,
        ).fetchall():
            target = below.get(node_id) or next(
                (t for t in named.get(listing_id, []) if t in targets), None
            )
            if target is not None and (listing_id, target) not in checked:
                pending.setdefault(target, []).append((listing_id, node_id))
    asked = 0
    for target, members in pending.items():
        placed = dict(members)
        group = _titled(conn, list(placed))
        product = (
            place.describe(conn, target)["name"] or store.node(conn, target)["name"]
        )
        # The kind of goods: the nearest class, else the category ("Matratze",
        # "Motorräder & Motorroller") -- what an accessory is not.
        kind = next(
            n["name"]
            for n in reversed(store.ancestors(conn, target))
            if n["kind"] in ("class", "category")
        )
        for start in range(0, len(group), _BATCH):
            batch = group[start : start + _BATCH]
            try:
                answers = resolve.check_kind(conn, batch, product, kind, ask=ask)
            except llm.NoModel as error:
                # Unchecked, not judged: asked again at the next crawl.
                logger.warning("Kind check for %s not done: %s", product, error)
                return asked
            asked += len(batch)
            for listing_id, is_kind in answers.items():
                if is_kind:
                    conn.execute(
                        """INSERT OR IGNORE INTO listing_kind_checks
                               (listing_id, node_id, checked_at) VALUES (?, ?, ?)""",
                        (listing_id, target, store.now()),
                    )
                else:
                    resolve.store_resolution(
                        conn, listing_id, placed[listing_id], 0.8, "rejected"
                    )
                    facts.process(conn, listing_id, prior=targets)
            conn.commit()
    return asked


def delete(conn, campaign_id):
    """Removes a hunt and its crawl plan. What it found stays: listings are raw
    market data other hunts share, and the graph has read them. Its searches
    are detached, not deleted -- deleting one cascaded to every listing it had
    found first, whichever hunt still wanted it. A search is switched off only
    when no other hunt still owns it: one URL row serves every hunt that
    derives it."""
    affected = {
        r[0]
        for r in conn.execute(
            """SELECT sfs.search_id FROM search_family_searches sfs
                 JOIN search_families f ON f.id = sfs.family_id
                WHERE f.campaign_id = ?
               UNION
               SELECT rsc.search_id FROM route_search_circles rsc
                 JOIN route_searches r ON r.id = rsc.route_search_id
                 JOIN search_families f ON f.id = r.family_id
                WHERE f.campaign_id = ?
               UNION
               SELECT id FROM searches WHERE campaign_id = ?""",
            (campaign_id, campaign_id, campaign_id),
        ).fetchall()
    }
    families = [
        r[0]
        for r in conn.execute(
            "SELECT id FROM search_families WHERE campaign_id = ?", (campaign_id,)
        ).fetchall()
    ]
    for family_id in families:
        routes = [
            r[0]
            for r in conn.execute(
                "SELECT id FROM route_searches WHERE family_id = ?", (family_id,)
            ).fetchall()
        ]
        for route_id in routes:
            conn.execute(
                "DELETE FROM listing_route_geo WHERE route_search_id = ?", (route_id,)
            )
            conn.execute(
                "DELETE FROM route_search_circles WHERE route_search_id = ?",
                (route_id,),
            )
            conn.execute("DELETE FROM route_searches WHERE id = ?", (route_id,))
        conn.execute(
            "DELETE FROM search_family_searches WHERE family_id = ?", (family_id,)
        )
        conn.execute(
            "DELETE FROM search_family_terms WHERE family_id = ?", (family_id,)
        )
        conn.execute("DELETE FROM search_families WHERE id = ?", (family_id,))
    conn.execute(
        "UPDATE searches SET campaign_id = NULL WHERE campaign_id = ?", (campaign_id,)
    )
    # Owned by another hunt: on or off as its owners say. Owned by nobody now:
    # this hunt was its last owner, so it stops being crawled.
    still_owned = family_store.recompute_enabled(conn, affected)
    orphaned = sorted(affected - set(still_owned))
    if orphaned:
        conn.execute(
            f"UPDATE searches SET enabled = 0 WHERE id IN ({','.join('?' for _ in orphaned)})",
            orphaned,
        )
    conn.execute(
        "DELETE FROM listing_ranks WHERE run_id IN (SELECT id FROM judge_runs WHERE campaign_id = ?)",
        (campaign_id,),
    )
    conn.execute("DELETE FROM judge_runs WHERE campaign_id = ?", (campaign_id,))
    found = conn.execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,)).rowcount
    conn.commit()
    return {"id": campaign_id, "deleted": bool(found)}
