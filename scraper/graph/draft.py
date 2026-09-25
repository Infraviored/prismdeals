"""A hunt drafted from the buyer's words (plan §5): one model call.

"Honda CBR 1000 RR SC59 oder Yamaha R1 RN19, unter 5000 km bei der CBR, bis
9000 €" becomes the hunt document graph/hunts.py saves -- category, targets,
conditions, price -- for the buyer to check before anything is stored. The
category is picked from the graph's own category nodes; conditions name the
category's attributes where it has them, so "Kilometerstand" reads the site's
own filter.
"""

import json

from . import llm, store
from .hunts import HuntError, clean_condition

PROMPT = """Du richtest eine Suche nach Gebrauchtware auf Kleinanzeigen ein.

Der Käufer schreibt: {text}

Kategorie: {categories}

Gib zurück:
- category_code: der Code dieser Kategorie.
- name: ein kurzer Name der Suche (2-4 Wörter).
- targets: welches Produkt gesucht wird, je Ziel "typed": Marke und Modell, bei Fahrzeugen
  auch die Generation ("Honda CBR 1000 RR SC59", "Yamaha R1 RN19", "Corsair Vengeance LPX"),
  oder eine Art Ware ohne Modell ("Ventilator", "Kleiderschrank"). Mehrere Modelle = mehrere
  Ziele. Spezifikationen gehören NICHT in das Ziel, sondern in conditions (Kapazität, Anzahl
  Module, Takt, Latenz, Größe, Farbe, Kilometerstand).
- conditions je Ziel, wenn sie nur dieses Ziel betreffen, sonst oben in "conditions":
  {{"label": "...", "op": "min|max|eq|in|not_in|present|absent", "value": ...,
    "importance": "must|wish"}}. label ohne Einheit, deutsch, wie ein Merkmal heißt
  ("Kilometerstand", "Arbeitsspeicher", "Breite"). Werte als Zahl ohne Einheit. Wo mehr
  (oder weniger) besser ist, eine Grenze statt Gleichheit: "3200 MHz" heißt min 3200,
  "CL16" heißt Latenz max 16, "unter 5000 km" max 5000. Nutze die Merkmale der Kategorie,
  wenn eines passt: {attributes}
  Hat die Kategorie ein Merkmal "Art" und die Ware passt zu einer seiner Optionen, setze
  {{"label": "Art", "op": "eq", "value": "<Option>", "importance": "must"}} oben in
  "conditions".
- max_price: Höchstpreis in Euro, nur wenn der Käufer einen nennt, sonst null.
Erfinde nichts, was der Käufer nicht gesagt hat.

Antworte NUR mit JSON:
{{"category_code": "305", "name": "...", "max_price": null,
  "targets": [{{"typed": "...", "conditions": []}}], "conditions": []}}
"""

CATEGORY_PROMPT = """In welcher Kleinanzeigen-Kategorie stellen Verkäufer das ein: {text}

Die Kategorie der Ware selbst, nicht des Ortes, an dem sie benutzt wird. Die "Art"-Liste
einer Kategorie zeigt, welche Waren dort eingestellt werden. Die engste passende;
"Weitere …" nur, wenn keine engere passt.

{categories}

Antworte NUR mit JSON: {{"category_code": "..."}}"""


def _categories(conn):
    """(code, "Parent > Name", " (Art: …)") for every category: where it sits, and
    the kinds of goods the site sorts into it ("Drucker & Scanner" is PC-Zubehör)."""
    out = []
    for node_id, code in conn.execute(
        "SELECT id, category_code FROM nodes WHERE kind = 'category' ORDER BY key"
    ).fetchall():
        path = " > ".join(n["name"] for n in store.ancestors(conn, node_id))
        row = conn.execute(
            "SELECT options_json FROM node_attributes WHERE node_id = ? AND attr_id = 'art'",
            (node_id,),
        ).fetchone()
        kinds = [o["label"] for o in json.loads(row[0] or "[]")] if row else []
        out.append((code, path, f" (Art: {', '.join(kinds)})" if kinds else ""))
    return out


def _conditions(raw):
    out = []
    for c in raw or []:
        if not isinstance(c, dict):
            continue
        try:
            clean = clean_condition(c)
        except HuntError:
            continue  # what cannot be judged is dropped, not guessed
        out.append({k: clean[k] for k in ("label", "op", "value", "importance")})
    return out


def draft(conn, text, ask=llm.ask_json):
    """The hunt document for `text`, not saved."""
    text = str(text or "").strip()
    if not text:
        raise HuntError("Was wird gesucht?")
    categories = _categories(conn)
    listed = "\n".join(f"{code}: {path}{kinds}" for code, path, kinds in categories)
    # Two calls: the category first, so the second knows its attributes.
    first = ask(CATEGORY_PROMPT.format(text=text, categories=listed))
    code = str((first or {}).get("category_code") or "").strip().lstrip("c")
    names = {code: path for code, path, _ in categories}
    if code not in names:
        raise llm.NoModel("Die KI hat keine Kategorie gewählt.")
    category = conn.execute(
        "SELECT id FROM nodes WHERE kind = 'category' AND category_code = ?", (code,)
    ).fetchone()[0]
    attributes = "; ".join(
        a["label"]
        + (f" ({', '.join(o['label'] for o in a['options'])})" if a["options"] else "")
        for a in store.effective_attributes(conn, category).values()
    )
    raw = ask(
        PROMPT.format(
            text=text,
            categories=f"{code}: {names[code]}",
            attributes=attributes or "keine",
        )
    )
    if not isinstance(raw, dict):
        raise llm.NoModel("Die KI hat keinen Entwurf geliefert.")
    targets = [
        {
            "typed": str(t["typed"]).strip(),
            "conditions": _conditions(t.get("conditions")),
        }
        for t in raw.get("targets") or []
        if isinstance(t, dict) and str(t.get("typed") or "").strip()
    ]
    if not targets:
        raise llm.NoModel("Die KI hat kein Ziel erkannt.")
    price = raw.get("max_price")
    return {
        "name": str(raw.get("name") or text[:40]).strip(),
        "text": text,
        "category_code": code,
        "category_name": names[code],
        "frame": {
            "max_price": price
            if isinstance(price, (int, float)) and price > 0
            else None
        },
        "targets": targets,
        "conditions": _conditions(raw.get("conditions")),
    }
