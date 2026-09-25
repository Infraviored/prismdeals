"""Is this offer one of the models the hunt names? Is it an offer at all?

A model list ("Yamaha R1 oder Honda CBR 1000 RR") has an implicit must: the
model. Kleinanzeigen searches loosely -- "yamaha r1" also returns a Yamaha
WR 125 R -- and without requirements every offer sat under "Unklar". This
reads the title against the named models, word-aware: "r1" must be a word or
glued words ("YZF-R1"), not a substring of "WR125R".

It also knows a request from an offer: "Suche Honda CBR 1000RR" is somebody
wanting one, not selling one.
"""

import json
import re
import sqlite3

_BRANDS = {
    "yamaha",
    "honda",
    "suzuki",
    "kawasaki",
    "bmw",
    "ducati",
    "ktm",
    "aprilia",
    "triumph",
    "harley",
    "mv",
    "agusta",
    "audi",
    "vw",
    "volkswagen",
    "mercedes",
    "opel",
    "ford",
    "skoda",
    "apple",
    "samsung",
    "lenovo",
    "asus",
    "dell",
    "hp",
    "acer",
    "msi",
    "corsair",
    "kingston",
}
_WANTED = re.compile(r"^\s*(suche|ich suche|gesucht|kaufe)\b", re.IGNORECASE)
_GENERATION = re.compile(r"^[a-z]{1,3}\d{1,3}$")


def _words(text):
    return [w for w in re.split(r"[^a-z0-9]+", str(text).lower()) if w]


def _glued(words, span=3):
    """Every word and every run of up to `span` adjacent words glued together."""
    out = set()
    for i in range(len(words)):
        for j in range(i + 1, min(len(words), i + span) + 1):
            out.add("".join(words[i:j]))
    return out


def model_keys(model):
    """What identifies a model in a title: its designation without brand and
    generation, glued ("Honda CBR 1000 RR" -> "cbr1000rr", "Yamaha R1 RN19" -> "r1")."""
    words = _words(model)
    if words and words[0] in _BRANDS:
        words = words[1:]
    if len(words) >= 2 and _GENERATION.match(words[-1]):
        words = words[:-1]
    return {"".join(words)} if words else set()


def is_request(title):
    return bool(_WANTED.search(title or ""))


def _title_keys(title):
    """Words and glued runs of words, but never across punctuation.

    "YZF-R1" gives yzf, r1, yzfr1; "Cbr 1000rr" gives cbr1000rr; "WR 125 R - 1.
    HAND" must not give "r1": a stand-alone dash or a full stop breaks a run.
    """
    runs, current = [], []
    for chunk in str(title).lower().split():
        clean = re.sub(r"[.,;:!?()]+$", "", chunk)
        parts = [p for p in re.split(r"[^a-z0-9]+", clean) if p]
        if not parts:
            if current:
                runs.append(current)
            current = []
            continue
        current.append(parts)
        if clean != chunk:  # ended in punctuation: the run stops here
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    keys = set()
    for run in runs:
        words = [w for parts in run for w in parts]
        keys |= _glued(words)
        for parts in run:
            keys.add("".join(parts))
    return keys


def names_a_model(title, models):
    keys = _title_keys(title)
    return any(key in keys for model in models for key in model_keys(model))


def hunt_models(conn, search_id):
    """The models a shortlist hunt names, or [] for other hunts."""
    try:
        row = conn.execute(
            """SELECT c.hunt_type, c.intent_json FROM searches s
                 JOIN campaigns c ON c.id = s.campaign_id WHERE s.id = ?""",
            (search_id,),
        ).fetchone()
    except sqlite3.OperationalError:  # a store without hunts (older schema, tests)
        return []
    # Only a model list makes the model a must. In a class hunt the models
    # are proposals searched beside the class word: a no-name fan still fits.
    if not row or row[0] != "shortlist" or not row[1]:
        return []
    try:
        models = json.loads(row[1]).get("models") or []
    except (ValueError, TypeError, AttributeError):
        return []
    return [m for m in models if isinstance(m, str) and m.strip()]


def matching_model(title, models):
    """The first named model the title shows, or None."""
    keys = _title_keys(title)
    for model in models:
        if any(key in keys for key in model_keys(model)):
            return model
    return None
