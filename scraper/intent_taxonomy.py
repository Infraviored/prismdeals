"""Taxonomy filter mapping and category defaults for intent parsing.

Provides taxonomy lookups, default hunt type tables, and filter mapping logic
for mapping LLM filter candidates to Kleinanzeigen category attribute keys.
"""

import json
import logging
import os
import re

logger = logging.getLogger(__name__)

_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT_DIR = os.path.dirname(_CURRENT_DIR)
TAXONOMY_PATH = os.path.join(_ROOT_DIR, "data", "kleinanzeigen_taxonomy.json")

VALID_HUNT_TYPES = {
    "exact",
    "shortlist",
    "class",
    "features",
    "fit",
    "taste",
    "opportunity",
}

# Category slug/id to default hunt type when no model is available.
DEFAULT_HUNT_TYPES_BY_SLUG = {
    "notebooks": "features",
    "multimedia-elektronik": "features",
    "tv-video": "features",
    "audio-hifi": "features",
    "pcs": "features",
    "tablets-reader": "features",
    "haushaltsgeraete": "features",
    "pc-zubehoer-software": "exact",
    "autoteile-reifen": "exact",
    "spielzeug": "exact",
    "motorraeder-roller": "shortlist",
    "autos": "shortlist",
    "handy-telekom": "shortlist",
    "schlafzimmer": "fit",
    "kinderzimmermoebel": "fit",
    "baby-kinderkleidung": "fit",
    "baby-kinderschuhe": "fit",
    "fahrraeder": "fit",
    "babyschalen-kindersitze": "fit",
    "wohnzimmer": "taste",
    "haus-garten/sonstiges": "taste",
    "musikinstrumente": "taste",
    "handarbeit-basteln-kunsthandwerk": "taste",
    "heimwerken": "opportunity",
    "bau-handwerk-produktion": "opportunity",
}

DEFAULT_HUNT_TYPES_BY_ID = {
    "278": "features",  # Laptops & Notebooks
    "161": "features",  # Elektronik
    "175": "features",  # TV & Video
    "172": "features",  # Audio & Hifi
    "228": "features",  # PCs
    "285": "features",  # Tablets
    "176": "features",  # Haushaltsgeräte
    "225": "exact",  # PC-Zubehör & Software (e.g. RAM)
    "223": "exact",  # Autoteile & Reifen
    "23": "exact",  # Spielzeug (e.g. Lego)
    "305": "shortlist",  # Motorräder
    "216": "shortlist",  # Autos
    "173": "shortlist",  # Handys
    "81": "fit",  # Schlafzimmer (Matratzen, Schränke)
    "20": "fit",  # Kinderzimmermöbel
    "22": "fit",  # Kinderkleidung
    "217": "fit",  # Fahrräder (20 Zoll etc.)
    "21": "fit",  # Kindersitze
    "88": "taste",  # Wohnzimmer (Sessel, Sofas)
    "74": "taste",  # Musikinstrumente
    "84": "opportunity",  # Heimwerken (Werkzeug)
}

FILTER_ALIASES = {
    "ram": ("ram_s", "ram"),
    "ram_gb": ("ram_s", "ram"),
    "memory": ("ram_s", "ram"),
    "storage": ("storage_s", "art_s"),
    "speicher": ("storage_s", "art_s"),
    "storage_gb": ("storage_s",),
    "festplatte": ("storage_s",),
    "ssd": ("storage_s",),
    "processor": ("processor_s",),
    "cpu": ("processor_s",),
    "prozessor": ("processor_s",),
    "brand": ("brand_s", "marke_s", "art_s"),
    "marke": ("brand_s", "marke_s", "art_s"),
    "hersteller": ("brand_s", "marke_s"),
    "screen_size": ("screen_size_s",),
    "bildschirm": ("screen_size_s",),
    "zoll": ("screen_size_s", "groesse_s"),
    "display": ("screen_size_s",),
    "km": ("km_i",),
    "mileage": ("km_i",),
    "kilometer": ("km_i",),
    "kilometerstand": ("km_i",),
    "ez": ("ez_i",),
    "year": ("ez_i", "model_year_s"),
    "baujahr": ("ez_i", "model_year_s"),
    "erstzulassung": ("ez_i",),
    "hubraum": ("hubraum_i",),
    "ccm": ("hubraum_i",),
    "leistung": ("leistung_i",),
    "power": ("leistung_i",),
    "ps": ("leistung_i",),
    "kw": ("leistung_i",),
    "condition": ("global.zustand",),
    "zustand": ("global.zustand",),
    "color": ("global.farbe",),
    "farbe": ("global.farbe",),
    "preis": ("preis",),
    "price": ("preis",),
    "anbieter": ("anbieter",),
    "poster_type": ("anbieter",),
}

_TAXONOMY_CACHE = None


def load_taxonomy():
    """Loads and caches the Kleinanzeigen taxonomy."""
    global _TAXONOMY_CACHE
    if _TAXONOMY_CACHE is not None:
        return _TAXONOMY_CACHE

    if not os.path.exists(TAXONOMY_PATH):
        logger.warning("Taxonomy file not found at %s", TAXONOMY_PATH)
        return {"categories": [], "global_filters": {}}

    try:
        with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
            _TAXONOMY_CACHE = json.load(f)
    except Exception as e:
        logger.error("Failed to load taxonomy JSON: %s", e)
        _TAXONOMY_CACHE = {"categories": [], "global_filters": {}}
    return _TAXONOMY_CACHE


def find_category(category_key):
    """Finds category data by ID or slug."""
    if not category_key:
        return None
    tax = load_taxonomy()
    key_str = str(category_key).strip().lower()
    for cat in tax.get("categories", []):
        if str(cat.get("id")) == key_str or cat.get("slug") == key_str:
            return cat
        if key_str in cat.get("slug", "").split("/"):
            return cat
    return None


def default_hunt_type_for_category(category_key):
    """Returns default hunt_type for a given category ID or slug."""
    if not category_key:
        return "features"
    cat = find_category(category_key)
    if cat:
        cid = str(cat.get("id"))
        if cid in DEFAULT_HUNT_TYPES_BY_ID:
            return DEFAULT_HUNT_TYPES_BY_ID[cid]
        slug = cat.get("slug", "")
        if slug in DEFAULT_HUNT_TYPES_BY_SLUG:
            return DEFAULT_HUNT_TYPES_BY_SLUG[slug]
        for part in slug.split("/"):
            if part in DEFAULT_HUNT_TYPES_BY_SLUG:
                return DEFAULT_HUNT_TYPES_BY_SLUG[part]
    cat_str = str(category_key).lower()
    if cat_str in DEFAULT_HUNT_TYPES_BY_ID:
        return DEFAULT_HUNT_TYPES_BY_ID[cat_str]
    if cat_str in DEFAULT_HUNT_TYPES_BY_SLUG:
        return DEFAULT_HUNT_TYPES_BY_SLUG[cat_str]
    return "features"


def map_filters_to_taxonomy(raw_filters, category_info):
    """Maps candidate filters to taxonomy keys for the category.

    Rule: mapped filters stay in filters with canonical taxonomy key;
    unknown filters become musts.
    Returns: (mapped_filters, extra_musts)
    """
    mapped_filters = {}
    extra_musts = []

    if not raw_filters or not isinstance(raw_filters, dict):
        return mapped_filters, extra_musts

    cat_filters = category_info.get("filters", []) if category_info else []
    cat_keys = {f.get("key"): f for f in cat_filters if f.get("key")}
    global_keys = {
        "preis",
        "global.zustand",
        "global.farbe",
        "anbieter",
        "anzeige",
        "direktkaufen",
        "paketdienst",
    }

    for raw_k, raw_v in raw_filters.items():
        k_clean = str(raw_k).strip()
        k_lower = k_clean.lower()
        matched_key = None

        if k_clean in cat_keys or k_clean in global_keys:
            matched_key = k_clean
        elif k_lower in cat_keys or k_lower in global_keys:
            matched_key = k_lower

        if not matched_key:
            for cat_k in cat_keys:
                if (
                    cat_k.endswith(f".{k_lower}")
                    or cat_k.endswith(f"_{k_lower}_s")
                    or cat_k.endswith(f"_{k_lower}_i")
                ):
                    matched_key = cat_k
                    break

        if not matched_key and k_lower in FILTER_ALIASES:
            for candidate in FILTER_ALIASES[k_lower]:
                if candidate in cat_keys or candidate in global_keys:
                    matched_key = candidate
                    break
                for cat_k in cat_keys:
                    if cat_k.endswith(f".{candidate}") or cat_k.endswith(
                        f"_{candidate}"
                    ):
                        matched_key = cat_k
                        break
                if matched_key:
                    break

        if matched_key:
            mapped_filters[matched_key] = raw_v
        else:
            must_id = (
                f"filter_{re.sub(r'[^a-zA-Z0-9_]+', '_', k_clean).strip('_').lower()}"
            )
            if isinstance(raw_v, bool):
                m_type = "boolean"
                want = {"present": raw_v}
            elif isinstance(raw_v, (int, float)):
                m_type = "number"
                want = {"min": raw_v}
            elif isinstance(raw_v, list):
                m_type = "enum"
                want = {"oneOf": raw_v}
            else:
                m_type = "text"
                want = {"match": str(raw_v)}

            extra_musts.append(
                {
                    "id": must_id,
                    "label": k_clean.replace("_", " ").title(),
                    "type": m_type,
                    "want": want,
                }
            )

    return mapped_filters, extra_musts
