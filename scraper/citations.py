"""Sources in a pasted research answer, however the research AI wrote them.

Web-search AIs cite with footnotes -- "… gebrauchtberatung.[1][18]" in the text
and a list at the end ("Citations: [1] Title https://…"). Links rendered from
markdown leave debris ("Quellen: [), [)."). Read as it was, the footnote list
turned into facts of its own and the facts kept the debris and no URL.

`resolve` turns every footnote into its URL where it stands and drops the list,
so a sentence carries its own sources whatever form the answer used.
"""

import re

URL_RE = re.compile(r"https?://[^\s\"'<>\]\[)(]+")
_FOOTNOTE_LINE = re.compile(r"^\s*\[(\d{1,3})\]\s*(.*?)(https?://\S+)\s*$")
_LIST_HEADER = re.compile(r"^\s*(citations|sources|quellen|references)\s*:?\s*$", re.I)
_MARKER = re.compile(r"\[(\d{1,3})\]")
# "[)" and "[]" are what is left of a markdown link whose text was a URL.
_DEBRIS = re.compile(r"\[\s*\)|\[\s*\]|\(\s*\)")
# "Quelle:" / "Quellen:" with nothing but punctuation after it.
_EMPTY_SOURCE_LABEL = re.compile(r"\b(Quellen?|Sources?)\s*:\s*[\s,.;:]*(?=$|\n)", re.I)


def trim_url(url):
    """A URL without the sentence punctuation glued to its end."""
    return url.rstrip(".,;:!?")


def resolve(text):
    """The answer with footnotes replaced by their URLs and the list removed."""
    lines = str(text or "").splitlines()
    notes = {}
    kept = []
    for line in lines:
        found = _FOOTNOTE_LINE.match(line)
        if found:
            notes[found.group(1)] = trim_url(found.group(3))
            continue
        kept.append(line)
    # A header left alone once its list is gone ("Citations:").
    kept = [line for line in kept if not (notes and _LIST_HEADER.match(line))]
    body = "\n".join(kept)

    def to_url(match):
        url = notes.get(match.group(1))
        return f" {url} " if url else ""

    body = _MARKER.sub(to_url, body)
    body = _DEBRIS.sub("", body)
    return body


def urls_in(text):
    """Every URL in the text, once, in order."""
    out = []
    for url in URL_RE.findall(text or ""):
        url = trim_url(url)
        if url not in out:
            out.append(url)
    return out


def clean_statement(text):
    """A fact as a sentence: no URLs, no markdown stars, no empty "Quellen:"."""
    s = URL_RE.sub("", str(text or ""))
    s = _DEBRIS.sub("", s).replace("**", "").replace("__", "")
    s = _EMPTY_SOURCE_LABEL.sub("", s)
    s = re.sub(r"\s+([,.;:])", r"\1", s)
    s = re.sub(r"([,;:])(?:\s*[,;:])+", r"\1", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s.rstrip(" ,;:(").strip()
