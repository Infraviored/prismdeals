"""The attributes a listing page carries as data, not as visible text.

The visible "Details" list on a listing page is missing on many pages (12 of
14 motorcycle listings on 2026-09-25 had none), yet every page embeds the
seller's attributes for its ad partners in one JSON object,
"%ENCODED_BIDDER_CUSTOM_PARAMS%": first registration year and month,
mileage, displacement, inspection date, private or commercial seller. This
reads that object and turns it into the same display fields the visible list
uses, so the rest of the app sees one shape.
"""

import json

_MONTHS = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]
_MARKER = '"%ENCODED_BIDDER_CUSTOM_PARAMS%":'


def _number(text):
    return f"{int(text):,}".replace(",", ".")


def _month_year(month, year):
    try:
        return f"{_MONTHS[int(month) - 1]} {int(year)}"
    except (ValueError, TypeError, IndexError):
        return str(year)


def bidder_params(page_html):
    """The raw attribute object of a listing page, or {}."""
    at = page_html.find(_MARKER)
    if at < 0:
        return {}
    try:
        obj, _ = json.JSONDecoder().raw_decode(page_html[at + len(_MARKER) :].lstrip())
    except ValueError:
        return {}
    return obj if isinstance(obj, dict) else {}


def display_details(params):
    """The attributes as the visible details list would name and write them."""
    out = {}
    year = params.get("Erstzulassungsjahr")
    if year and str(year).isdigit():
        month = params.get("Erstzulassungsmonat")
        out["Erstzulassung"] = _month_year(month, year) if month else str(year)
    km = params.get("Kilometerstand")
    if km and str(km).isdigit():
        out["Kilometerstand"] = f"{_number(km)} km"
    ccm = params.get("Hubraum")
    if ccm and str(ccm).isdigit():
        out["Hubraum"] = f"{_number(ccm)} ccm"
    hu_year = params.get("HU_Jahr")
    if hu_year and str(hu_year).isdigit():
        out["HU bis"] = _month_year(params.get("HU_Monat"), hu_year)
    seller = params.get("Verkaeufer")
    if seller in ("privat", "gewerblich"):
        out["Anbieter"] = "Privat" if seller == "privat" else "Gewerblich"
    return out


def merge_details(visible, page_html):
    """Visible details first; the embedded attributes fill what is missing."""
    merged = dict(display_details(bidder_params(page_html)))
    merged.update(visible or {})
    return merged
