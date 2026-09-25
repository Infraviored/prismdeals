"""Requirements the buyer wrote in their own words ("ABS", "Koffer", "Garage").

The category's playbook knows its fields and reads them with patterns. A wish
like "ABS" is not among them, so it is read as words: present in title or
description means yes, "ohne ABS" / "kein ABS" means no, silence means not
stated. A wish (low importance) only lifts the score; a must written this way
decides like any other must.
"""

import re

_NEGATION = re.compile(r"\b(ohne|kein|keine|keinen|nicht|leider kein)\s+$")
_FILLER = {
    "mit",
    "ohne",
    "und",
    "oder",
    "haben",
    "wäre",
    "waere",
    "schön",
    "schoen",
    "gern",
    "gerne",
    "bitte",
    "muss",
    "soll",
    "sollte",
    "hätte",
    "haette",
    "ich",
    "eine",
    "einen",
}


def is_own(field):
    """Written by the buyer (or the intent model), not a playbook field."""
    return bool(
        field.get("own")
        or field.get("keywords")
        or str(field.get("id", "")).startswith("own_")
    )


def keywords(field):
    """The words that name the wish: given ones, else the label's words."""
    given = [
        str(k).lower().strip() for k in field.get("keywords") or [] if str(k).strip()
    ]
    if given:
        return given
    words = re.findall(r"[a-zäöüß0-9]+", str(field.get("label") or "").lower())
    return [w for w in words if len(w) >= 3 and w not in _FILLER] or words[:1]


def read_wish(field, text):
    """True when the text names the wish, False when it denies it, else None.

    A number with a unit ("mindestens 150 PS") is read near the label's words
    and compared, as the probe does with titles.
    """
    low = str(text or "").lower()
    wants = field.get("buyer_wants") or {}
    if "min" in wants or "max" in wants:
        from probe_sieve import read_number

        value = read_number(low, field.get("label") or "")
        if value is None:
            return None
        low_ok = not isinstance(wants.get("min"), (int, float)) or value >= wants["min"]
        high_ok = (
            not isinstance(wants.get("max"), (int, float)) or value <= wants["max"]
        )
        return low_ok and high_ok
    found = None
    for word in keywords(field):
        for m in re.finditer(
            rf"(?<![a-z0-9äöüß]){re.escape(word)}(?![a-z0-9äöüß])", low
        ):
            if _NEGATION.search(low[max(0, m.start() - 14) : m.start()]):
                return False
            found = True
    return found
