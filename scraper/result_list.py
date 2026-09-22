"""Reading a search result page.

There is no open search API. The mobile endpoint at api.kleinanzeigen.de answers
401, the page carries no embedded state (`astroSharedData` holds an empty session
object), and the only public JSON services are helpers such as location
suggestions. So the result list is read from HTML — not by preference, but
because nothing else is on offer.

That makes *where* the reading is anchored the whole question. The site has moved
to utility CSS, and class names like `aditem-main--top--left` — which the older
parser in `scraper.py` still looks for — no longer exist anywhere on a current
page. Anchoring on appearance means re-breaking on every redesign.

This module anchors on meaning instead: `data-adid` and `data-href`, which carry
identity, and the per-card JSON-LD block, which carries the title and description
as data. Both survive restyling.

The other thing HTML forces us to get right is the boundary of the list. A search
with three hits renders thirteen cards: the three results, then a "more listings"
carousel of nationwide suggestions. Measured on a Landsberg search for a Brimnes
wardrobe, those extras came from Mainz, Leipzig, Cologne and Potsdam and appeared
in all five circles of a route corridor — they are not radius results at all.
`<ul id="srchrslt-adtable">` closes right after the genuine hits, so the boundary
is exact, and everything past it is dropped.
"""

import html as html_module
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

import geo

logger = logging.getLogger(__name__)

LIST_OPEN_RE = re.compile(r'<ul[^>]*id="srchrslt-adtable"[^>]*>')
# The two attributes anchor a card, in whichever order and however far apart the
# markup puts them: requiring `data-adid` to be immediately followed by
# `data-href` would turn a reordered attribute into zero listings found, silently
# — which is exactly the failure mode this module was written to end.
CARD_OPEN_RE = re.compile(r"<article\b[^>]*>", re.I)
ADID_RE = re.compile(r'data-adid="(\d+)"')
HREF_RE = re.compile(r'data-href="([^"]+)"')
LD_JSON_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
TOTAL_RE = re.compile(r"([\d.]+)\s+Ergebnisse?")

# "<title> <Bundesland> - <Ort> Vorschau" — the state name anchors the split, so
# a title that itself contains a hyphen cannot be mistaken for the location. The
# names come from geo so this pattern and the gazetteer cannot drift apart;
# longest-first, or "Sachsen" would match the start of "Sachsen-Anhalt".
ALT_LOCATION_RE = re.compile(
    r'alt="[^"]*?\b('
    + "|".join(sorted(map(re.escape, geo.FEDERAL_STATES), key=len, reverse=True))
    + r')\s*-\s*([^"]+?)\s+Vorschau"'
)
PRICE_RE = re.compile(r">\s*([\d.]+)\s*€(\s*VB)?\s*<")
GIVEAWAY_RE = re.compile(r">\s*Zu verschenken\s*<", re.I)

# The card's own thumbnail. It was never read at all: every listing harvested
# by this parser had an empty images field, and the rows showed a grey
# placeholder where a photograph belongs.
CARD_IMAGE_RE = re.compile(
    r'<img[^>]+src="(https://img\.kleinanzeigen\.de/[^"]+)"', re.I
)

# Kleinanzeigen encodes the size in the URL. The card asks for $_2, which is a
# list thumbnail and blurs at the 72 px the row draws it at, let alone in the
# find sheet. $_59 is what the listing's own page uses for its main image.
CARD_THUMB_RULE = re.compile(r"\?rule=\$_\d+\.(\w+)$")

# Kleinanzeigen writes the Munich district names with a soft break inside them:
# "Schwabing-<U+200B>West", "Berg-<U+200B>am-<U+200B>Laim". The character is a
# zero-width space, so the name looks right on screen and compares wrong
# everywhere else -- two rows that read identically do not group, a map cluster
# splits in two, and a filter on the town misses half its rows. 489 of the 1266
# stored listings carry one. Where the entity lost its terminating semicolon the
# page ships the literal text "&#8203" instead, which BeautifulSoup leaves
# standing; 56 rows show it.
_INVISIBLE = {ord(c): None for c in "\u200b\u200c\u200d\ufeff"}


def clean_text(value):
    """Decodes entities and drops the invisible characters the page injects."""
    if not value:
        return value
    return html_module.unescape(value).translate(_INVISIBLE).strip()


EMPTY_RE = re.compile(
    r"Es wurden keine Ergebnisse|leider keine Ergebnisse", re.IGNORECASE
)


def is_empty_result_page(page_html):
    """Whether the page states outright that the search found nothing.

    A search with no hits renders no result list at all, which is otherwise
    indistinguishable from a page that failed to load or was blocked. Both then
    yield zero listings, and reporting them the same way hides a real fault
    behind an ordinary one — so the page's own wording decides which it is.
    """
    return bool(EMPTY_RE.search(page_html))


def result_list_html(page_html):
    """The genuine result list, with the suggestion carousel cut off.

    Returns an empty string when the list element is absent — a blocked page or a
    changed layout should read as "no results found here", never as the whole
    page's worth of unrelated cards.
    """
    opening = LIST_OPEN_RE.search(page_html)
    if not opening:
        if not is_empty_result_page(page_html):
            logger.warning(
                "No result list on this page, and it does not say the search was "
                "empty. The layout may have changed, or the request was blocked."
            )
        return ""

    # Counted with a parser rather than by matching `<ul>` against `</ul>` in the
    # raw text. Depth counting reads tags inside scripts, comments and attribute
    # values as real markup — and this page ships a script that mentions
    # `#srchrslt-adtable` — so one `</ul>` in a JS string would cut the list
    # short and drop every result after it, or one unclosed `<ul>` would run past
    # the end and let the whole nationwide carousel through. Both fail silently,
    # which is the failure this module exists to stop.
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(page_html, "html.parser")
    element = soup.find("ul", id="srchrslt-adtable")
    if element is None:
        # The id is in the page but not on a `<ul>` bs4 will parse — malformed
        # enough that guessing a boundary would be worse than reporting none.
        logger.warning(
            "Found the result list id in the page but could not parse the list "
            "element. Treating the page as empty rather than guessing."
        )
        return ""
    return element.decode_contents()


def total_results(page_html):
    """The count the site reports, or None."""
    match = TOTAL_RE.search(page_html)
    if not match:
        return None
    return int(match.group(1).replace(".", ""))


def _card_segments(list_html):
    """Splits the list into one chunk per card that carries an id and a link."""
    opens = [m for m in CARD_OPEN_RE.finditer(list_html)]

    cards = []
    for index, opening in enumerate(opens):
        adid = ADID_RE.search(opening.group(0))
        href = HREF_RE.search(opening.group(0))
        if not adid or not href:
            continue
        end = opens[index + 1].start() if index + 1 < len(opens) else len(list_html)
        cards.append((adid.group(1), href.group(1), list_html[opening.start() : end]))

    return cards


def _title_and_description(segment):
    """From the card's JSON-LD, which holds them as data rather than markup."""
    for raw in LD_JSON_RE.findall(segment):
        try:
            block = json.loads(raw)
        except ValueError:
            continue
        if block.get("title"):
            return clean_text(block.get("title")), clean_text(block.get("description"))
    return None, None


def parse(page_html):
    """Listings from one result page, excluding the suggestion carousel."""
    listings = []
    for adid, href, segment in _card_segments(result_list_html(page_html)):
        title, description = _title_and_description(segment)

        location, state = None, None
        match = ALT_LOCATION_RE.search(segment)
        if match:
            state, location = (
                clean_text(match.group(1)),
                clean_text(match.group(2)),
            )

        image = None
        image_match = CARD_IMAGE_RE.search(segment)
        if image_match:
            image = CARD_THUMB_RULE.sub(r"?rule=$_59.\1", image_match.group(1))

        price = None
        price_match = PRICE_RE.search(segment)
        if price_match:
            price = int(price_match.group(1).replace(".", ""))
        elif GIVEAWAY_RE.search(segment):
            price = 0

        listings.append(
            {
                "id": adid,
                "url": "https://www.kleinanzeigen.de" + href,
                "title": title,
                "description": description,
                "price_eur": price,
                "image": image,
                "location": location,
                "state": state,
                "source": "kleinanzeigen",
                "source_id": adid,
            }
        )
    return listings


@dataclass
class CanonicalListing:
    """The canonical listing representation in Python.

    Deliberately thin: provides a single named structure for listing data
    consumed by the scraper pipeline, routing, and database layers so nothing
    unpacks source-specific assumptions.
    """

    id: str
    title: str
    url: str
    price_eur: Optional[int]
    price: str
    location: str
    short_description: str
    source: str = "kleinanzeigen"
    source_id: Optional[str] = None
    place: Optional[str] = None
    state: Optional[str] = None
    detailed_description: str = ""
    # The card's own photograph. One is enough for a row and for a first look;
    # the rest arrive with the detail page, when there is a reason to fetch it.
    images: Optional[list] = None
    llm_processed: bool = False
    last_seen_at: Optional[str] = None
    delisted_at: Optional[str] = None
    raw_fields: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "source_id": self.source_id or self.id,
            "title": self.title,
            "price": self.price,
            "price_eur": self.price_eur,
            "location": self.location,
            "place": self.place,
            "state": self.state,
            "url": self.url,
            "short_description": self.short_description,
            "detailed_description": self.detailed_description,
            "images": self.images or [],
            "llm_processed": self.llm_processed,
            "last_seen_at": self.last_seen_at,
            "delisted_at": self.delisted_at,
        }


def as_canonical(parsed) -> CanonicalListing:
    """Converts a parsed listing or mapping into the canonical representation."""
    if isinstance(parsed, CanonicalListing):
        return parsed

    price_eur = parsed.get("price_eur")
    location = parsed.get("location") or ""
    state = parsed.get("state")
    # Only prepend state when not already embedded (prevents "Bayern - Bayern - ..."
    # when a previously stored location string is passed through a second time).
    prefix = f"{state} - "
    if state and location and not location.startswith(prefix):
        loc_str = prefix + location
    else:
        loc_str = location

    raw_price = parsed.get("price")
    if raw_price is not None:
        price_str = raw_price
    elif price_eur == 0:
        price_str = "Zu verschenken"
    elif price_eur is not None:
        price_str = f"{price_eur} €"
    else:
        price_str = ""

    adid = str(parsed["id"])
    source = parsed.get("source") or "kleinanzeigen"
    source_id = str(parsed.get("source_id") or adid)

    return CanonicalListing(
        id=adid,
        source=source,
        source_id=source_id,
        title=parsed.get("title") or "",
        price=price_str,
        price_eur=price_eur,
        location=loc_str,
        place=parsed.get("place") or parsed.get("location"),
        images=[parsed["image"]] if parsed.get("image") else [],
        state=state,
        url=parsed.get("url") or "",
        short_description=parsed.get("description")
        or parsed.get("short_description")
        or "",
        detailed_description=parsed.get("detailed_description") or "",
        llm_processed=bool(parsed.get("llm_processed", False)),
        last_seen_at=parsed.get("last_seen_at"),
        delisted_at=parsed.get("delisted_at"),
        raw_fields=parsed.get("raw_fields"),
    )


def as_db_listing(parsed):
    """Shapes a parsed card the way the listings table and the legacy code expect.

    The old parser stored `price` and `location` as the strings it scraped off the
    page ("60 €", "Bayern - Landsberg (Lech)"), and the frontend and scoring both
    read them that way. Those strings are rebuilt here rather than changing the
    schema, so repairing the parser stays a repair: the structured fields travel
    alongside under their own keys, for the code that wants numbers.
    """
    return as_canonical(parsed).to_dict()
