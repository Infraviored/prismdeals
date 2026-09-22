"""Turning what a buyer set up into what the scorer weighs.

The pipeline refuses a listing whose knowledge set defines no fields, and it is
right to: without something the buyer wants, a fact sheet cannot be scored, and
the legacy worker would extract the same listing a second time at a second
model call.

That intent used to come from a wizard which, in practice, wrote `{}`. All three
stored knowledge sets are empty objects, which is why 10 of 1266 listings were
ever scored and all ten landed on exactly 50.

It does not need a wizard. A buyer who picks the Notebooks category and sets
"512 GB, condition like new" has already said what matters. Those filters ride
in the search URL, so the intent is a pure function of the search -- no model
call, no per-buyer prompt, which is what docs/ROADMAP.md requires.

Two vocabularies meet here and neither is the other's. The site writes
`like_new` and `1tb` and `up_to_12`; the playbooks were authored in German and
in plain numbers -- `neuwertig`, gigabytes, inches. Every translation below was
checked against data/kleinanzeigen_taxonomy.json and playbooks.py, and
test_intent_from_filters asserts that both ends of every mapping still exist, so
a renamed filter or field fails a test instead of silently producing no intent.
"""

import logging
import re

logger = logging.getLogger(__name__)

# taxonomy filter key -> playbook field id, per playbook.
FILTER_TO_FIELD = {
    "electronics/laptops": {
        "notebooks.brand_s": "brand",
        "notebooks.processor_s": "cpuModel",
        "notebooks.ram_s": "ramGb",
        "notebooks.storage_s": "storageGb",
        "notebooks.screen_size_s": "screenInches",
        "global.zustand": "conditionGrade",
    },
    "electronics/phones": {
        "handy_telekom.art_s": "brand",
        "global.zustand": "conditionGrade",
    },
    "computing/memory": {
        "pc_zubehoer_software.art_s": "productLine",
        "global.zustand": "conditionGrade",
    },
    "vehicles/cars": {
        "autos.marke_s": "make",
        "autos.km_i": "mileageKm",
        "autos.ez_i": "firstRegistrationYear",
        "global.zustand": "conditionGrade",
    },
}

# The site's five condition values, in each playbook's own words. Without this
# the intent asks for `like_new` against an enum of neuwertig/gut/gebraucht/
# defekt, which never matches -- and scoring.py answers a miss with half marks,
# so a pristine laptop and a broken one score the same on condition.
CONDITION_VALUES = {
    "neuwertig": {
        "new": "neuwertig",
        "new_with_tag": "neuwertig",
        "like_new": "neuwertig",
        "ok": "gut",
        "alright": "gebraucht",
        "defect": "defekt",
    },
    "sehr gut": {
        "new": "sehr gut",
        "new_with_tag": "sehr gut",
        "like_new": "sehr gut",
        "ok": "gut",
        "alright": "gebraucht",
        "defect": "bastler",
    },
}

# "16gb" -> 16, "1tb" -> 1024, "15_6_zoll" -> 15.6.
_NUMBER = re.compile(r"(\d+(?:[._]\d+)?)")
_TERABYTE = re.compile(r"\dtb\b|\dtb$")


def _as_number(value):
    text = str(value).lower()
    match = _NUMBER.search(text)
    if not match:
        return None
    try:
        number = float(match.group(1).replace("_", "."))
    except ValueError:
        return None
    # "1tb" carries the same digit as "1gb" and means a thousand times more.
    if "tb" in text:
        number *= 1024
    return number


def _numeric_bounds(value):
    """What a number-ish filter value actually constrains.

    Three shapes, and reading any of them as a bare minimum inverts it:
      "16gb"          -> at least 16
      "up_to_12"      -> at most 12
      "10000,80000"   -> between, a range filter's own min,max form
    """
    text = str(value).lower()

    if "," in text:
        low, _, high = text.partition(",")
        bounds = {}
        low_n, high_n = _as_number(low), _as_number(high)
        if low_n is not None:
            bounds["min"] = low_n
        if high_n is not None:
            bounds["max"] = high_n
        return bounds or None

    number = _as_number(text)
    if number is None:
        return None
    if text.startswith("up_to") or text.startswith("bis"):
        return {"max": number}
    return {"min": number}


def intent_fields(playbook, attributes):
    """Intent field entries for the attribute filters a search carries.

    `attributes` are the raw tail filters, e.g. ["notebooks.storage_s:1tb"].
    """
    if not playbook or not attributes:
        return []

    mapping = FILTER_TO_FIELD.get(playbook.get("key"), {})
    if not mapping:
        return []

    definitions = {f["id"]: f for f in playbook.get("fields", [])}

    fields = []
    seen = set()
    for attribute in attributes:
        if ":" not in attribute:
            continue
        key, value = attribute.split(":", 1)
        field_id = mapping.get(key)
        if not field_id or field_id in seen:
            continue
        definition = definitions.get(field_id)
        if definition is None:
            logger.warning(
                "Playbook %s has no field %s.", playbook.get("key"), field_id
            )
            continue

        # Each field type has its own vocabulary in scoring.py, and using the
        # wrong one is silent: a text field ignores "match" entirely and scores
        # on presence, so a brand preference written that way does nothing.
        field_type = definition.get("type")
        if field_type in ("number", "tier"):
            wants = _numeric_bounds(value)
            if not wants:
                logger.debug("No bounds in %r for %s; skipping.", value, field_id)
                continue
        elif field_type == "enum":
            options = definition.get("options") or []
            translated = CONDITION_VALUES.get(options[0] if options else None, {}).get(
                value, value
            )
            if translated not in options:
                logger.debug(
                    "%r is not one of %s's values; skipping.", translated, field_id
                )
                continue
            wants = {"preferred": [translated]}
        elif field_type == "text":
            # Kleinanzeigen has already filtered the result set on this -- only
            # Apple listings come back from an Apple search. What is worth
            # scoring is whether the fact could be read at all.
            wants = {"present": True}
        else:
            logger.debug(
                "No intent vocabulary for %s fields; skipping %s.", field_type, field_id
            )
            continue

        fields.append({"id": field_id, "importance": "high", "buyer_wants": wants})
        seen.add(field_id)

    return fields


def intent_for_search(playbook, search_url, parse_tail):
    """The intent a search URL expresses, or an empty one.

    `parse_tail` is injected so this module does not depend on search_url, which
    keeps it importable in tests without the URL grammar.
    """
    parts = parse_tail(search_url) if search_url else None
    attributes = parts.get("attributes") if parts else None
    return {
        "fields": intent_fields(playbook, attributes or []),
        "dimensions_enabled": False,
    }
