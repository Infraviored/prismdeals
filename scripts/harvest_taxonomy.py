#!/usr/bin/env python3
"""Kleinanzeigen Taxonomy & Filter Harvester.

Crawls and extracts the complete category tree, category-specific attribute
filters, and platform-wide URL filter grammars from Kleinanzeigen.
Strictly respects rate limits (<= 1 request per 1.1s) and caches HTML locally.
"""

import datetime
import hashlib
import json
import logging
import os
import re
import time
import urllib.parse
import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("taxonomy_harvester")

BASE_URL = "https://www.kleinanzeigen.de"
MIN_REQUEST_INTERVAL = 1.10  # Enforces <= 1 request per second

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class TaxonomyHarvester:
    def __init__(self, cache_dir=None, min_interval=MIN_REQUEST_INTERVAL):
        self.min_interval = min_interval
        self.last_request_time = 0.0
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.cache_dir = cache_dir or os.path.join(root_dir, "data", "taxonomy_cache")
        os.makedirs(self.cache_dir, exist_ok=True)

    def fetch(self, url):
        """Fetch URL with UTF-8 decoding and local caching."""
        url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()
        cache_file = os.path.join(self.cache_dir, f"{url_hash}.html")

        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                return f.read()

        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)

        logger.info(f"Fetching live URL: {url}")
        self.last_request_time = time.time()
        resp = self.session.get(url, timeout=15)
        resp.encoding = "utf-8"

        if resp.status_code != 200:
            logger.warning(f"HTTP {resp.status_code} for {url}")
            return None

        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(resp.text)
        return resp.text

    def extract_categories_from_html(self, html):
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

    def parse_category_page(self, cid, cat_info, html):
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

            entries = self._build_filter_entries(sec, sec_id, title)
            filters.extend(entries)

        cat_info["filters"] = filters
        return cat_info

    def _build_filter_entries(self, sec, sec_id, title):
        """Builds all filter entries (enums, ranges, boolean flags, path facets) for a section."""
        entries = []
        options_dict = {}

        # 1. Astro island options
        for astro in sec.find_all("astro-island"):
            if astro.get("props"):
                try:
                    props = json.loads(astro["props"])
                    self._extract_astro_items(props, options_dict)
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
                lbl_text = re.sub(
                    r"\s*\([\d\.]+\)$", "", lbl.get_text(strip=True)
                ).strip()
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

    def _extract_astro_items(self, obj, out_dict):
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
                self._extract_astro_items(v, out_dict)
        elif isinstance(obj, list):
            for v in obj:
                self._extract_astro_items(v, out_dict)

    def harvest_all(self):
        """Harvests full category taxonomy and filters."""
        logger.info("Starting Kleinanzeigen taxonomy harvest...")

        home_html = self.fetch(BASE_URL + "/")
        all_cats = self.extract_categories_from_html(home_html)
        logger.info(f"Discovered {len(all_cats)} categories on homepage.")

        queue = list(all_cats.keys())
        visited = set()

        while queue:
            cid = queue.pop(0)
            if cid in visited:
                continue
            visited.add(cid)

            cat_info = all_cats[cid]
            url = BASE_URL + cat_info["url_path"]
            html = self.fetch(url)

            discovered = self.extract_categories_from_html(html)
            for d_id, d_cat in discovered.items():
                if d_id not in all_cats:
                    all_cats[d_id] = d_cat
                    queue.append(d_id)
                    logger.info(f"Discovered new category: {d_id} ({d_cat['name']})")

        logger.info(
            f"Total categories discovered: {len(all_cats)}. Now parsing filters for each..."
        )

        results = []
        for cid, cat_info in sorted(all_cats.items(), key=lambda x: int(x[0])):
            url = BASE_URL + cat_info["url_path"]
            html = self.fetch(url)
            parsed = self.parse_category_page(cid, cat_info, html)
            results.append(parsed)

        cat_by_id = {c["id"]: c for c in results}
        for c in results:
            trail = [c["name"]]
            curr_pid = c.get("parent_id")
            visited_pids = set()
            while curr_pid and curr_pid in cat_by_id and curr_pid not in visited_pids:
                visited_pids.add(curr_pid)
                parent = cat_by_id[curr_pid]
                trail.insert(0, parent["name"])
                curr_pid = parent.get("parent_id")
            c["breadcrumbs"] = trail

        taxonomy_data = {
            "version": "1.0",
            "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "stats": {
                "total_categories": len(results),
                "categories_with_filters": sum(1 for c in results if c.get("filters")),
            },
            "global_filters": {
                "price": {
                    "name": "Preis",
                    "type": "path_range",
                    "url_syntax": "/preis:{min}:{max}/",
                    "description": "Preiseingrenzung in Euro vor dem Suchbegriff",
                },
                "poster_type": {
                    "name": "Anbieter",
                    "type": "path_facet",
                    "url_syntax": "/anbieter:{value}/",
                    "options": [
                        {"value": "privat", "label": "Privat"},
                        {"value": "gewerblich", "label": "Gewerblich"},
                    ],
                },
                "ad_type": {
                    "name": "Angebotstyp",
                    "type": "path_facet",
                    "url_syntax": "/anzeige:{value}/",
                    "options": [
                        {"value": "angebote", "label": "Angebote"},
                        {"value": "gesuche", "label": "Gesuche"},
                    ],
                },
                "direct_buy": {
                    "name": "Direkt kaufen",
                    "type": "path_facet",
                    "url_syntax": "/direktkaufen:aktiv/",
                    "options": [{"value": "aktiv", "label": "Aktiv"}],
                },
                "carrier": {
                    "name": "Paketdienst",
                    "type": "path_facet",
                    "url_syntax": "/paketdienst:{value}/",
                    "options": [
                        {"value": "dhl", "label": "DHL"},
                        {"value": "hermes", "label": "Hermes"},
                    ],
                },
            },
            "url_grammar": {
                "pattern": "/s-{location_slug}/[{facet_path_segments}/]{query_slug}/k0c{category_id}[+{attribute_key}:{value}...]l{location_id}r{radius}",
                "tail_regex": r"(k\d+)(c\d+(?:\+[a-zA-Z0-9_\.]+(?::[^/]+)?)?)?(l\d+)?(r\d+)?$",
                "attribute_enum_syntax": "+{attribute_name}:{value}",
                "attribute_range_syntax": "+{attribute_name}:{min},{max}",
                "attribute_boolean_syntax": "+{attribute_name}:true",
                "attribute_multi_value_syntax": "+{attribute_name}:{val1},{val2}",
            },
            "categories": results,
        }

        output_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "kleinanzeigen_taxonomy.json",
        )
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(taxonomy_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Saved taxonomy to {output_file}")
        return taxonomy_data


if __name__ == "__main__":
    harvester = TaxonomyHarvester()
    data = harvester.harvest_all()
    print("\nTaxonomy Harvest Complete!")
    print(f"Total categories: {data['stats']['total_categories']}")
    print(f"Categories with filters: {data['stats']['categories_with_filters']}")
