"""Records live LLM responses for 20 intent utterances to a fixture file.

Used once to produce scraper/testdata/intent_fixtures.json so offline test suites
replay recorded model outputs without making live API calls.
"""

import json
import os
import sys
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_ROOT, "scraper"))

from agent_worker import client, build_llm_kwargs, get_response_text
from intent_prompt import build_intent_prompt
from intent_taxonomy import find_category

UTTERANCES = [
    {
        "id": "ram_corsair",
        "text": "Corsair 2x16 GB DDR4-3200 CL16, max 150 €",
        "category": "225",
    },
    {
        "id": "motorcycle_models",
        "text": "Yamaha R1 oder Honda CBR1000RR bis 9000 €",
        "category": "305",
    },
    {
        "id": "motorcycle_class",
        "text": "1000cc Supersportler bis 7000 Euro, max 40000 km",
        "category": "305",
    },
    {
        "id": "laptop_oled",
        "text": "Laptop 32 GB RAM, OLED, besser als Full HD bis 800 €",
        "category": "278",
    },
    {"id": "mattress_fit", "text": "Matratze 140x200 cm bis 150 €", "category": "81"},
    {
        "id": "wardrobe_fit",
        "text": "Kleiderschrank maximal 120 cm breit weiß bis 100€",
        "category": "81",
    },
    {
        "id": "armchair_taste",
        "text": "Vintage Sessel Mid-Century Leder braun bis 200 €",
        "category": "88",
    },
    {
        "id": "tools_opportunity",
        "text": "Werkzeug Konvolut Makita oder Bosch unter Marktpreis bis 100 €",
        "category": "84",
    },
    {
        "id": "kids_bike_fit",
        "text": "Kinderfahrrad 20 Zoll Woom oder Frog bis 300 €",
        "category": "217",
    },
    {
        "id": "child_seat_fit",
        "text": "Kindersitz Isofix Gruppe 2/3 unfallfrei bis 80 €",
        "category": "21",
    },
    {
        "id": "tv_features",
        "text": "55 Zoll OLED Fernseher 4K 120Hz unter 600€",
        "category": "175",
    },
    {
        "id": "car_class",
        "text": "Kombi mit Anhängerkupplung Diesel bis 6000 Euro",
        "category": "216",
    },
    {
        "id": "phone_models",
        "text": "iPhone 13 oder iPhone 14 Pro 128GB bis 550 €",
        "category": "173",
    },
    {
        "id": "lego_exact",
        "text": "Lego 75192 Millennium Falcon vollständig OVP bis 650 €",
        "category": "23",
    },
    {
        "id": "ebike_class",
        "text": "Trekking E-Bike mit Bosch Mittelmotor bis 1200 €",
        "category": "217",
    },
    {
        "id": "coffee_class",
        "text": "Kaffeevollautomat DeLonghi oder Jura mit Milchschaum bis 250 €",
        "category": "176",
    },
    {
        "id": "desk_fit",
        "text": "Schreibtisch höhenverstellbar elektrisch 160x80 bis 200 €",
        "category": "93",
    },
    {
        "id": "guitar_taste",
        "text": "Vintage Westerngitarre Akustik Dreadnought bis 300 €",
        "category": "74",
    },
    {
        "id": "washing_machine_features",
        "text": "Waschmaschine 8 kg Miele oder Bosch Frontlader bis 250 €",
        "category": "176",
    },
    {
        "id": "drill_features",
        "text": "Akkuschrauber 18V bürstenlos mit 2 Akkus im Koffer bis 150 €",
        "category": "84",
    },
]


def record():
    fixtures = {}
    print(f"Recording {len(UTTERANCES)} utterances from OpenRouter...")
    for item in UTTERANCES:
        u_id = item["id"]
        text = item["text"]
        cat_key = item["category"]
        cat_info = find_category(cat_key)
        sys_prompt, usr_prompt = build_intent_prompt(text, cat_info)
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": usr_prompt},
        ]
        kwargs = build_llm_kwargs(messages, max_tokens=1200, temperature=0.0)
        t0 = time.time()
        resp = client.chat.completions.create(**kwargs)
        raw_text = get_response_text(resp)
        elapsed = time.time() - t0
        print(f"[{u_id}] recorded in {elapsed:.1f}s")
        fixtures[u_id] = {
            "text": text,
            "category": cat_key,
            "raw_response": raw_text,
        }
        time.sleep(0.5)

    out_dir = os.path.join(_ROOT, "scraper", "testdata")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "intent_fixtures.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(fixtures, f, indent=2, ensure_ascii=False)
    print(f"Successfully saved {len(fixtures)} fixtures to {out_file}")


if __name__ == "__main__":
    record()
