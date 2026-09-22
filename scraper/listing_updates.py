"""Keeping a listing current, cheaply.

The scraper only ever added. A listing it had seen before was skipped outright,
so three things never happened: the price never moved, a photograph a later
harvest could have filled in never arrived, and nothing recorded that the
listing was still there.

All three are on the result page already. Updating from it costs no extra
request at all -- the page had to be fetched to find new listings anyway --
which is what makes watching a search affordable.
"""

import datetime
import json
import logging

logger = logging.getLogger(__name__)


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def apply(conn, listing):
    """Brings one known listing up to date. Returns what changed.

    Only fields a result card can speak for. The description and the rest of
    the photographs come from the detail page, and that is a separate cost with
    its own reason to be paid.
    """
    row = conn.execute(
        "SELECT price_eur, price, images FROM listings WHERE id = ?", (listing["id"],)
    ).fetchone()
    if row is None:
        return None

    old_price, old_price_text, old_images = row
    changed = {}
    sets = []
    params = []

    new_price = listing.get("price_eur")
    if new_price is not None and new_price != old_price:
        changed["price_eur"] = (old_price, new_price)
        sets += ["price_eur = ?", "price = ?"]
        params += [new_price, listing.get("price") or f"{new_price} €"]
    elif new_price is None and old_price is not None:
        # "VB" replacing a number is a change of meaning, not a gap: the seller
        # took the price down. Recorded, but the old number is not overwritten
        # with nothing.
        changed["price_withdrawn"] = (old_price, None)

    # A photograph only ever gets added. Overwriting the ones a detail fetch
    # collected with the single card thumbnail would be a loss.
    try:
        stored = json.loads(old_images or "[]")
    except ValueError:
        stored = []
    if not stored and listing.get("images"):
        changed["images"] = (0, len(listing["images"]))
        sets.append("images = ?")
        params.append(json.dumps(listing["images"], ensure_ascii=False))

    sets.append("last_seen_at = ?")
    params.append(_now())

    params.append(listing["id"])
    conn.execute(f"UPDATE listings SET {', '.join(sets)} WHERE id = ?", params)

    if "price_eur" in changed:
        # The price we are replacing is the line's starting point. Without it
        # the first change leaves a single dot, and a trail needs two prices
        # before it is a trail -- so the chart would only appear on the second
        # change, long after the interesting one.
        record_price(conn, listing["id"], old_price, first=True)
        record_price(conn, listing["id"], new_price)

    return changed


def record_price(conn, listing_id, price_eur, first=False):
    """One row per observed change. A price that holds for three weeks is one row.

    `first` writes the price a listing arrived with, and only when nothing has
    been recorded yet -- the opening point of the line, not an observation.
    """
    last = conn.execute(
        "SELECT price_eur FROM listing_price_history WHERE listing_id = ? "
        "ORDER BY seen_at DESC, rowid DESC LIMIT 1",
        (listing_id,),
    ).fetchone()
    if first and last is not None:
        return False
    if last is not None and last[0] == price_eur:
        return False
    conn.execute(
        "INSERT INTO listing_price_history (listing_id, price_eur, seen_at) VALUES (?, ?, ?)",
        (listing_id, price_eur, _now()),
    )
    return True


def history(conn, listing_id):
    """Every price this listing has carried, oldest first."""
    return [
        {"price_eur": price, "seen_at": seen}
        for price, seen in conn.execute(
            "SELECT price_eur, seen_at FROM listing_price_history "
            "WHERE listing_id = ? ORDER BY seen_at, rowid",
            (listing_id,),
        ).fetchall()
    ]
