"""Messages to sellers in the buyer's tone: a first message about a listing,
or an answer to the seller's last message.

The tone is one text the buyer set once (Einstellungen); what to say comes from
the listing, the hunt and the conversation. A draft that reads like a machine
(dashes, lists, stock phrases) is written again once, told why.
"""

import re

from . import llm

ATTEMPTS = 2

FIRST = """Schreib eine erste Nachricht an einen Verkäufer auf Kleinanzeigen, im Namen des Käufers.

So schreibt der Käufer: {tone}

Die Anzeige:
Titel: {title}
Preis: {price}
Anbieter: {seller}
Ort: {location}
Beschreibung: {description}

Frag nach dem, was die Anzeige nicht sagt, höchstens drei Fragen: {open}
{price_line}"""

REPLY = """Schreib die Antwort des Käufers auf die letzte Nachricht des Verkäufers auf Kleinanzeigen.

So schreibt der Käufer: {tone}

Die Anzeige: {title}, {price}
Beschreibung: {description}

Der Verlauf (Käufer = ich, Verkäufer = er/sie), der neueste unten:
{thread}

Antworte auf das, was der Verkäufer zuletzt geschrieben hat, und nur darauf: keine neuen
Themen, höchstens eine Rückfrage zu etwas, das er offen gelassen hat. Nichts fragen, was er
schon beantwortet hat. Sag nichts zu, was der Käufer nicht schon gesagt hat (kein Preis, kein
Termin, keine Adresse, die nicht im Verlauf stehen); wo eine Entscheidung des Käufers nötig
ist, lass eine kurze Lücke wie [Termin]."""

RULES = """
Nichts erfinden, was hier nicht steht, nichts über die Bilder. Keine Prozentangaben, keine
Wörter wie "Marktpreis"; keine Aufzählungen, keine Gedankenstriche, keine Floskeln wie
"Ich hoffe", "Vielen Dank im Voraus", "Ich würde mich freuen".
{failures}
Antworte NUR mit JSON: {{"text": "..."}}
"""

# What gives a draft away as written by a machine.
TELLS = [
    (re.compile(r"[—–]"), "Gedankenstrich"),
    (re.compile(r"^\s*[-•*]\s", re.M), "Aufzählung"),
    (
        re.compile(
            r"ich hoffe|vielen dank im voraus|ich würde mich freuen|zögern sie nicht",
            re.I,
        ),
        "Floskel",
    ),
]


def tells(text):
    return [name for pattern, name in TELLS if pattern.search(text)]


def _price_line(context):
    """An offer only where the price is clearly above what such things go for."""
    offer, usual = context.get("offer_eur"), context.get("usual_eur")
    if not offer or not usual:
        return "Zum Preis nichts sagen."
    return (
        f"Biete {offer} € an, in seinen Worten (üblich sind etwa {usual} €; "
        "das darf er als eigene Recherche nennen)."
    )


def _prompt(context):
    tone = str(context.get("tone") or "").strip()
    if not tone:
        raise llm.NoModel("Kein Tonfall festgelegt.")
    common = {
        "tone": tone,
        "title": context.get("title") or "",
        "price": context.get("price") or "-",
        "description": " ".join(str(context.get("description") or "").split())[:900]
        or "-",
    }
    if context.get("kind") == "reply":
        thread = "\n".join(
            f"{'Ich' if m.get('mine') else 'Verkäufer'}: {' '.join(str(m.get('text') or '').split())}"
            for m in context.get("thread") or []
        )
        return REPLY.format(thread=thread or "-", **common)
    return FIRST.format(
        seller=context.get("seller") or "-",
        location=context.get("location") or "-",
        open=", ".join(context.get("open") or []) or "nichts Bestimmtes",
        price_line=_price_line(context),
        **common,
    )


def draft(context, ask=llm.ask_json):
    """{"text": ...}: a first message (kind "first") or a reply (kind "reply")."""
    prompt = _prompt(context)
    failures = ""
    text = ""
    for _ in range(ATTEMPTS):
        raw = ask(prompt + RULES.format(failures=failures), max_tokens=800)
        text = raw.get("text") if isinstance(raw, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise llm.NoModel(f"Die KI-Antwort ist unbrauchbar: {raw!r}")
        found = tells(text)
        if not found:
            break
        failures = f"Dein letzter Entwurf klang nach Maschine ({', '.join(found)}): schreib ihn ohne das."
    return {"text": text.strip()}
