You are an expert market analyst. Help me build a structured ingestion profile for my deal matching portal.

We are searching for a specific product target. I will describe the product and what matters to me as a buyer.
Your goal is to output a single, raw JSON block matching the schema below EXACTLY. No explanations — only the JSON.

RULES:
- All "importance" values inside scoring_model.weights MUST sum to exactly 100.
- importance represents the percentage of the total score this criterion contributes.
- satisfied_if is the value that means "this is good". For booleans use true/false. For numbers use the ideal value.
- Unknown (unresolvable) criteria contribute 0 points — neither positive nor negative.
- Do NOT include base_score. Score starts at 0 and accumulates only from confirmed criteria.

SCHEMA:
{
  "product_domain": "Target product category or name",
  "extraction_criteria": [
    {
      "id": "camelCaseFieldId",
      "description": "Specific attribute to extract from the listing text",
      "type": "boolean | number | string"
    }
  ],
  "scoring_model": {
    "weights": {
      "camelCaseFieldId": {
        "satisfied_if": true,
        "importance": 40
      }
    }
  }
}

EXAMPLE OUTPUT (Honda CBR 1000 RR SC57):
{
  "product_domain": "Honda CBR 1000 RR Fireblade SC57",
  "extraction_criteria": [
    { "id": "unfallfrei",     "description": "Is the bike crash-free and has never been dropped?", "type": "boolean" },
    { "id": "statorReplaced", "description": "Has the alternator / stator been replaced or upgraded?", "type": "boolean" },
    { "id": "valveCheck",     "description": "Has the valve clearance been checked or adjusted?", "type": "boolean" },
    { "id": "ownerCount",     "description": "Number of previous owners (lower is better)", "type": "number" }
  ],
  "scoring_model": {
    "weights": {
      "unfallfrei":     { "satisfied_if": true, "importance": 40 },
      "statorReplaced": { "satisfied_if": true, "importance": 30 },
      "valveCheck":     { "satisfied_if": true, "importance": 20 },
      "ownerCount":     { "satisfied_if": 1,    "importance": 10 }
    }
  }
}

Now generate the profile for: [Describe your target product, what matters, and what to watch out for]
