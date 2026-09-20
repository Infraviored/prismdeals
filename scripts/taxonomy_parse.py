#!/usr/bin/env python3
"""Reading a Kleinanzeigen category page: the tree, and the filters it offers.

Split out of scripts/harvest_taxonomy.py, which had grown past the 400-line
limit this repository holds itself to. The harvester fetches and orchestrates;
this module knows what a category page looks like. Keeping them apart means the
parsing can be exercised against a saved page without touching the network.
"""

import json
import logging
import re

from bs4 import BeautifulSoup

logger = logging.getLogger("taxonomy_harvester")


def extract_categories_from_html(html):
    """Finds all /s-.../c<id> category links in page HTML."""
    if not html:
        return {}
    soup = BeautifulSoup(html, "html.parser")
    cats = {}

    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"^/s-([^/]+(?:/[^/]+)*)/c(\d+)$", href)
        if m:
            slug, cid = m.group(1), m.group(2)
            name = a.get_text(strip=True)
            clean_name = re.sub(r"\s*\([\d\.]+\)$", "", name).strip()
            if clean_name and clean_name != "Alle Kategorien":
                cats[cid] = {
                    "id": cid,
                    "name": clean_name,
                    "slug": slug,
                    "url_path": href,
                }
    return cats


def parse_category_page(cid, cat_info, html):
    """Parses breadcrumbs, parent relations, and filters for a category page."""
    if not html:
        return cat_info

    soup = BeautifulSoup(html, "html.parser")

    # 1. Parent detection via category navigation box
    cat_sec = soup.find("details", attrs={"data-filter-section": "cat"})
    parent_id = None
    parent_name = None
    is_top_level = False

    if cat_sec:
        links = []
        for a in cat_sec.find_all("a", href=True):
            t = re.sub(r"\s*\([\d\.]+\)$", "", a.get_text(strip=True)).strip()
            if t and t != "Alle Kategorien":
                m = re.search(r"/c(\d+)$", a["href"])
                if m:
                    links.append((t, m.group(1)))

        if len(links) > 2 and any(l[1] != cid for l in links):
            is_top_level = True
            parent_id = None
            parent_name = None
        elif len(links) >= 1:
            parent_name, parent_id = links[0]

    cat_info["parent_id"] = parent_id
    cat_info["parent_name"] = parent_name
    cat_info["is_top_level"] = is_top_level

    # 2. Filter sections parsing
    sections = soup.find_all("details", class_="collapsible-filter-section")
    filters = []

    for sec in sections:
        sec_id = sec.get("data-filter-section", "")
        if sec_id in ("cat", "loc"):
            continue

        summary = sec.find("summary")
        h3 = summary.find("h3") if summary else None
        title = (
            h3.get_text(strip=True)
            if h3
            else (summary.get_text(strip=True) if summary else sec_id)
        )

        entries = build_filter_entries(sec, sec_id, title)
        filters.extend(entries)

    cat_info["filters"] = filters
    return cat_info


def build_filter_entries(sec, sec_id, title):
    """Builds all filter entries (enums, ranges, boolean flags, path facets) for a section."""
    entries = []
    options_dict = {}

    # 1. Astro island options
    for astro in sec.find_all("astro-island"):
        if astro.get("props"):
            try:
                props = json.loads(astro["props"])
                extract_astro_items(props, options_dict)
            except Exception:
                pass

    # 2. Anchor tag options
    for a in sec.find_all("a", href=True):
        href = a["href"]
        if href in ("#", "/s-suchen.html") or href.startswith("https://"):
            continue
        label = re.sub(r"\s*\([\d\.]+\)$", "", a.get_text(strip=True)).strip()
        if label and href not in options_dict:
            options_dict[href] = {"label": label, "url": href}

    # 3. Checkboxes (clickable boolean options)
    labels_with_inputs = sec.find_all("label")
    checkboxes_found = False
    for lbl in labels_with_inputs:
        chk = lbl.find("input", type="checkbox")
        if not chk:
            chk = lbl.find("input", attrs={"name": "clickableOptions"})
        if chk:
            checkboxes_found = True
            chk_id = chk.get("id", "")
            lbl_text = re.sub(r"\s*\([\d\.]+\)$", "", lbl.get_text(strip=True)).strip()
            m_chk = re.search(r"checkbox-([a-zA-Z0-9_\.]+)", chk_id)
            key = m_chk.group(1) if m_chk else chk_id
            entries.append(
                {
                    "key": key,
                    "label": lbl_text or title,
                    "group": title,
                    "type": "attribute_boolean",
                    "location": "tail",
                    "url_syntax": f"+{key}:true",
                }
            )

    if checkboxes_found:
        return entries

    # 4. Range / numeric inputs
    inputs = [
        i
        for i in sec.find_all("input")
        if i.get("type") not in ("hidden", "submit", "checkbox")
    ]
    if inputs:
        inp_ids = [i.get("id", "") for i in inputs]
        range_keys = set()
        for iid in inp_ids:
            m_rng = re.search(r"brwse-attr-([a-zA-Z0-9_\.]+)-(min|max)", iid)
            if m_rng:
                range_keys.add(m_rng.group(1))
        for rk in sorted(range_keys):
            entries.append(
                {
                    "key": rk,
                    "label": title,
                    "type": "attribute_range",
                    "location": "tail",
                    "url_syntax": f"+{rk}:{{min}},{{max}}",
                }
            )
        if sec_id == "price":
            entries.append(
                {
                    "key": "preis",
                    "label": "Preis",
                    "type": "path_range",
                    "location": "path",
                    "url_syntax": "/preis:{min}:{max}/",
                }
            )
        if entries:
            return entries

    # 5. Options (Attribute enum or path facet)
    options = list(options_dict.values())
    if options:
        sample_url = options[0]["url"]
        attr_match = re.search(r"\+([a-zA-Z0-9_\.]+):", sample_url)
        facet_match = re.search(r"/([a-zA-Z0-9_]+):([^/]+)/", sample_url)

        if attr_match:
            attr_key = attr_match.group(1)
            opts = []
            for o in options:
                m_val = re.search(rf"\+{re.escape(attr_key)}:([^/]+)", o["url"])
                val = m_val.group(1) if m_val else o.get("key")
                if val:
                    val = urllib.parse.unquote(val)
                opts.append({"value": val, "label": o["label"]})
            entries.append(
                {
                    "key": attr_key,
                    "label": title,
                    "type": "attribute_enum",
                    "location": "tail",
                    "url_syntax": f"+{attr_key}:{{value}}",
                    "options": opts,
                }
            )
        elif facet_match:
            facet_name = facet_match.group(1)
            opts = []
            for o in options:
                m_val = re.search(rf"/{re.escape(facet_name)}:([^/]+)/", o["url"])
                val = m_val.group(1) if m_val else o["label"].lower()
                opts.append({"value": val, "label": o["label"]})
            entries.append(
                {
                    "key": facet_name,
                    "label": title,
                    "type": "path_facet",
                    "location": "path",
                    "url_syntax": f"/{facet_name}:{{value}}/",
                    "options": opts,
                }
            )
        else:
            entries.append(
                {
                    "key": sec_id,
                    "label": title,
                    "type": "link",
                    "location": "path",
                    "options": [
                        {"value": o["url"], "label": o["label"]} for o in options
                    ],
                }
            )

    return entries


def extract_astro_items(obj, out_dict):
    """Recursively extracts localizedName and url from Astro props."""
    if isinstance(obj, dict):
        if "localizedName" in obj and "url" in obj:
            name = (
                obj["localizedName"][1]
                if isinstance(obj["localizedName"], list)
                else obj["localizedName"]
            )
            url = obj["url"][1] if isinstance(obj["url"], list) else obj["url"]
            key = obj.get("key")
            if isinstance(key, list):
                key = key[1]
            if url and url not in out_dict:
                out_dict[url] = {"label": name, "url": url, "key": key}
        for v in obj.values():
            extract_astro_items(v, out_dict)
    elif isinstance(obj, list):
        for v in obj:
            extract_astro_items(v, out_dict)
