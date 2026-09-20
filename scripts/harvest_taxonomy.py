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
import sys
import time
import requests

from taxonomy_parse import extract_categories_from_html, parse_category_page

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

    def harvest_all(self):
        """Harvests full category taxonomy and filters."""
        logger.info("Starting Kleinanzeigen taxonomy harvest...")

        home_html = self.fetch(BASE_URL + "/")
        all_cats = extract_categories_from_html(home_html)
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

            discovered = extract_categories_from_html(html)
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
            parsed = parse_category_page(cid, cat_info, html)
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
