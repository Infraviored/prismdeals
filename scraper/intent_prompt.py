"""Prompt construction for intent parsing (Package P4).

Follows product-core.md §8:
  hard frame (rules & schema) + soft middle (category & text) + output format at end.
"""


def build_intent_prompt(text, category_info=None):
    """Builds prompt: hard frame + soft middle + output format at the end."""
    category_desc = "None"
    available_filters_desc = "None"
    if category_info:
        c_name = category_info.get("name", "Unknown")
        c_id = category_info.get("id", "")
        category_desc = f"{c_name} (ID: {c_id})"
        flts = [f.get("key") for f in category_info.get("filters", []) if f.get("key")]
        if flts:
            available_filters_desc = ", ".join(flts[:20])

    system_prompt = (
        "You are an expert shopping intent parser for a German secondhand marketplace (Kleinanzeigen).\n"
        "Your task is to analyze the buyer's search request and extract structured intent.\n\n"
        "--- HUNT TYPES (strictly choose one) ---\n"
        "1. exact: Specific exact model, spec, or part number (e.g. 'Corsair 2x16 GB DDR4-3200', 'Lego 75192').\n"
        "2. shortlist: Buyer names specific models to compare (e.g. 'Yamaha R1 oder Honda CBR1000RR', 'iPhone 13 oder 14').\n"
        "3. class: A kind/type of item without naming all specific models (e.g. '1000cc Supersportler', 'Kombi mit Anhängerkupplung', 'Trekking E-Bike').\n"
        "4. features: Technical specs or properties matter most, brand/model is flexible (e.g. 'Laptop 32 GB OLED', '55 Zoll 4K TV').\n"
        "5. fit: Physical dimensions, frame size, or fit is the primary constraint (e.g. 'Matratze 140x200', 'Kleiderschrank max 120 cm breit', 'Kinderfahrrad 20 Zoll').\n"
        "6. taste: Aesthetic, vintage, decorative, style-driven search (e.g. 'vintage Sessel Mid-Century', 'Stehlampe').\n"
        "7. opportunity: Resale, tool bundles, bargains under market (e.g. 'Werkzeug Konvolut', 'Restposten').\n\n"
        "--- STRICT RULES ---\n"
        "- NEVER invent a budget. If the user did NOT mention a price or budget limit, 'budget' MUST be null.\n"
        "- 'confidence' must be a float between 0.0 and 1.0.\n"
        "- 'models': list of specific model names explicitly mentioned by the buyer.\n"
        "- 'class': class name if hunt_type is 'class', else null.\n"
        "- 'sizes': dictionary of sizes/dimensions mentioned (e.g. {'width_cm': 120}, {'dimensions': '140x200'}).\n"
        "- 'musts': list of deal-breaker constraints. Each must has: id (slug), label (German), type ('number'|'enum'|'boolean'|'text'), want ({'min': ...} or {'max': ...} or {'match': ...} or {'oneOf': [...]} or {'present': true}).\n"
        "- 'prefs': list of nice-to-have wishes in the same shape as musts.\n"
        "- 'filters': candidate marketplace filters (e.g. brand, km, ram, condition).\n"
        "- 'use': list of intended uses (e.g. ['video editing', 'track day']).\n"
    )

    user_prompt = (
        f"--- CONTEXT ---\n"
        f"Category: {category_desc}\n"
        f"Available category filters: {available_filters_desc}\n"
        f'Buyer query: "{text}"\n\n'
        "--- OUTPUT FORMAT ---\n"
        "Return ONLY a single valid JSON object strictly matching this schema:\n"
        "{\n"
        '  "hunt_type": "exact" | "shortlist" | "class" | "features" | "fit" | "taste" | "opportunity",\n'
        '  "confidence": 0.95,\n'
        '  "class": null | "string",\n'
        '  "models": ["model1", ...],\n'
        '  "musts": [{"id": "...", "label": "...", "type": "number|enum|boolean|text", "want": {...}}],\n'
        '  "prefs": [{"id": "...", "label": "...", "type": "...", "want": {...}}],\n'
        '  "filters": {"filter_key": "value"},\n'
        '  "use": ["use1", ...],\n'
        '  "sizes": {},\n'
        '  "budget": {"min": null, "max": 150} | null\n'
        "}"
    )

    return system_prompt, user_prompt
