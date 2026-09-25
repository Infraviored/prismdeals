"""Stable hash of normalised requirement fields.

A requirements version is the hash of what the buyer wants: the fields array
from the knowledge set, stripped to (id, buyer_wants) pairs, sorted by id,
and hashed.  Two knowledge sets with identical buyer requirements produce the
same hash regardless of when or how they were created.

The hash is written into both listing_fit (per verdict) and knowledge_sets
(per requirement save), so readers can resolve a verdict by joining on the
hash rather than the search id.
"""

import hashlib
import json


def _normal(value):
    """Integral floats as ints, recursively: JSON from Node has no 3200.0."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: _normal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normal(v) for v in value]
    return value


def requirements_hash(fields):
    """SHA-256 prefix of the canonical buyer requirements.

    Returns None when there are no requirements (nothing to hash). Must equal
    backend/db/requirements_hash.js byte for byte: non-ASCII stays literal
    ("grün", as JSON.stringify writes it) and 3200.0 is 3200.
    """
    if not fields:
        return None
    canonical = []
    for f in sorted(fields, key=lambda x: x.get("id", "")):
        entry = {
            "id": f.get("id", ""),
            "buyer_wants": _normal(f.get("buyer_wants", {})),
        }
        # Which models a requirement is for changes what it asks. Only when
        # set, so every hash from before scoping existed stays the same.
        if f.get("applies_to"):
            entry["applies_to"] = sorted(_normal(f["applies_to"]), key=str)
        canonical.append(entry)
    blob = json.dumps(
        canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]
