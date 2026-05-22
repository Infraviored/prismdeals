#!/usr/bin/env python3
"""
Kleinanzeigen Scraper - Direct GET Discovery & Pagination Demo Script
This script demonstrates how to execute the first step of the scraping pipeline:
1. Dynamically parsing the pagination block on the search index page.
2. Building the full list of page URLs using the page's own pagination tags.
3. Discovering and parsing listing cards across multiple pages without Selenium.
"""

import sys
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

DEFAULT_URL = "https://www.kleinanzeigen.de/s-notebooks/preis::1400/rtx4060/k0c278"
MAX_PAGES_TO_DEMO = 3  # Limit for the demo to prevent excessive requests


def discover_listings(start_url, max_pages_limit=MAX_PAGES_TO_DEMO):
    print(f"[1] Starting discovery at URL:\n    {start_url}\n")

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }

    # Fetch first page to assess pagination
    try:
        response = requests.get(start_url, headers=headers, timeout=10)
    except Exception as e:
        print(f"Error fetching starting URL: {e}")
        return

    if response.status_code != 200:
        print(f"Failed to fetch starting page. Status: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, "html.parser")

    # Detect all available pages from pagination structure
    max_page = 1
    pages_elements = soup.select(
        ".pagination-pages .pagination-page, .pagination-pages .pagination-current"
    )

    # Store page URLs
    page_urls = {1: start_url}

    for elem in pages_elements:
        text = elem.get_text(strip=True)
        if text.isdigit():
            p_num = int(text)
            max_page = max(max_page, p_num)
            path = elem.get("href") or elem.get("data-url")
            if path:
                page_urls[p_num] = urljoin("https://www.kleinanzeigen.de", path)

    print("[2] Pagination Analysis:")
    print(f"    - Total available pages detected: {max_page}")
    print("    - Gathering page URLs...")

    # Reconstruct any missing pages in sequence using the detected format if needed,
    # but the ones detected in the pagination-pages cover everything up to max_page.
    for p in range(1, max_page + 1):
        if p not in page_urls:
            # Fallback format estimation if a page wasn't in the pagination DOM
            sample_path = page_urls.get(2) or page_urls.get(max_page)
            if sample_path:
                page_urls[p] = sample_path.replace("/seite:2/", f"/seite:{p}/").replace(
                    f"/seite:{max_page}/", f"/seite:{p}/"
                )
            else:
                page_urls[p] = f"{start_url}/seite:{p}/"

    pages_to_scrape = min(max_page, max_pages_limit)
    print(f"    - Will scrape {pages_to_scrape} page(s) for this demo.\n")

    all_discovered_listings = []

    # Scrape each page sequentially
    for current_page in range(1, pages_to_scrape + 1):
        page_url = page_urls[current_page]
        print(f"--- Scraping Page {current_page}/{pages_to_scrape}: {page_url} ---")

        if current_page > 1:
            # Respectful delay between page fetches
            time.sleep(2.0)
            try:
                response = requests.get(page_url, headers=headers, timeout=10)
                if response.status_code != 200:
                    print(
                        f"    Failed to fetch Page {current_page}. Status: {response.status_code}"
                    )
                    continue
                soup = BeautifulSoup(response.text, "html.parser")
            except Exception as e:
                print(f"    Error fetching Page {current_page}: {e}")
                continue

        # Extract listings on current page
        items = soup.select("ul#srchrslt-adtable li.ad-listitem")
        print(f"    Discovered {len(items)} listing cards on this page.")

        page_listings_count = 0
        for item in items:
            try:
                # Extract listing ID
                listing_id = ""
                article_elem = item.select_one("article.aditem")
                if article_elem and article_elem.has_attr("data-adid"):
                    listing_id = article_elem["data-adid"]

                if not listing_id:
                    continue

                # Extract basic card details
                title_elem = item.select_one("h2 a")
                title = title_elem.get_text(strip=True) if title_elem else "No Title"

                listing_url = ""
                if title_elem and title_elem.has_attr("href"):
                    listing_url = urljoin(
                        "https://www.kleinanzeigen.de", title_elem["href"]
                    )

                price_elem = item.select_one(
                    "p.aditem-main--middle--price-shipping--price"
                )
                price = price_elem.get_text(strip=True) if price_elem else "N/A"

                desc_elem = item.select_one("p.aditem-main--middle--description")
                short_description = desc_elem.get_text(strip=True) if desc_elem else ""

                location_elem = item.select_one(".aditem-main--top--left")
                location = ""
                if location_elem:
                    location = " ".join(
                        location_elem.get_text(separator=" ", strip=True).split()
                    )

                listing_data = {
                    "id": listing_id,
                    "title": title,
                    "price": price,
                    "location": location,
                    "url": listing_url,
                    "short_description": short_description,
                    "page_source": current_page,
                }

                all_discovered_listings.append(listing_data)
                page_listings_count += 1
            except Exception as e:
                print(f"    Error parsing listing item: {e}")
                continue

        print(
            f"    Successfully parsed {page_listings_count} listings from page {current_page}.\n"
        )

    # Output Summary
    print("=================== DISCOVERY COMPLETED ===================")
    print(f"Total Pages Scraped:        {pages_to_scrape}")
    print(f"Total Listings Discovered:  {len(all_discovered_listings)}")
    print("===========================================================\n")

    # Show first 5 items as a preview
    print("--- Discovery Preview (First 5 Items) ---")
    for idx, item in enumerate(all_discovered_listings[:5]):
        print(f"{idx + 1}. [{item['id']}] {item['title']}")
        print(f"   Price   : {item['price']}")
        print(f"   Location: {item['location']}")
        print(f"   URL     : {item['url']}")
        print(f"   Snippet : {item['short_description'][:100]}...")
        print("-" * 50)


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    discover_listings(url)
