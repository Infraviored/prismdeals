"""A hunt changed in the buyer's words: "nur SC59 bei der CBR, unter 5000 km".

The edit screen sends the hunt document (graph/hunts.py) and a sentence. The
model sees what the buyer sees -- targets by name, conditions, price, radius --
and returns it changed. This module checks the answer, carries each unchanged
target's node over, and lists what changed. The list is computed here, not
taken from the model: a summary that says "SC59 only" while the document says
otherwise is worse than none. Nothing is saved; the screen PUTs the document.

    stdin  {"document": {...}, "instruction": "..."}
    stdout {"document": {...}, "changes": ["..."]} | {"error": "..."}
"""

import json
import sys

from graph import hunts, llm
from graph.numbers import leading_number

PROMPT = """Du bearbeitest eine gespeicherte Gebrauchtwaren-Suche.

REGELN:
- Ändere nur, was der Auftrag verlangt. Alles andere bleibt Zeichen für Zeichen gleich.
- Eine Bedingung, die nur ein Ziel betrifft, gehört in "conditions" dieses Ziels;
  eine, die alle betrifft, in die oberste "conditions"-Liste.
- Eine Generation oder ein Baureihen-Code gehört in den Zielnamen:
  "nur SC59" bei der CBR macht aus "Honda CBR 1000 RR" "Honda CBR 1000 RR SC59".
- Eine Bedingung: {"label": "...", "op": "...", "value": ..., "importance": "must"|"wish"}.
  op: "min"/"max" mit Zahl (label ohne Einheit: "Kilometerstand"), "eq" mit Wert,
  "in"/"not_in" mit Liste, "present" (soll vorhanden sein), "absent" (soll fehlen).
- "must" für ein Muss, "wish" für einen Wunsch.
- "max_price" in Euro, "radius_km" in Kilometern; null heißt keine Grenze.
- Gib NUR das vollständige JSON-Dokument zurück, keinen anderen Text.

## Die Suche
{document}

## Auftrag
{instruction}
"""


def visible(document):
    """What the model is shown: names, conditions, price, radius."""
    frame = document.get("frame") or {}
    return {
        "name": document.get("name"),
        "max_price": frame.get("max_price"),
        "radius_km": frame.get("radius_km"),
        "targets": [
            {
                "name": t.get("name") or t.get("typed"),
                "conditions": _plain(t.get("conditions")),
            }
            for t in document.get("targets") or []
        ],
        "conditions": _plain(document.get("conditions")),
    }


def _plain(conditions):
    return [
        {k: c.get(k) for k in ("label", "op", "value", "importance")}
        for c in conditions or []
    ]


def _number(value):
    """ "5000", "5.000 km", "2,5" as the number; None for none or no number."""
    return leading_number(value)


def _conditions(raw, dropped=None):
    """The conditions that can be judged. One that cannot is left out, and
    named in `dropped` so the buyer is told -- never silently."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("Die KI hat unbrauchbare Bedingungen geliefert.")
    out = []
    for c in raw:
        if not isinstance(c, dict):
            if dropped is not None:
                dropped.append(str(c))
            continue
        try:
            out.append(hunts.clean_condition(c))
        except hunts.HuntError:
            if dropped is not None:
                dropped.append(str(c.get("label") or c))
    return [{k: c[k] for k in ("label", "op", "value", "importance")} for c in out]


def apply(before, raw, dropped=None):
    """The model's answer as a full hunt document, nodes kept where names did not
    change. Conditions it gave that cannot be judged are named in `dropped`."""
    if not isinstance(raw, dict):
        raise ValueError("Die KI hat kein Suchdokument zurückgegeben.")
    raw_targets = raw.get("targets")
    if not isinstance(raw_targets, list):
        raise ValueError("Die KI hat kein Suchdokument zurückgegeben.")
    old = {(t.get("name") or t.get("typed")): t for t in before.get("targets") or []}
    targets = []
    for t in raw_targets:
        if not isinstance(t, dict):
            raise ValueError(f"Die KI hat ein unbrauchbares Ziel geliefert: {t!r}")
        name = str(t.get("name") or "").strip()
        if not name:
            continue
        kept = old.get(name)
        target = (
            {"typed": kept.get("typed") or name, "name": name}
            if kept
            else {"typed": name, "name": name}
        )
        if kept and kept.get("node_id"):
            target["node_id"] = kept["node_id"]
        target["conditions"] = _conditions(t.get("conditions"), dropped)
        targets.append(target)
    if not targets:
        raise ValueError("Die KI hat alle Ziele entfernt; das wurde nicht übernommen.")
    frame = dict(before.get("frame") or {})
    for key in ("max_price", "radius_km"):
        value = raw.get(key)
        frame[key] = _number(value)
        if value not in (None, "") and frame[key] is None:
            raise ValueError(
                f"Die KI hat einen unbrauchbaren Wert für {key} geliefert: {value!r}"
            )
    return {
        **before,
        "name": str(raw.get("name") or before.get("name") or "").strip(),
        "frame": frame,
        "targets": targets,
        "conditions": _conditions(raw.get("conditions"), dropped),
    }


def _text(c):
    words = {
        "min": f"ab {c['value']}",
        "max": f"bis {c['value']}",
        "eq": f"= {c['value']}",
        "in": f"eins von {c['value']}",
        "not_in": f"nicht {c['value']}",
        "present": "vorhanden",
        "absent": "nicht vorhanden",
    }
    kind = "Muss" if c["importance"] == "must" else "Wunsch"
    return f"{c['label']} {words[c['op']]} ({kind})"


def changes(before, after):
    """What differs, in sentences for the buyer."""
    out = []
    if (before.get("name") or "") != after["name"]:
        out.append(f"Name: {after['name']}")
    old_frame, new_frame = before.get("frame") or {}, after["frame"]
    if old_frame.get("max_price") != new_frame["max_price"]:
        out.append(
            f"Höchstpreis: {new_frame['max_price']} €"
            if new_frame["max_price"]
            else "Höchstpreis: keiner"
        )
    if old_frame.get("radius_km") != new_frame["radius_km"]:
        out.append(
            f"Umkreis: {new_frame['radius_km']} km"
            if new_frame["radius_km"]
            else "Umkreis: keine Grenze"
        )

    def texts(conditions):
        return {_text(c) for c in _conditions(conditions)}

    name = lambda t: t.get("name") or t.get("typed")  # noqa: E731
    old_targets = {name(t): t for t in before.get("targets") or []}
    new_targets = {name(t): t for t in after["targets"]}
    added = sorted(new_targets.keys() - old_targets.keys())
    removed = sorted(old_targets.keys() - new_targets.keys())
    # "Honda CBR 1000 RR" -> "Honda CBR 1000 RR SC59" is one target narrowed,
    # not one removed and another added.
    for old in list(removed):
        new = next((n for n in added if n.lower().startswith(old.lower())), None)
        if new:
            out.append(f"Ziel: {old} → {new}")
            removed.remove(old)
            added.remove(new)
            old_targets[new] = old_targets.pop(old)
    out += [f"Ziel: {n}" for n in added]
    out += [f"Ziel entfernt: {n}" for n in removed]
    for n, target in new_targets.items():
        old = texts(old_targets.get(n, {}).get("conditions"))
        new = texts(target["conditions"])
        out += [f"{n}: {t}" for t in sorted(new - old)]
        out += [f"{n}: entfernt – {t}" for t in sorted(old - new)]
    old = texts(before.get("conditions"))
    new = texts(after["conditions"])
    out += [f"Für alle: {t}" for t in sorted(new - old)]
    out += [f"Für alle: entfernt – {t}" for t in sorted(old - new)]
    return out


def edit(document, instruction, ask=llm.ask_json):
    """(new document, list of changes)."""
    if not str(instruction or "").strip():
        raise ValueError("Was soll sich ändern?")
    prompt = PROMPT.replace(
        "{document}", json.dumps(visible(document), ensure_ascii=False, indent=2)
    ).replace("{instruction}", str(instruction).strip())
    dropped = []
    after = apply(document, ask(prompt), dropped)
    return after, changes(document, after) + [
        f"nicht übernommen: {label}" for label in dropped
    ]


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    try:
        document, found = edit(
            payload.get("document") or {}, payload.get("instruction")
        )
    except llm.NoModel as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2
    except ValueError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps({"document": document, "changes": found}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
