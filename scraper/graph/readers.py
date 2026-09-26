"""Readers: how a fact is read from a listing (plan §4).

Four kinds, all generic -- no category has code of its own:

    details:<Label>   the detail page's attribute of that name ("Kilometerstand")
    number            a number with the attribute's unit near its label words
    keywords:<a|b>    named or denied in the text ("ABS", "ohne ABS")
    regex:<pattern>   the first capture group of a pattern the placing model
                      wrote and the market confirmed (a kit's "CL16")

`read(attribute, listing)` tries the attribute's readers in order and returns
(value, source, quote) or None. A listing is {title, description, details}.
"""

import re

from . import store
from .numbers import german_number, read_number

# "ohne ABS", also across a list ("ohne ABS und ESP"), "ABS nicht vorhanden".
_DENIED_BEFORE = re.compile(
    r"(?:\b(?:ohne|kein|keine|keinen)\s+(?:[a-zäöüß0-9-]+\s*(?:,|und|oder)\s*){0,3}"
    r"|\bnicht\s+)$"
)
_DENIED_AFTER = re.compile(
    r"^\s*[:\-–]?\s*(nicht vorhanden|nicht dabei|nein|fehlt|fehlen)\b"
)
_WORD = "a-z0-9äöüß"
_YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
_NUMBER = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?")


def _detail(details, label):
    """The detail whose name is the label, or starts it ("Erstzulassung" /
    "Erstzulassungsjahr", "RAM (GB)" / "RAM")."""
    want = store.fold(label)
    if not want:
        return None, None
    for key, value in (details or {}).items():
        have = store.fold(key)
        if have and (have == want or have.startswith(want) or want.startswith(have)):
            return key, value
    return None, None


def _typed(attribute, raw):
    """A text value in the attribute's type, or None."""
    text = str(raw).strip()
    kind = attribute["type"]
    if kind == "number":
        # "Mai 2005" is a year; "13.000 km" a number.
        if "jahr" in store.fold(attribute["label"]) or store.fold(
            attribute["label"]
        ) in ("ez",):
            year = _YEAR.search(text)
            return int(year.group(1)) if year else None
        found = _NUMBER.search(text)
        if not found:
            return None
        value = german_number(found.group(0))
        return int(value) if float(value).is_integer() else value
    if kind == "boolean":
        folded = store.fold(text)
        if folded in ("ja", "yes", "true", "vorhanden"):
            return True
        if folded in ("nein", "no", "false", "keine", "kein"):
            return False
        return None
    if kind == "enum":
        folded = store.fold(text)
        for option in attribute.get("options") or []:
            for name in (option["label"], option["value"]):
                if store.fold(name) and (
                    store.fold(name) == folded or folded.startswith(store.fold(name))
                ):
                    return option["label"]
        return text or None
    return text or None


def _keyword_pattern(word):
    body = re.escape(word)
    if word.isdigit():
        return rf"(?<!\d){body}(?!\d)"
    if len(word) >= 5:  # German glues: "Alukoffer", "Seitenkoffern"
        return rf"{body}(?:e|n|en|er|ern|s)?(?![{_WORD}])"
    return rf"(?<![{_WORD}]){body}(?![{_WORD}])"


def _keywords(words, text):
    """True when named, False when denied, None when silent -- with the quote."""
    low = text.lower()
    found = None
    for word in words:
        for m in re.finditer(_keyword_pattern(word.lower()), low):
            quote = text[max(0, m.start() - 20) : m.end() + 20].strip()
            # The denial stands before the whole word: "ohne Alukoffer" denies
            # the "koffer" inside it.
            start = m.start()
            while start > 0 and re.match(f"[{_WORD}]", low[start - 1]):
                start -= 1
            if _DENIED_BEFORE.search(low[max(0, start - 48) : start]):
                return False, quote
            if _DENIED_AFTER.search(low[m.end() : m.end() + 24]):
                return False, quote
            found = (True, quote)
    return found if found else (None, None)


def read(attribute, listing):
    """(value, source, quote) from the first reader that finds something, or None."""
    title = listing.get("title") or ""
    text = f"{title}\n{listing.get('description') or ''}"
    for reader in attribute["readers"]:
        kind, _, arg = reader.partition(":")
        if kind == "details":
            key, raw = _detail(listing.get("details"), arg or attribute["label"])
            value = _typed(attribute, raw) if key else None
            if value is not None:
                return value, "details", f"{key}: {raw}"
        elif kind == "number":
            label = f"{attribute['label']} {attribute.get('unit') or ''}".strip()
            value = read_number(text.lower(), label)
            if value is not None:
                value = int(value) if float(value).is_integer() else value
                return value, "text", None
        elif kind == "keywords":
            words = [w for w in arg.split("|") if w] or [attribute["label"]]
            value, quote = _keywords(words, text)
            if value is not None:
                return value, "text", quote
        elif kind == "regex":
            try:
                m = re.search(arg, text, re.IGNORECASE)
            except re.error:
                continue
            if m:
                value = _typed(attribute, m.group(1) if m.groups() else m.group(0))
                if value is not None:
                    return value, "text", m.group(0)
    if attribute.get("absent") is not None:
        return attribute["absent"], "absent", None
    return None


def detail_facts(details):
    """Every detail the page states, as {attr_id: (value, quote)}: facts even
    where no attribute asks for them yet ("Farbe", "Prozessor")."""
    out = {}
    for key, value in (details or {}).items():
        attr_id = store.slug(key).replace("-", "_")
        if attr_id and value not in (None, ""):
            out[attr_id] = (str(value).strip(), f"{key}: {value}")
    return out
