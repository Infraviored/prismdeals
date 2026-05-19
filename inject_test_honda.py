import sqlite3
import os
import json
from bs4 import BeautifulSoup

db_path = "/home/schneider/repos_private/KleinanzeigenScraper/data/scraper.db"
html_path = "/home/schneider/repos_private/KleinanzeigenScraper/extension/test_data/full_article.html"

if not os.path.exists(html_path):
    print(f"Error: {html_path} does not exist!")
    exit(1)

with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

# 1. Parse details
details = {}
details_list = soup.select("#viewad-details .addetailslist--detail")
for detail in details_list:
    val_elem = detail.select_one(".addetailslist--detail--value")
    if val_elem:
        val_text = val_elem.get_text(strip=True)
        key_text = detail.get_text(strip=True)
        if key_text.endswith(val_text):
            key_text = key_text[: -len(val_text)].strip()
        details[key_text] = val_text

# 2. Parse images
images = []
image_elems = soup.select(".galleryimage-element img")
for img in image_elems:
    src = img.get("src") or img.get("data-imgsrc")
    if src:
        images.append(src)

# 3. Parse description
desc_elem = soup.select_one("#viewad-description-text")
detailed_description = ""
if desc_elem:
    detailed_description = desc_elem.get_text(separator="\n", strip=False)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Insert campaign
cursor.execute("INSERT INTO campaigns (name) VALUES ('Sport Bikes')")
campaign_id = cursor.lastrowid

# Insert knowledge set
expert_knowledge = "Check Honda Fireblade SC57 charging system (stator burns out), steering damper, oil usage, and valve adjustments at 24k km."
item_json = {
    "extraction_criteria": [
        {
            "id": "stator_replaced",
            "question": "Has the alternator / stator been replaced or upgraded?",
            "type": "boolean",
        },
        {
            "id": "owners_count",
            "question": "How many previous owners are there?",
            "type": "number",
        },
        {
            "id": "unfallfrei",
            "question": "Is the bike crash-free / accident-free?",
            "type": "boolean",
        },
        {
            "id": "valve_check",
            "question": "Has the valve clearance / valve play been checked or adjusted?",
            "type": "boolean",
        },
    ],
    "scoring_model": {
        "base_score": 70,
        "rules": [
            {"criterion_id": "unfallfrei", "value": False, "is_dealbreaker": True},
            {"criterion_id": "owners_count", "value": 3, "points": 5},
        ],
    },
}
cursor.execute(
    "INSERT INTO knowledge_sets (name, expert_knowledge, item_json) VALUES (?, ?, ?)",
    ("Fireblade Checklist", expert_knowledge, json.dumps(item_json)),
)
ks_id = cursor.lastrowid

# Insert search target
cursor.execute(
    "INSERT INTO searches (campaign_id, name, url, enabled, knowledge_set_id) VALUES (?, ?, ?, ?, ?)",
    (
        campaign_id,
        "CBR 1000 RR",
        "https://www.kleinanzeigen.de/s-motorraeder-roller/cbr-1000-rr/k0c305",
        1,
        ks_id,
    ),
)
search_id = cursor.lastrowid

# Insert listing
listing_id = "3413195406"
title = "Honda CBR 1000 RR Fireblade SC57"
price = "5.600 € VB"
location = "80637 Neuhausen (51 km)"
url = "https://www.kleinanzeigen.de/s-anzeige/honda-cbr-1000-rr-fireblade-sc57/3413195406-305-6422"

cursor.execute(
    """
    INSERT OR REPLACE INTO listings (
        id, title, price, location, url, short_description, detailed_description,
        search_id, details, images, full_info_obtained, llm_processed, niceness_score, status, extracted_facts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 85, 'Matched', '{}')
""",
    (
        listing_id,
        title,
        price,
        location,
        url,
        detailed_description[:150],
        detailed_description,
        search_id,
        json.dumps(details),
        json.dumps(images),
    ),
)

conn.commit()
conn.close()
print(
    "Successfully injected Sport Bikes campaign, search target, checklists, and the complete detailed Honda CBR listing into the DB!"
)
