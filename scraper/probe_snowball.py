"""Snowball model names from likely titles and test title-token admissibility.

Implements plan §5.5:
- Model names: n-grams from `likely` titles that repeat >= 3x and are not generic.
- Known model patterns for laptops/phones first, n-grams second.
- Title-token test: share of likely titles containing a size/spec token.
  < 30 % -> token must NOT become a search term (e.g. wardrobe width).
  >= 60 % -> token MAY become a search term (e.g. mattress 140x200).
"""

import collections
import re
import logging

logger = logging.getLogger(__name__)

# Common classifieds noise words that should never become part of a model query
COMMON_STOP_WORDS = {
    "top",
    "zustand",
    "neu",
    "ovp",
    "sehr",
    "gut",
    "vb",
    "versand",
    "zubehoer",
    "defekt",
    "gebraucht",
    "inkl",
    "fuer",
    "oder",
    "und",
    "mit",
    "von",
    "wie",
    "der",
    "die",
    "das",
    "ein",
    "eine",
    "einen",
    "im",
    "in",
    "am",
    "an",
    "ab",
    "original",
    "privat",
    "privatverkauf",
    "nur",
    "abholung",
    "ohne",
    "festpreis",
    "super",
    "tollen",
    "tolles",
    "hallo",
    "verkaufe",
    "biete",
    "suche",
    "abzuholen",
}

CATEGORY_STOP_WORDS = {
    "c278": {  # Laptops
        "laptop",
        "notebook",
        "pc",
        "computer",
        "gb",
        "tb",
        "ssd",
        "ram",
        "intel",
        "amd",
        "core",
        "ghz",
        "display",
        "zoll",
        "windows",
        "prozessor",
        "grafikkarte",
        "arbeitsspeicher",
        "festplatte",
        "charger",
        "ladekabel",
        "netzteil",
    },
    "c173": {  # Phones
        "handy",
        "smartphone",
        "telefon",
        "gb",
        "pro",
        "plus",
        "max",
        "ultra",
        "simlock",
        "huelle",
        "panzerglas",
    },
    "furniture": {
        "schrank",
        "kleiderschrank",
        "matratze",
        "bett",
        "tisch",
        "stuhl",
        "moebel",
        "ikea",
        "cm",
        "weiss",
        "schwarz",
        "braun",
        "holz",
        "massiv",
        "breite",
        "hoehe",
        "tiefe",
    },
}

# Regex patterns for well-known hardware model lines
KNOWN_MODEL_PATTERNS = {
    "c278": [
        re.compile(r"\b(thinkpad\s+[a-z]\d{3}[a-z]?)\b", re.I),
        re.compile(r"\b(thinkpad\s+x1\s+carbon(?:\s+gen\s*\d+)?)\b", re.I),
        re.compile(r"\b(macbook\s+(?:air|pro)(?:\s+(?:m\d+|\d{2}))?)\b", re.I),
        re.compile(
            r"\b(zenbook\s+(?:pro\s+|duo\s+|flip\s+)?\d{2}(?:\s+oled)?)\b", re.I
        ),
        re.compile(r"\b(xps\s+\d{2,4})\b", re.I),
        re.compile(r"\b(elitebook\s+\d{3,4}(?:\s*g\d+)?)\b", re.I),
        re.compile(r"\b(latitude\s+\d{4})\b", re.I),
        re.compile(r"\b(surface\s+(?:pro|laptop|book|go)(?:\s*\d+)?)\b", re.I),
        re.compile(r"\b(yoga\s+(?:slim\s+)?\d{1,2}[a-z]?)\b", re.I),
        re.compile(r"\b(legion\s+[a-z]?\d{1,4})\b", re.I),
        re.compile(r"\b(envy\s+\d{2})\b", re.I),
    ]
}


def _get_stop_words(category_code):
    stops = set(COMMON_STOP_WORDS)
    if category_code in CATEGORY_STOP_WORDS:
        stops.update(CATEGORY_STOP_WORDS[category_code])
    return stops


def extract_models_from_titles(titles, category_code=None, min_repeats=3):
    """Extract candidate model names from a list of titles.

    First checks known brand/model regexes. Then mines repeating n-grams
    that appear >= min_repeats times and are not in the stop list.

    Returns a list of extracted model strings ordered by frequency.
    """
    if not titles:
        return []

    found_models = collections.Counter()

    # Step 1: Known model regex patterns (for laptops, phones, etc.)
    patterns = KNOWN_MODEL_PATTERNS.get(category_code, [])
    for title in titles:
        for pat in patterns:
            match = pat.search(title)
            if match:
                clean = re.sub(r"\s+", " ", match.group(1)).strip()
                found_models[clean] += 1

    # Step 2: N-gram extraction for repeating candidate phrases
    stop_words = _get_stop_words(category_code)
    ngram_counts = collections.Counter()

    for title in titles:
        words = re.findall(r"\b[a-zA-Z0-9_\-\./]+\b", title)
        # Clean words
        clean_words = []
        for w in words:
            cleaned = w.strip(".-_/").lower()
            if cleaned:
                clean_words.append(cleaned)

        # 2-grams and 3-grams
        for n in (2, 3):
            for i in range(len(clean_words) - n + 1):
                gram = clean_words[i : i + n]
                # Reject if all words are stop words or purely numeric without units
                if all(w in stop_words for w in gram):
                    continue
                if all(w.isdigit() for w in gram):
                    continue
                # Also must contain at least one non-stop word of len >= 3
                if not any(len(w) >= 3 and w not in stop_words for w in gram):
                    continue
                candidate = " ".join(gram)
                ngram_counts[candidate] += 1

    for cand, count in ngram_counts.items():
        if count >= min_repeats:
            found_models[cand] = max(found_models[cand], count)

    # Filter out models that are substrings of another higher-frequency model
    results = []
    for model, _ in found_models.most_common():
        # Clean capitalization if it's all lower
        name = model.title() if model.islower() else model
        if not any(name.lower() in existing.lower() for existing in results):
            results.append(name)

    return results


def check_title_token(token, titles):
    """Test whether a size or spec token should be allowed as a search term.

    Calculates share of titles containing the token:
    < 30 % -> False (not a search term, sellers don't write it)
    >= 60 % -> True (admissible search term, sellers consistently write it)
    30 % - 59 % -> False (insufficient consistency)

    Returns:
        (allowed: bool, share: float)
    """
    if not token or not titles:
        return False, 0.0

    tok = token.strip().lower()
    # Normalize dimension characters (x or *)
    pattern_str = (
        r"\b" + re.escape(tok).replace(r"\*", r"[x×*]").replace(r"x", r"[x×*]") + r"\b"
    )
    try:
        pat = re.compile(pattern_str, re.I)
    except Exception:
        pat = re.compile(re.escape(tok), re.I)

    matches = 0
    for title in titles:
        if pat.search(title or ""):
            matches += 1

    share = matches / len(titles)
    allowed = share >= 0.60
    return allowed, round(share, 3)
