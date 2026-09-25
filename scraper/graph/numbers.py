"""Numbers as German listings write them: "45.000 km", "2,5 kg", "32GB RAM".

`read_number(text, label)` finds a number with the label's unit near one of
the label's words -- the reader behind a `number` attribute.
"""

import re

UNITS = r"gb|tb|zoll|cm|mm|kg|mhz|kw|ps|ccm|l|km|w"
# Words in a must's label that say nothing about the thing itself.
_FILLER = {
    "mit",
    "ohne",
    "und",
    "oder",
    "über",
    "ueber",
    "unter",
    "als",
    "mehr",
    "höher",
    "hoeher",
    "mindestens",
    "höchstens",
    "hoechstens",
    "besser",
    "max",
    "min",
    "ab",
    "bis",
    "display",
    "anzeige",
    "full",
    "hd",
}


def label_words(label):
    """The words of a label worth finding in a title: "OLED-Display" -> ["oled"]."""
    words = re.findall(r"[a-zäöüß0-9]+", str(label).lower())
    return [
        w
        for w in words
        if len(w) >= 3
        and not w.isdigit()
        and w not in _FILLER
        and not re.fullmatch(UNITS, w)
    ]


def unit_of(label):
    match = re.search(rf"\b({UNITS})\b", str(label).lower())
    return match.group(1) if match else None


def german_number(raw):
    """ "45.000" is forty-five thousand, "2,5" two and a half.

    The dot was read as a decimal point: a car with "45.000 km" had 45 km and
    passed a must of at most 30000.
    """
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", raw):
        raw = raw.replace(".", "")
    return float(raw.replace(",", "."))


def read_number(text, label):
    """A number with the label's unit near one of its words, or None.

    "32 GB RAM" in "Zenbook 14 OLED 32GB RAM 1TB" reads 32; the 1TB of the SSD
    is not near "ram". Without a word to anchor on, the first number with the
    unit counts ("Breite 120 cm").
    """
    unit = unit_of(label)
    if not unit:
        return None
    hits = [
        (m.start(), german_number(m.group(1)))
        for m in re.finditer(
            rf"(\d{{1,3}}(?:\.\d{{3}})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*{unit}\b", text
        )
    ]
    if not hits:
        return None
    anchors = [
        m.start() for w in label_words(label) for m in re.finditer(re.escape(w), text)
    ]
    if not anchors:
        return hits[0][1]
    near = [v for pos, v in hits if any(abs(pos - a) <= 16 for a in anchors)]
    return near[0] if near else None
