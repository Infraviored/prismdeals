"""Which way of judging a Kleinanzeigen category calls for.

A motorcycle, a RAM kit and a wardrobe are not judged the same way: the risk of
the motorcycle hides in its model, the RAM kit is all specification, and for the
wardrobe the real cost is fetching it. A profile records that difference once per
kind of thing, so the rest of the system can ask "how do we judge this?" instead
of hard-coding one answer. The reasoning lives in docs/produktkern.md.

The category is only a proposal. Kleinanzeigen files mattresses under "Schlafzimmer"
next to wardrobes; the hunt's own intent may overrule it. This module answers the
proposal, deterministically and without a model call.

Categories come from data/kleinanzeigen_taxonomy.json. A category not named in
CATEGORY_PROFILE inherits from its parent, so whole branches (all jobs, all real
estate) are assigned once at the top.
"""

import dataclasses
import functools
import json
import os
import re

TAXONOMY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "kleinanzeigen_taxonomy.json",
)

AXES = ("identity", "risk", "value", "procurement", "fit")


@dataclasses.dataclass(frozen=True)
class Profile:
    key: str
    label: str
    # Weight 0-3 per axis, in AXES order: how much each question decides the buy.
    weights: tuple
    # How much of what can be wrong is invisible in text and photos (0-3).
    hidden: int
    # Whether that hidden risk differs per model rather than per category.
    model_dependent: bool
    # What research is worth doing: "deep", "shallow", "category", "schema",
    # "none", or "decide" when the hunt's intent has to settle it.
    research: str
    # Headings the research answer must use; empty when no research is asked for.
    research_headings: tuple = ()
    judged: bool = True

    def weight(self, axis):
        return self.weights[AXES.index(axis)]


PROFILES = {
    p.key: p
    for p in (
        Profile(
            "vehicle",
            "Fahrzeug",
            (2, 3, 3, 3, 2),
            hidden=3,
            model_dependent=True,
            research="deep",
            research_headings=(
                "Einordnung",
                "Bekannte Schwächen",
                "Wartung und Verschleiß",
                "Warnzeichen in Anzeigen",
                "Werttreiber",
                "Eignung für den Einsatz",
                "Fragen an den Verkäufer",
                "Quellen",
            ),
        ),
        Profile(
            "performance_tech",
            "Leistungstechnik",
            (2, 2, 3, 1, 1),
            hidden=2,
            model_dependent=True,
            research="shallow",
            research_headings=(
                "Einordnung",
                "Leistungswerte",
                "Bekannte Schwächen",
                "Eignung für den Einsatz",
                "Quellen",
            ),
        ),
        Profile(
            "wear_device",
            "Gerät mit Verschleiß",
            (2, 3, 2, 2, 1),
            hidden=2,
            model_dependent=True,
            research="shallow",
            research_headings=(
                "Einordnung",
                "Wartung und Verschleiß",
                "Warnzeichen in Anzeigen",
                "Fragen an den Verkäufer",
                "Quellen",
            ),
        ),
        Profile(
            "spec",
            "Spezifikation",
            (3, 1, 2, 1, 0),
            hidden=1,
            model_dependent=False,
            research="schema",
            research_headings=("Aufbau der Teilenummer", "Revisionen", "Quellen"),
        ),
        Profile(
            "large_furniture",
            "Großmöbel",
            (1, 1, 1, 3, 3),
            hidden=1,
            model_dependent=False,
            research="none",
        ),
        Profile(
            "hygiene_safety",
            "Hygiene und Sicherheit",
            (2, 3, 2, 2, 2),
            hidden=3,
            model_dependent=False,
            research="category",
            research_headings=(
                "Warnzeichen in Anzeigen",
                "Ablauf und Normen",
                "Fragen an den Verkäufer",
                "Quellen",
            ),
        ),
        Profile(
            "fashion",
            "Mode",
            (2, 1, 2, 1, 3),
            hidden=1,
            model_dependent=True,
            research="shallow",
            research_headings=("Einordnung", "Echtheitsmerkmale", "Quellen"),
        ),
        Profile(
            "collectible",
            "Sammeln und Wert",
            (3, 2, 3, 1, 2),
            hidden=2,
            model_dependent=True,
            research="deep",
            research_headings=(
                "Einordnung",
                "Echtheitsmerkmale",
                "Vollständigkeit",
                "Werttreiber",
                "Quellen",
            ),
        ),
        Profile(
            "taste",
            "Geschmack",
            (1, 1, 1, 2, 3),
            hidden=0,
            model_dependent=False,
            research="none",
        ),
        Profile(
            "open",
            "Offen",
            (0, 0, 0, 0, 0),
            hidden=0,
            model_dependent=False,
            research="decide",
        ),
        Profile(
            "out_of_scope",
            "Außerhalb",
            (0, 0, 0, 0, 0),
            hidden=0,
            model_dependent=False,
            research="none",
            judged=False,
        ),
    )
}

# Category id -> profile key. Ids not listed inherit from their parent.
_ASSIGNMENTS = {
    "vehicle": (216, 305, 220, 211, 276),
    "performance_tech": (278, 228, 173, 285, 279, 245, 405, 175),
    "wear_device": (176, 172, 84, 217, 74, 407, 408),
    "spec": (225, 223, 306, 406, 227, 76, 77, 78, 79),
    "large_furniture": (81, 88, 86, 93, 20, 91),
    "hygiene_safety": (21, 25, 258, 90),
    "fashion": (154, 158, 159, 160, 19, 22, 156, 224),
    "collectible": (157, 240, 234, 249, 284),
    "taste": (82, 246, 89, 281, 232, 282, 313, 23),
    "open": (
        # Mixed top-level branches: a search over all of "Elektronik" says
        # nothing about what is being hunted.
        17,
        73,
        80,
        130,
        153,
        161,
        185,
        210,
        272,
        # "Weiteres ..." and catch-alls.
        168,
        18,
        75,
        87,
        155,
        230,
        241,
        242,
        250,
        248,
        192,
        273,
    ),
    "out_of_scope": (
        # Whole branches: jobs, real estate, courses, tickets, services.
        102,
        195,
        235,
        231,
        297,
        # Services, animals and notices filed under goods branches.
        400,
        401,
        226,
        239,
        280,
        133,
        237,
        236,
        187,
        189,
        191,
        233,
        238,
        274,
        132,
        134,
        135,
        136,
        138,
        139,
        243,
        283,
    ),
}

CATEGORY_PROFILE = {str(cat): key for key, cats in _ASSIGNMENTS.items() for cat in cats}


@functools.lru_cache(maxsize=1)
def taxonomy():
    """Category id -> {name, parent_id}, from the harvested taxonomy."""
    with open(TAXONOMY_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return {
        c["id"]: {"name": c["name"], "parent_id": c["parent_id"]}
        for c in data["categories"]
    }


# /s-anzeige/<slug>/<ad id>-<category>-<location>
_LISTING_RE = re.compile(r"/s-anzeige/[^/?#]+/\d+-(\d+)-\d+")
# The last path segment of a search: "c17", "k0c278", "k0c278l6411r30+notebooks.ram_s:16gb".
_SEARCH_TAIL_RE = re.compile(r"^(?:k\d+)?c(\d+)(?:[lr+].*)?$")


def category_from_url(url):
    """The category id a listing or search URL carries, or None.

    A listing URL states it outright. A search URL carries it only in its last
    path segment ("k0c278l6411"). Anywhere else a "c" and digits is part of what
    someone typed: "mercedes-c220" is a car model, not category 220 (campers).
    A search over all categories ("k0" without c) has none.
    """
    if not url:
        return None
    path = re.sub(r"^https?://[^/]+", "", url).split("?")[0].split("#")[0]
    match = _LISTING_RE.search(path)
    if match:
        return match.group(1)
    segments = [s for s in path.split("/") if s]
    if not segments:
        return None
    match = _SEARCH_TAIL_RE.match(segments[-1])
    if match and match.group(1) in taxonomy():
        return match.group(1)
    return None


def profile_for_category(category_id):
    """The profile a category proposes, walking up to its nearest assigned
    ancestor. None for an id the taxonomy does not know."""
    known = taxonomy()
    current = str(category_id) if category_id is not None else None
    if current not in known:
        return None
    while current is not None:
        if current in CATEGORY_PROFILE:
            return PROFILES[CATEGORY_PROFILE[current]]
        current = known[current]["parent_id"]
    return None


def profile_for(listing_url=None, search_url=None):
    """(profile, category_id, source) for a listing, preferring what the listing
    itself says over what the search was restricted to.

    source is "listing", "search" or None. Without any category the profile is
    "open": the hunt's intent has to decide.
    """
    for source, url in (("listing", listing_url), ("search", search_url)):
        category = category_from_url(url)
        if category is not None:
            profile = profile_for_category(category)
            if profile is not None:
                return profile, category, source
    return PROFILES["open"], None, None


def main(argv=None):
    """Print the proposed profile for each URL, or a coverage report of the
    live database's listings (read-only) with --db."""
    import argparse
    import collections
    import sqlite3

    ap = argparse.ArgumentParser(description=main.__doc__)
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--db", help="SQLite path, opened read-only")
    args = ap.parse_args(argv)

    for url in args.urls:
        is_listing = "/s-anzeige/" in url
        profile, category, source = profile_for(
            listing_url=url if is_listing else None,
            search_url=None if is_listing else url,
        )
        name = taxonomy().get(category, {}).get("name", "keine Kategorie")
        print(
            f"{profile.label:24} c{category or '-':5} {name} ({source or '-'})  {url}"
        )

    if args.db:
        conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
        rows = conn.execute(
            "SELECT l.url, s.url FROM listings l LEFT JOIN searches s ON s.id = l.search_id"
        ).fetchall()
        by_listing = collections.Counter()
        by_search = collections.Counter()
        for listing_url, search_url in rows:
            by_listing[profile_for(listing_url=listing_url)[0].label] += 1
            by_search[profile_for(search_url=search_url)[0].label] += 1
        print(f"{len(rows)} Anzeigen   aus der Anzeige   nur aus der Suche")
        for label in sorted(set(by_listing) | set(by_search)):
            print(f"  {label:24} {by_listing[label]:>8} {by_search[label]:>17}")


if __name__ == "__main__":
    main()
