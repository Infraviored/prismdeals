"""The last resort: look at the photographs.

Two offers out of eighty-seven reach this point. Everything else was settled by
a title or a description, which is the whole design -- a model call is the most
expensive question this product can ask, so it is asked last and about as little
as possible.

What it is asked is narrow: not "is this a good offer" but "what does the label
on the stick say". The timing (3200) and the latency (CL16) are printed on the
module's own sticker, which is why a photograph can answer where the text could
not.

The images are sent together in one call. Two sticks photographed from different
angles are one question about one product, and splitting them into two calls
would double the cost to halve the evidence.
"""

import base64
import json
import logging
import urllib.request

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
}

# Kleinanzeigen serves a thumbnail by default; the rule in the URL asks for a
# size a label can actually be read at.
FULL_SIZE = "?rule=$_59.JPG"


def fetch_images(urls, limit=3):
    """Downloads up to `limit` images as data URLs."""
    out = []
    for url in urls[:limit]:
        base = url.split("?")[0] + FULL_SIZE
        try:
            with urllib.request.urlopen(
                urllib.request.Request(base, headers=HEADERS), timeout=25
            ) as response:
                raw = response.read()
            out.append("data:image/jpeg;base64," + base64.b64encode(raw).decode())
        except Exception as exc:
            logger.warning("Could not fetch %s: %s", base, exc)
    return out


def build_question(spec, listing, missing):
    """One question, about the facts that are still open."""
    wanted = ", ".join(missing)
    return (
        "Du siehst Fotos eines Verkaufsangebots fuer Arbeitsspeicher.\n"
        f"Titel des Angebots: {listing.get('title', '')}\n\n"
        f"Lies AUSSCHLIESSLICH vom Aufkleber auf den Modulen ab, was du wirklich "
        f"siehst. Gesucht: {wanted}.\n\n"
        "Antworte als JSON, ohne weiteren Text:\n"
        '{"speed": <MHz als Zahl oder null>, "latency": <CL als Zahl oder null>, '
        '"sticks": <Anzahl Module oder null>, "gb_per_stick": <GB je Modul oder null>, '
        '"evidence": "<was auf dem Aufkleber steht>"}\n\n'
        "Wenn der Aufkleber nicht lesbar ist, gib null zurueck. Rate nicht."
    )


def ask(listing, spec, missing, call_vision):
    """Returns the parsed answer, or None if nothing could be read."""
    images = fetch_images(listing.get("images", []))
    if not images:
        return None

    text = call_vision(build_question(spec, listing, missing), images)
    if not text:
        return None

    cleaned = text.strip()
    if "```" in cleaned:
        cleaned = cleaned.split("```")[1].lstrip("json").strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        logger.warning("No JSON in vision answer: %s", cleaned[:120])
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except ValueError:
        logger.warning("Unparseable vision answer: %s", cleaned[:120])
        return None
