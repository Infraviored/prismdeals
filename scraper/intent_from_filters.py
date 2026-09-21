"""Turning what a buyer set up into what the scorer weighs.

The pipeline refuses a listing whose knowledge set defines no fields, and it is
right to: without something the buyer wants, a fact sheet cannot be scored, and
the legacy worker would extract the same listing a second time at a second
model call.

That intent used to come from a wizard which, in practice, wrote `{}`. All three
stored knowledge sets are empty objects, which is why 10 of 1266 listings were
ever scored and all ten landed on exactly 50.

It does not need a wizard. A buyer who picks the Notebooks category and sets
"brand: Apple, RAM: 16 GB" has already said what matters. Those filters ride in
the search URL, so the intent is a pure function of the search -- no model call,
no per-buyer prompt, which is what docs/ROADMAP.md requires.

Only filters that map onto a playbook field become intent. A filter the site
offers and the playbook does not model is still applied by Kleinanzeigen itself
when the search runs; it simply has no fact to be scored against.
"""

import logging
import re

logger = logging.getLogger(__name__)

# taxonomy filter key -> playbook field id, per playbook.
#
# Kept here rather than in playbooks.py because it joins two vocabularies that
# were built independently: the site's filter names, harvested from live pages,
# and the field ids the extraction prompt asks for.
FILTER_TO_FIELD = {
    "electronics/laptops": {
        "notebooks.brand_s": "brand",
        "notebooks.processor_s": "cpuModel",
        "notebooks.ram_s": "ramGb",
        "notebooks.storage_s": "storageGb",
        "notebooks.screen_size_s": "screenInches",
        "notebooks.model_year_s": "modelYear",
        "global.zustand": "conditionGrade",
    },
    "electronics/phones": {
        "handy_telekom.brand_s": "brand",
        "handy_telekom.storage_s": "storageGb",
        "global.zustand": "conditionGrade",
    },
    "vehicles/cars": {
        "autos.marke_s": "brand",
        "autos.km_i": "mileageKm",
        "autos.baujahr_i": "modelYear",
    },
}

# "16gb" -> 16, "512gb" -> 512, "15_6_zoll" -> 15.6. The site writes sizes as
# slugs; a field typed `number` needs the number out of them.
_NUMBER_IN_SLUG = re.compile(r"(\d+(?:[._]\d+)?)")


def _as_number(value):
    match = _NUMBER_IN_SLUG.search(str(value))
    if not match:
        return None
    try:
        return float(match.group(1).replace("_", "."))
    except ValueError:
        return None


def intent_fields(playbook, attributes):
    """Intent field entries for the attribute filters a search carries.

    `attributes` are the raw tail filters, e.g. ["notebooks.brand_s:apple"].
    """
    if not playbook or not attributes:
        return []

    mapping = FILTER_TO_FIELD.get(playbook.get("key"), {})
    if not mapping:
        return []

    types = {f["id"]: f.get("type") for f in playbook.get("fields", [])}

    fields = []
    seen = set()
    for attribute in attributes:
        if ":" not in attribute:
            continue
        key, value = attribute.split(":", 1)
        field_id = mapping.get(key)
        if not field_id or field_id in seen:
            continue

        # Each field type has its own vocabulary in scoring.py, and using the
        # wrong one is silent: a text field ignores "match" entirely and scores
        # on presence, so a brand preference written that way does nothing.
        field_type = types.get(field_id)
        if field_type == "number":
            number = _as_number(value)
            if number is None:
                logger.debug("No number in %r for %s; skipping.", value, field_id)
                continue
            # A buyer asking for 16 GB is asking for at least 16 GB. Nobody
            # filters for "exactly this much RAM and no more".
            wants = {"min": number}
        elif field_type == "enum":
            wants = {"preferred": [value]}
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
