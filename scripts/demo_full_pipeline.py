#!/usr/bin/env python3
"""
Kleinanzeigen Scraper - Full End-to-End Direct GET Pipeline Demo
This script runs a complete two-step scraping cycle without Selenium:
1. STEP 1 (Discovery): Crawls your custom motorcycle search URL, analyzes pagination,
   and extracts all listing URLs.
2. STEP 2 (Harvesting): Selects the first listing URL found, crawls it directly,
   and deep-parses the full description, structured specs, images, and price.
"""

import json
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# Custom motorcycle search URL provided by the user
TARGET_SEARCH_URL = "https://www.kleinanzeigen.de/s-motorraeder-roller/86946/preis::6200.0/cbr-1000-rr/k0c305l7074r200+motorraeder_roller.ez_i:2006%2C+motorraeder_roller.km_i:%2C38000"


def run_pipeline():
    # -------------------------------------------------------------
    # SETUP REQUEST CONFIGURATION
    # -------------------------------------------------------------
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

    print("=============================================================")
    print("  STARTING INTEGRATED DIRECT SCRAPING PIPELINE (NO SELENIUM)  ")
    print("=============================================================\n")

    # -------------------------------------------------------------
    # STEP 1: DISCOVER LISTING CARDS
    # -------------------------------------------------------------
    print("[STEP 1] Executing listing discovery...")
    print(f"  -> Fetching search URL:\n     {TARGET_SEARCH_URL}\n")

    try:
        response = requests.get(TARGET_SEARCH_URL, headers=headers, timeout=10)
    except Exception as e:
        print(f"Error fetching search page: {e}")
        return

    if response.status_code != 200:
        print(f"Failed to fetch search index. Status: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, "html.parser")

    # Detect pagination pages
    max_page = 1
    pages_elements = soup.select(
        ".pagination-pages .pagination-page, .pagination-pages .pagination-current"
    )
    for elem in pages_elements:
        text = elem.get_text(strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))

    print(f"  -> Pagination detected: {max_page} page(s) available.")

    # Parse all listing items on the first page
    items = soup.select("ul#srchrslt-adtable li.ad-listitem")
    print(f"  -> Found {len(items)} listing cards in the search index HTML.")

    discovered_listings = []
    for item in items:
        try:
            # Extract listing ID
            article_elem = item.select_one("article.aditem")
            if not article_elem or not article_elem.has_attr("data-adid"):
                continue
            listing_id = article_elem["data-adid"]

            # Extract basic details
            title_elem = item.select_one("h2 a")
            if not title_elem or not title_elem.has_attr("href"):
                continue

            title = title_elem.get_text(strip=True)
            listing_url = urljoin("https://www.kleinanzeigen.de", title_elem["href"])
            price = item.select_one(
                "p.aditem-main--middle--price-shipping--price"
            ).get_text(strip=True)

            discovered_listings.append(
                {"id": listing_id, "title": title, "url": listing_url, "price": price}
            )
        except Exception:
            continue

    print(f"  -> Successfully discovered {len(discovered_listings)} unique listings.")

    if not discovered_listings:
        print("  -> Aborting: No listings found to process.")
        return

    # Print the discovered index URLs
    print("\n--- Discovered Listings URL Catalog ---")
    for idx, item in enumerate(discovered_listings):
        print(f"  #{idx + 1:02d}: [{item['id']}] {item['price']:12} -> {item['url']}")

    # -------------------------------------------------------------
    # SELECT ONE LISTING FOR STEP 2
    # -------------------------------------------------------------
    selected_listing = discovered_listings[0]
    print("\n[STEP 2] Launching detailed harvest for active item #01...")
    print(f"  -> Target URL:\n     {selected_listing['url']}\n")

    # Respectful polite delay before detail page fetch
    print("  -> Pausing for 2 seconds to act like a real browser visitor...")
    time.sleep(2.0)

    # -------------------------------------------------------------
    # STEP 2: HARVEST DEEP DETAILS
    # -------------------------------------------------------------
    try:
        response = requests.get(selected_listing["url"], headers=headers, timeout=10)
    except Exception as e:
        print(f"Error fetching detailed listing: {e}")
        return

    if response.status_code != 200:
        print(f"Failed to fetch listing page. Status: {response.status_code}")
        return

    detail_soup = BeautifulSoup(response.text, "html.parser")

    # 1. Parse JSON-LD Schema.org ImageObject for high-fidelity description and title
    schema_title = None
    schema_description = None
    schema_main_image = None

    for script in detail_soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and data.get("@type") == "ImageObject":
                if data.get("representativeOfPage") is True:
                    schema_title = data.get("title")
                    schema_description = data.get("description")
                    schema_main_image = data.get("contentUrl")
        except Exception:
            continue

    # 2. Extract description from HTML as backup
    html_description = ""
    desc_elem = detail_soup.select_one("#viewad-description-text")
    if desc_elem:
        html_description = desc_elem.get_text(separator="\n", strip=True)

    # 3. Extract precise specs
    details = {}
    details_list = detail_soup.select("#viewad-details .addetailslist--detail")
    for detail in details_list:
        val_elem = detail.select_one(".addetailslist--detail--value")
        if val_elem:
            val_text = val_elem.get_text(strip=True)
            key_text = detail.get_text(strip=True)
            if key_text.endswith(val_text):
                key_text = key_text[: -len(val_text)].strip()
            key_text = key_text.rstrip(":").strip()
            details[key_text] = val_text

    # 4. Extract all image URLs
    images = []
    image_elems = detail_soup.select(".galleryimage-element img")
    for img in image_elems:
        src = img.get("src") or img.get("data-imgsrc")
        if src:
            images.append(src)

    # 5. Extract price
    price_elem = detail_soup.select_one("#viewad-price")
    price = price_elem.get_text(strip=True) if price_elem else selected_listing["price"]

    # -------------------------------------------------------------
    # PRESENT PIPELINE RESULTS
    # -------------------------------------------------------------
    print("\n=================== PIPELINE EXECUTION SUMMARY ===================")
    print(f"Listing ID          : {selected_listing['id']}")
    print(f"Title (Schema)      : {schema_title or selected_listing['title']}")
    print(f"Price (Parsed)      : {price}")
    print(f"Images Found        : {len(images)} images")
    if images:
        print(f"Primary Image URL   : {schema_main_image or images[0]}")

    print("\n--- Extracted Spec Specifications ---")
    for key, value in details.items():
        print(f"  {key:20}: {value}")

    print("\n--- Listing Detailed Description (First 500 characters) ---")
    final_desc = schema_description or html_description
    if final_desc:
        print(final_desc[:500] + "\n...")
    else:
        print("  Description not found!")
    print("==================================================================\n")


if __name__ == "__main__":
    run_pipeline()
