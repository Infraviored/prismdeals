"""Knowledge per node (plan §8): what is worth knowing about a product.

A piece of knowledge ("the SC57's regulator burns out", "check the CL on the
label") hangs at the node where it is true and holds for everything below: the
CBR's knowledge is the SC59's too. It is found by research the buyer runs in
their own web-search AI -- this module writes the brief for it, from the hunt's
targets as the graph names them, and files the pasted answer, each statement
at the deepest node it is about. Nothing is written from a template: without a
model there is no brief.
"""

import datetime
import hashlib
import json
import logging

import citations
import profiles

from . import hunts, llm, place, store

logger = logging.getLogger(__name__)

KINDS = (
    "weakness",
    "check",
    "recognition",
    "maintenance",
    "value_driver",
    "warning_sign",
    "seller_question",
    "retrofit",
    "benchmark",
    "good_terms",
)
CHECK_PATHS = ("text", "photo", "ask", "on_site")
WEIGHTS = ("minor", "costly", "dealbreaker")
# How long each kind stays true, in days.
TTL_DAYS = {"value_driver": 180, "benchmark": 180, "good_terms": 90}
DEFAULT_TTL_DAYS = 365
# Price levels for whether research pays off at all.
CHEAP, MID = 150, 500

BRIEF_PROMPT = """Du bist Kaufberater für Gebrauchtware. Ein Käufer sucht:
{products}
{conditions}
Profil: {profile} (verstecktes Risiko {hidden}/3, modellabhängig: {dependent})
Marktpreis (Median): {median}

Bereits bekannt:
{known}

Was sollte der Käufer über GENAU diese Produkte wissen, das er aus Anzeigen nicht sieht?
Höchstens 6 Punkte, konkret für diese Modelle und Generationen, nichts schon Bekanntes.

Antworte NUR mit JSON:
{{"what_to_know": ["..."], "search_brief": "kurzer Absatz: was die Web-Recherche herausfinden soll"}}
"""

RESEARCH_PROMPT = """Recherchiere gründlich zu folgendem Gebrauchtprodukt. Beantworte JEDEN Abschnitt. \
Belege deine Aussagen mit Quellen. Keine Preise vom Gebrauchtmarkt.

Produkt: {products}

Was wir wissen wollen:
{what}

{brief}
{headings}"""

CLASSIFY_PROMPT = """Zerlege diese Recherche-Antwort in einzelne, prüfbare Aussagen über Gebrauchtware.

REGELN:
- Jede Aussage ist ein eigenständiger Fakt, auf Deutsch, ohne Markdown, ohne URLs im Text.
- Behalte die URLs als Quellen der Aussage, bei der sie stehen.
- Anmerkungen der Recherche über die Aufgabe selbst sind keine Aussagen.
- "node": der Schlüssel des genauesten Knotens, für den die Aussage gilt -- eine Aussage
  nur über die SC57 gehört zur SC57, eine über alle CBR 1000 RR zum Modell.

Knoten (Schlüssel: Name):
{nodes}

Recherche-Antwort:
{answer}

Antworte NUR mit einem JSON-Array, je Aussage:
{{"node": "<Schlüssel>", "kind": "{kinds}", "statement": "...",
  "check_path": "text|photo|ask|on_site", "weight": "minor|costly|dealbreaker",
  "sources": ["https://..."]}}
"""


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _row(row):
    keys = (
        "id",
        "node_id",
        "kind",
        "statement",
        "check_path",
        "weight",
        "sources_json",
        "created_at",
        "expires_at",
        "approved",
    )
    out = dict(zip(keys, row))
    out["sources"] = json.loads(out.pop("sources_json") or "[]")
    out["approved"] = bool(out["approved"])
    return out


def for_node(conn, node_id, approved_only=True):
    """The knowledge of a node and everything above it, deepest first, unexpired."""
    chain = [n["id"] for n in store.ancestors(conn, node_id)]
    if not chain:
        return []
    marks = ",".join("?" for _ in chain)
    rows = conn.execute(
        f"""SELECT id, node_id, kind, statement, check_path, weight, sources_json,
                   created_at, expires_at, approved
              FROM node_knowledge
             WHERE node_id IN ({marks}) AND (expires_at IS NULL OR expires_at > ?)
               {"AND approved = 1" if approved_only else ""}""",
        (*chain, _now().isoformat()),
    ).fetchall()
    depth = {nid: i for i, nid in enumerate(chain)}
    return sorted((_row(r) for r in rows), key=lambda k: -depth[k["node_id"]])


def insert(conn, node_id, claim, approved=False):
    created = _now()
    expires = created + datetime.timedelta(
        days=TTL_DAYS.get(claim["kind"], DEFAULT_TTL_DAYS)
    )
    return conn.execute(
        """INSERT INTO node_knowledge (node_id, kind, statement, check_path, weight,
                                       sources_json, created_at, expires_at, approved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            node_id,
            claim["kind"],
            claim["statement"],
            claim["check_path"],
            claim["weight"],
            json.dumps(claim["sources"], ensure_ascii=False),
            created.isoformat(),
            expires.isoformat(),
            1 if approved else 0,
        ),
    ).lastrowid


def approve(conn, knowledge_id):
    conn.execute("UPDATE node_knowledge SET approved = 1 WHERE id = ?", (knowledge_id,))
    conn.commit()


def reject(conn, knowledge_id):
    conn.execute("DELETE FROM node_knowledge WHERE id = ?", (knowledge_id,))
    conn.commit()


def research_value(median_price, profile):
    """none | category | shallow | deep: price level x hidden risk x model dependence
    (docs/product-core.md §5)."""
    if profile is None or profile.research == "none":
        return "none"
    if median_price is not None and median_price <= CHEAP:
        if profile.hidden <= 1:
            return "none"
        return "shallow" if profile.model_dependent else "category"
    if median_price is None or median_price <= MID:
        return "shallow" if profile.model_dependent else "category"
    return "deep" if profile.model_dependent else "category"


def _hunt(conn, campaign_id):
    targets = hunts.target_ids(conn, campaign_id)
    if not targets:
        raise hunts.HuntError("Keine Suche mit dieser Nummer.")
    code = store.node(conn, targets[0])["category_code"]
    profile = profiles.profile_for_category(code) or profiles.PROFILES["open"]
    return targets, profile


def _median(conn, targets):
    prices = sorted(
        r[0]
        for t in targets
        for r in conn.execute(
            f"""SELECT l.price_eur FROM listing_resolution r JOIN listings l ON l.id = r.listing_id
                 WHERE r.node_id IN ({",".join("?" for _ in store.subtree_ids(conn, t))})
                   AND l.price_eur > 0 AND l.delisted_at IS NULL""",
            store.subtree_ids(conn, t),
        ).fetchall()
    )
    return prices[len(prices) // 2] if prices else None


def brief(conn, campaign_id, ask=llm.ask_json):
    """The research brief for a hunt's targets. Cached per set of targets and
    what is already known: asking twice costs one model call."""
    targets, profile = _hunt(conn, campaign_id)
    names = [place.describe(conn, t) for t in targets]
    known = {k["id"]: k for t in targets for k in for_node(conn, t)}
    median = _median(conn, targets)
    level = research_value(median, profile)
    base = {
        "research_value": level,
        "targets": [{"node_id": n["id"], "name": n["name"]} for n in names],
        "knowledge": list(known.values()),
    }
    if level == "none":
        return {
            **base,
            "decision": "nicht nötig",
            "reason": "Bei diesem Preis und Risiko lohnt keine Recherche.",
            "what_to_know": [],
            "brief": "",
        }

    key = hashlib.sha256(
        json.dumps([sorted(targets), sorted(known)]).encode()
    ).hexdigest()[:24]
    cached = conn.execute(
        "SELECT payload_json FROM node_briefs WHERE key = ?", (key,)
    ).fetchone()
    if cached:
        return {**base, **json.loads(cached[0])}

    products = "\n".join(
        f"- {n['name']}"
        + (f" ({n['years'][0]}–{n['years'][1] or 'heute'})" if n["years"] else "")
        for n in names
    )
    conditions = [
        r[0]
        for r in conn.execute(
            "SELECT label FROM hunt_conditions WHERE campaign_id = ? AND importance = 'must'",
            (campaign_id,),
        ).fetchall()
    ]
    answer = ask(
        BRIEF_PROMPT.format(
            products=products,
            conditions=f"Muss: {', '.join(conditions)}" if conditions else "",
            profile=profile.label,
            hidden=profile.hidden,
            dependent="ja" if profile.model_dependent else "nein",
            median=f"{median} €" if median else "unbekannt",
            known="\n".join(f"- {k['statement']}" for k in known.values()) or "nichts",
        ),
        max_tokens=1000,
    )
    what = [
        str(w).strip()
        for w in (answer or {}).get("what_to_know") or []
        if str(w).strip()
    ][:6]
    if not what:
        raise llm.NoModel("Die KI hat nicht gesagt, was zu wissen ist.")
    text = RESEARCH_PROMPT.format(
        products=", ".join(n["name"] for n in names),
        what="\n".join(f"- {w}" for w in what),
        brief=str(answer.get("search_brief") or "").strip(),
        headings=(
            "Gliedere deine Antwort unter diesen Überschriften:"
            + "".join(f"\n\n## {h}" for h in profile.research_headings)
        )
        if profile.research_headings
        else "",
    ).strip()
    payload = {
        "decision": "lohnt sich",
        "reason": f"Recherche empfohlen: {level}",
        "what_to_know": what,
        "brief": text,
    }
    conn.execute(
        "INSERT OR REPLACE INTO node_briefs (key, payload_json, created_at) VALUES (?, ?, ?)",
        (key, json.dumps(payload, ensure_ascii=False), _now().isoformat()),
    )
    conn.commit()
    return {**base, **payload}


def _nodes_for(conn, targets):
    """The nodes a statement may be filed at: each target, what lies above it
    below the category, and its generations or configurations."""
    out = {}
    for t in targets:
        for n in store.ancestors(conn, t):
            if n["kind"] != "category":
                out[n["key"]] = n
        for child in store.children(conn, t):
            out[child["key"]] = child
    return out


def classify(conn, campaign_id, answer_text, ask=llm.ask_json, url_checker=None):
    """Files a pasted research answer as proposed knowledge. Returns the new rows."""
    targets, _profile = _hunt(conn, campaign_id)
    text = citations.resolve(str(answer_text or "").strip())
    if not text:
        raise hunts.HuntError("Keine Antwort eingefügt.")
    nodes = _nodes_for(conn, targets)
    raw = ask(
        CLASSIFY_PROMPT.format(
            nodes="\n".join(
                f"{k}: {place.describe(conn, n['id'])['name']}"
                for k, n in nodes.items()
            ),
            answer=text,
            kinds="|".join(KINDS),
        ),
        max_tokens=8000,
    )
    if not isinstance(raw, list):
        raise llm.NoModel("Die KI hat keine Aussagen geliefert.")
    checker = url_checker or default_url_checker()
    ids = []
    for item in raw:
        claim = _clean(item)
        node = nodes.get(str((item or {}).get("node") or ""))
        if not claim or not node:
            continue  # a statement about no node of this hunt is not filed
        alive = [u for u in claim["sources"] if checker(u) is not False]
        if claim["sources"] and not alive:
            continue  # every source is gone: an invention
        ids.append(insert(conn, node["id"], {**claim, "sources": alive}))
    conn.commit()
    marks = ",".join("?" for _ in ids)
    return (
        [
            _row(r)
            for r in conn.execute(
                f"""SELECT id, node_id, kind, statement, check_path, weight, sources_json,
                       created_at, expires_at, approved FROM node_knowledge WHERE id IN ({marks})""",
                ids,
            ).fetchall()
        ]
        if ids
        else []
    )


def _clean(item):
    if not isinstance(item, dict):
        return None
    statement = citations.clean_statement(str(item.get("statement") or ""))
    if not statement:
        return None
    sources = [
        s
        for s in item.get("sources") or []
        if isinstance(s, str) and s.startswith("http")
    ]
    sources = sources or citations.urls_in(str(item.get("statement") or ""))
    return {
        "kind": item.get("kind") if item.get("kind") in KINDS else "check",
        "statement": statement,
        "check_path": item.get("check_path")
        if item.get("check_path") in CHECK_PATHS
        else "text",
        "weight": item.get("weight") if item.get("weight") in WEIGHTS else "minor",
        "sources": sources,
    }


# Only an explicit "this resource does not exist" counts as dead: forums answer
# 403 to plain clients, and those are where used-goods knowledge lives.
DEAD_STATUSES = frozenset({404, 410})
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


def default_url_checker(timeout=8):
    """url -> True (resolves), False (gone), None (could not tell)."""
    import requests

    session = requests.Session()

    def check(url):
        try:
            response = session.head(
                url, timeout=timeout, allow_redirects=True, headers=BROWSER_HEADERS
            )
            if response.status_code >= 400:
                response = session.get(
                    url, timeout=timeout, allow_redirects=True, headers=BROWSER_HEADERS
                )
            code = response.status_code
            return True if code < 400 else False if code in DEAD_STATUSES else None
        except Exception as exc:  # noqa: BLE001 -- a flaky network is not a dead link
            logger.info("Could not verify %s (%s)", url, exc)
            return None

    return check
