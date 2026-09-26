#!/usr/bin/env python3
"""The graph half of the CI fixture: a ThinkPad hunt, its listings read.

    python scripts/seed_fixture_graph.py <db>

No model is asked: the products are created by hand and the hunt's targets are
given as node ids. Everything is synthetic -- never production data.
"""

import json
import os
import sys

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scraper"
    ),
)

import db_schema  # noqa: E402
from graph import facts, hunts, knowledge, store, taxonomy  # noqa: E402

# Fixed, not now(): these dates are rendered onto every card, and a moving
# clock made each run differ from the committed baseline.
NOW = "2026-01-01T12:00:00+00:00"
# Priced the way the site prices things: a number in price_eur and the
# seller's words in price, so the baseline catches a lost "VB" or a giveaway.
LISTINGS = [
    (
        "1000000001",
        "ThinkPad T14s Gen 3, 16GB, 512GB SSD",
        "650 €",
        650,
        "86899 Landsberg am Lech",
        "16 GB",
    ),
    (
        "1000000002",
        "Lenovo ThinkPad T14s AMD Ryzen 7 PRO, top Zustand",
        "520 € VB",
        520,
        "80331 München",
        None,
    ),
    (
        "1000000003",
        "X1 Carbon Gen 11, i7, 32GB, WQUXGA",
        "980 €",
        980,
        "10115 Berlin",
        "32 GB",
    ),
    (
        "1000000004",
        "ThinkPad X1 Carbon Gen 9, 8GB, FHD+",
        "Zu verschenken",
        0,
        "50667 Köln",
        "8 GB",
    ),
    ("1000000005", "Suche ThinkPad T14s", "1 €", 1, "86899 Landsberg am Lech", None),
]


def main(path):
    conn = db_schema.connect(path)
    taxonomy.seed(conn)
    laptops = taxonomy.category_node_id(conn, "278")
    lenovo = store.create_node(conn, laptops, "brand", "Lenovo", "fixture")
    store.add_alias(conn, lenovo, "Lenovo", "name", "fixture")
    thinkpad = store.create_node(conn, lenovo, "family", "ThinkPad", "fixture")
    store.add_alias(conn, thinkpad, "ThinkPad", "name", "fixture")
    models = {}
    for name, alias in (("T14s", "t14s"), ("X1 Carbon", "x1carbon")):
        models[name] = store.create_node(conn, thinkpad, "model", name, "fixture")
        store.add_alias(conn, models[name], alias, "name", "fixture")
    store.set_attribute(
        conn,
        thinkpad,
        "ram_gb",
        "Arbeitsspeicher",
        "number",
        ["details:Arbeitsspeicher", "regex:(\\d{1,2})\\s?GB"],
        "fixture",
        unit="GB",
    )
    # Yes/no attributes: one the hunt wishes for (the weight control in the
    # requirements sheet), one only proposed (the "+ Wunsch" in the features sheet).
    for attr_id, label in (("ovp", "OVP"), ("rechnung", "Rechnung")):
        store.set_attribute(
            conn,
            thinkpad,
            attr_id,
            label,
            "boolean",
            [f"keywords:{attr_id}"],
            "fixture",
        )
    campaign_id = hunts.save(
        conn,
        {
            "name": "Laptop Hunt",
            "text": "ThinkPad T14s oder X1 Carbon, mindestens 16 GB",
            "category_code": "278",
            "frame": {
                "max_price": 1000,
                "location_id": 7091,
                "place": "Landsberg",
                "radius_km": 100,
            },
            "targets": [
                {"typed": "ThinkPad T14s", "node_id": models["T14s"]},
                {"typed": "ThinkPad X1 Carbon", "node_id": models["X1 Carbon"]},
            ],
            "conditions": [
                {
                    "label": "Arbeitsspeicher",
                    "op": "min",
                    "value": 16,
                    "importance": "must",
                },
                {
                    "label": "OVP",
                    "op": "present",
                    "importance": "wish",
                    "weight": 2,
                },
            ],
        },
    )
    search_ids = [
        r[0]
        for r in conn.execute(
            "SELECT id FROM searches WHERE campaign_id = ?", (campaign_id,)
        )
    ]
    for n, (lid, title, price, price_eur, location, ram) in enumerate(LISTINGS):
        search_id = search_ids[0] if "T14s" in title else search_ids[-1]
        conn.execute(
            """INSERT INTO listings (id, title, price, price_eur, location, search_id, url,
                                     short_description, details, images, last_description_changed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'Synthetic fixture listing for CI screenshots.', ?, '[]', ?)""",
            (
                lid,
                title,
                price,
                price_eur,
                location,
                search_id,
                f"https://www.kleinanzeigen.de/s-anzeige/x/{lid}-278-7091",
                json.dumps({"Arbeitsspeicher": ram} if ram else {}),
                NOW,
            ),
        )
        conn.execute(
            "INSERT INTO listing_search_hits (listing_id, search_id, first_seen_at) VALUES (?, ?, ?)",
            (lid, search_id, NOW),
        )
        facts.process(conn, lid, prior=list(models.values()))
    # What the offers differ in, as graph/signals.py stores it after a crawl.
    for attr_id, polarity, weight, found in (
        ("ram_gb", "value", 0, 4),
        ("ovp", "plus", 2, 1),
        ("rechnung", "plus", 1, 1),
    ):
        conn.execute(
            """INSERT INTO node_signals
                   (node_id, attr_id, polarity, default_weight, found, total, proposed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (thinkpad, attr_id, polarity, weight, found, len(LISTINGS), NOW),
        )
    conn.execute(
        "UPDATE searches SET last_scraped_at = ? WHERE campaign_id = ?",
        (NOW, campaign_id),
    )
    # Proposed facts for the knowledge sheet: a kind badge and two buttons in one row.
    for kind, statement in (
        (
            "seller_question",
            "Wurde der Akku getauscht, und wie viele Ladezyklen zeigt das BIOS?",
        ),
        (
            "weakness",
            "Scharniere der T14s lockern sich bei häufigem Öffnen; Spiel am Deckel prüfen.",
        ),
    ):
        knowledge.insert(
            conn,
            models["T14s"],
            {
                "kind": kind,
                "statement": statement,
                "check_path": "ask",
                "weight": "minor",
                "sources": ["https://example.org/quelle"],
            },
        )
    conn.commit()
    print(f"Graph fixture: hunt {campaign_id}, {len(LISTINGS)} listings")


if __name__ == "__main__":
    main(sys.argv[1])
