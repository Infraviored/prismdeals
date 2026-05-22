#!/usr/bin/env python3
"""
Kleinanzeigen Scraper - Direct GET & Parse Demo Script
This script demonstrates how to fetch a listing directly using Python's `requests`
library (without Selenium or a full browser) and extract its details.

It teaches you:
1. How to configure HTTP headers to satisfy the initial Akamai bot protection.
2. How to extract structured metadata from Schema.org (JSON-LD) blocks embedded in the page.
3. How to extract key-value details, description, and images using BeautifulSoup.
"""

import sys
import json
import requests
from bs4 import BeautifulSoup

DEFAULT_URL = "https://www.kleinanzeigen.de/s-anzeige/honda-cbr-1000-rr-fireblade-sc57/3413195406-305-6422"


def fetch_and_parse_listing(url):
    print(f"[1] Initiating direct GET request to:\n    {url}\n")

    # 1. Setup realistic browser headers.
    # Without these, Akamai bot protection will block the request and return 403 Forbidden.
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
    except Exception as e:
        print(f"Error fetching URL: {e}")
        return

    print(f"[2] HTTP Response Status Code: {response.status_code}")
    if response.status_code != 200:
        print(
            "Failed to retrieve the page. You might have been rate-limited or blocked by Akamai."
        )
        if response.status_code == 403:
            print(
                "Akamai returned 403 Forbidden. This happens if headers are incomplete or IP is flagged."
            )
        return

    # Parse HTML using BeautifulSoup
    soup = BeautifulSoup(response.text, "html.parser")

    # 2. Extract title of the web page
    page_title = soup.title.string.strip() if soup.title else "No Title Found"
    print(f"    Page HTML Title: {page_title}\n")

    # 3. Parse JSON-LD structured data blocks
    # Kleinanzeigen embeds rich metadata inside `<script type="application/ld+json">` tags.
    # The main listing information (like title, description, and primary image) is contained
    # within an ImageObject schema block marked as representative of the page.
    print("[3] Searching Schema.org (JSON-LD) blocks...")
    schema_title = None
    schema_description = None
    schema_main_image = None

    for idx, script in enumerate(soup.find_all("script", type="application/ld+json")):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict) and data.get("@type") == "ImageObject":
                # representativeOfPage indicates the main listing content
                if data.get("representativeOfPage") is True:
                    schema_title = data.get("title")
                    schema_description = data.get("description")
                    schema_main_image = data.get("contentUrl")
                    print(
                        f"    -> Found representative ImageObject in JSON-LD Block #{idx}"
                    )
        except Exception:
            continue

    # 4. Extract description from HTML (as a fallback or comparison)
    print("\n[4] Extracting description and details from HTML...")
    html_description = ""
    desc_elem = soup.select_one("#viewad-description-text")
    if desc_elem:
        html_description = desc_elem.get_text(separator="\n", strip=True)

    # 5. Extract structured key-value details (e.g. Marke, Kilometerstand, Erstzulassung)
    # These are stored in `#viewad-details` as list items.
    details = {}
    details_list = soup.select("#viewad-details .addetailslist--detail")
    for detail in details_list:
        val_elem = detail.select_one(".addetailslist--detail--value")
        if val_elem:
            val_text = val_elem.get_text(strip=True)
            key_text = detail.get_text(strip=True)
            # Remove the value text from the end of the key text to get only the label
            if key_text.endswith(val_text):
                key_text = key_text[: -len(val_text)].strip()
            # Clean up trailing colons or whitespace
            key_text = key_text.rstrip(":").strip()
            details[key_text] = val_text

    # 6. Extract all images from the gallery
    images = []
    image_elems = soup.select(".galleryimage-element img")
    for img in image_elems:
        src = img.get("src") or img.get("data-imgsrc")
        if src:
            # Clean up URLs (normalize auto-sizing parameters if any)
            images.append(src)

    # 7. Extract Price
    price_elem = soup.select_one("#viewad-price")
    if not price_elem:
        # Fallback price selectors
        price_elem = soup.select_one(
            'h2.ad-item-main--middle--price-shipping--price, [itemprop="price"]'
        )
    price = price_elem.get_text(strip=True) if price_elem else "Not Found"

    # 8. Print Results
    print("\n=================== EXTRACTION RESULTS ===================")
    print(f"Title (Schema):       {schema_title or 'Not Found in Schema'}")
    print(f"Price:                {price}")
    print(f"Images Found:         {len(images)} images")
    if images:
        print(f"Primary Image:        {schema_main_image or images[0]}")

    print("\n--- Key-Value Details ---")
    for k, v in details.items():
        print(f"  {k:20}: {v}")

    print("\n--- Detailed Description (First 350 characters) ---")
    desc_to_show = schema_description or html_description
    if desc_to_show:
        print(desc_to_show[:350] + "...")
    else:
        print("  Description not found!")
    print("==========================================================\n")


if __name__ == "__main__":
    target_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    fetch_and_parse_listing(target_url)
