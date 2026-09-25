"""A hunt changed in the buyer's words: "nur SC59 bei der CBR, unter 5000 km".

The edit screen sends the hunt as one document -- its models, what each model
must have, what all must have, price and radius -- and a sentence. A model
returns the whole document changed; this module checks it and lists what
changed, so the screen can show the change before anything is saved. The list
is computed here, not taken from the model: a summary that says "SC59 only"
while the document says otherwise is worse than none.

    {"name": "...", "max_price": 7000, "radius_km": 200,
     "models": [{"name": "Honda CBR 1000 RR SC59",
                 "requirements": [{"label": "Kilometerstand km",
                                   "importance": "high",
                                   "buyer_wants": {"max": 5000}}]}],
     "requirements": [{"label": "ABS", "importance": "low",
                       "buyer_wants": {"present": true}}]}
"""

import json
import logging
import re
import sys

logger = logging.getLogger(__name__)

OPERATORS = {"min", "max", "match", "preferred", "excluded", "present"}
IMPORTANCE = {"high", "low"}

PROMPT = """Du bearbeitest eine gespeicherte Gebrauchtwaren-Suche.

REGELN:
- Ändere nur, was der Auftrag verlangt. Alles andere bleibt Zeichen für Zeichen gleich.
- Eine Anforderung, die nur ein Modell betrifft, gehört in "requirements" dieses Modells;
  eine, die alle betrifft, in die oberste "requirements"-Liste.
- Eine Generation oder ein Baureihen-Code gehört in den Modellnamen:
  "nur SC59" bei der CBR macht aus "Honda CBR 1000 RR" "Honda CBR 1000 RR SC59".
- Zahlen: buyer_wants mit "min"/"max" als Zahl, und das Label nennt die Einheit
  ("Kilometerstand km", "Leistung PS", "Gewicht kg").
- Etwas soll vorhanden sein: buyer_wants {"present": true}; soll fehlen: {"present": false}.
- "importance": "high" für ein Muss, "low" für einen Wunsch.
- "max_price" in Euro, "radius_km" in Kilometern; null heißt keine Grenze.
- Gib NUR das vollständige JSON-Dokument zurück, keinen anderen Text.

## Die Suche
{document}

## Auftrag
{instruction}
"""


def build_prompt(document, instruction):
    # replace, not format: the rules quote JSON with braces of their own.
    return PROMPT.replace(
        "{document}", json.dumps(document, ensure_ascii=False, indent=2)
    ).replace("{instruction}", str(instruction).strip())


def _slug(text):
    s = re.sub(r"[^a-z0-9äöüß]+", "_", str(text).lower()).strip("_")
    return s or "anforderung"


def _number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else value
    from probe_sieve import _german_number

    try:
        return _number(_german_number(str(value).strip()))  # "5.000", "2,5"
    except ValueError:
        return None


def clean_requirement(raw):
    """A requirement the judge can read, or None."""
    if not isinstance(raw, dict):
        return None
    label = str(raw.get("label") or "").strip()
    wants = raw.get("buyer_wants")
    if not label or not isinstance(wants, dict):
        return None
    clean_wants = {}
    for key, value in wants.items():
        if key not in OPERATORS:
            continue
        if key in ("min", "max"):
            value = _number(value)
            if value is None:
                continue
        clean_wants[key] = value
    if not clean_wants:
        return None
    importance = (
        raw.get("importance") if raw.get("importance") in IMPORTANCE else "high"
    )
    out = {
        "id": raw.get("id") or f"own_{_slug(label)}",
        "label": label,
        "importance": importance,
        "own": True,
        "buyer_wants": clean_wants,
    }
    keywords = [
        str(k).strip().lower() for k in raw.get("keywords") or [] if str(k).strip()
    ]
    if keywords:
        out["keywords"] = keywords
    return out


def clean_document(raw, before):
    """The model's document, reduced to what the edit screen can apply.

    Raises ValueError when there is no usable document at all.
    """
    if not isinstance(raw, dict):
        raise ValueError("Die KI hat kein Suchdokument zurückgegeben.")
    models = []
    for model in raw.get("models") or []:
        if not isinstance(model, dict) or not str(model.get("name") or "").strip():
            continue
        requirements = [
            r for r in map(clean_requirement, model.get("requirements") or []) if r
        ]
        models.append(
            {"name": str(model["name"]).strip(), "requirements": requirements}
        )
    if not models and before.get("models"):
        raise ValueError(
            "Die KI hat alle Modelle entfernt; das wurde nicht übernommen."
        )
    doc = {
        "name": str(raw.get("name") or before.get("name") or "").strip(),
        "max_price": _number(raw.get("max_price"))
        if raw.get("max_price") is not None
        else None,
        "radius_km": _number(raw.get("radius_km"))
        if raw.get("radius_km") is not None
        else None,
        "models": models,
        "requirements": [
            r for r in map(clean_requirement, raw.get("requirements") or []) if r
        ],
    }
    return doc


def _want_text(req):
    w = req["buyer_wants"]
    parts = []
    if "min" in w:
        parts.append(f"ab {w['min']}")
    if "max" in w:
        parts.append(f"bis {w['max']}")
    if w.get("present") is False or w.get("match") is False:
        parts.append("nicht vorhanden")
    kind = "Muss" if req.get("importance") == "high" else "Wunsch"
    return f"{req['label']}{' ' + ' '.join(parts) if parts else ''} ({kind})"


def changes(before, after):
    """What differs, in sentences for the buyer."""
    out = []
    if (before.get("name") or "") != after["name"]:
        out.append(f"Name: {after['name']}")
    if before.get("max_price") != after["max_price"]:
        out.append(
            f"Höchstpreis: {after['max_price']} €"
            if after["max_price"]
            else "Höchstpreis: keiner"
        )
    if before.get("radius_km") != after["radius_km"]:
        out.append(
            f"Umkreis: {after['radius_km']} km"
            if after["radius_km"]
            else "Umkreis: keine Grenze"
        )

    def texts(reqs):
        return {_want_text(r) for r in reqs}

    old_models = {m["name"]: m for m in before.get("models") or []}
    new_models = {m["name"]: m for m in after["models"]}
    added = sorted(new_models.keys() - old_models.keys())
    removed = sorted(old_models.keys() - new_models.keys())
    # "Honda CBR 1000 RR" -> "Honda CBR 1000 RR SC59" is one model narrowed,
    # not one removed and another added.
    for old in list(removed):
        new = next((n for n in added if n.lower().startswith(old.lower())), None)
        if new:
            out.append(f"Modell: {old} → {new}")
            removed.remove(old)
            added.remove(new)
            old_models[new] = old_models.pop(old)
    out += [f"Modell: {name}" for name in added]
    out += [f"Modell entfernt: {name}" for name in removed]
    for name, model in new_models.items():
        old = texts(old_models.get(name, {}).get("requirements") or [])
        new = texts(model["requirements"])
        out += [f"{name}: {t}" for t in sorted(new - old)]
        out += [f"{name}: entfernt – {t}" for t in sorted(old - new)]
    old = texts(before.get("requirements") or [])
    new = texts(after["requirements"])
    out += [f"Für alle: {t}" for t in sorted(new - old)]
    out += [f"Für alle: entfernt – {t}" for t in sorted(old - new)]
    return out


def _parse(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "").strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        found = re.search(r"\{.*\}", text, re.DOTALL)
        if not found:
            raise ValueError("Die KI-Antwort war kein Suchdokument.")
        return json.loads(found.group(0))


def edit(document, instruction, ask=None):
    """(new document, list of changes). `ask` takes a prompt, returns text."""
    if not str(instruction or "").strip():
        raise ValueError("Was soll sich ändern?")
    if ask is None:
        ask = _ask
    reply = ask(build_prompt(document, instruction))
    if not reply:
        raise ValueError("Die KI ist gerade nicht erreichbar.")
    after = clean_document(_parse(reply), document)
    return after, changes(document, after)


def _ask(prompt):
    try:
        from agent_worker import build_llm_kwargs, client, get_response_text
    except Exception:  # noqa: BLE001 -- no model configured
        return None
    try:
        kwargs = build_llm_kwargs(
            [{"role": "user", "content": prompt}], max_tokens=3000, temperature=0.0
        )
        return get_response_text(client.chat.completions.create(**kwargs))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Hunt edit call failed: %s", exc)
        return None


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        document, found = edit(
            payload.get("document") or {}, payload.get("instruction")
        )
        print(json.dumps({"document": document, "changes": found}, ensure_ascii=False))
    except ValueError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
