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


def requirements_hash(fields):
    """SHA-256 prefix of the canonical buyer requirements.

    Returns None when there are no requirements (nothing to hash).
    """
    if not fields:
        return None
    canonical = []
    for f in sorted(fields, key=lambda x: x.get("id", "")):
        canonical.append(
            {
                "id": f.get("id", ""),
                "buyer_wants": f.get("buyer_wants", {}),
            }
        )
    blob = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]
