You are a precise market-ingestion schema designer and expert buyer advisor.

Your task is to create a complete ingestion profile for a deal-matching portal.
You will receive a buyer's description of a target product, what matters, and what to watch out for.

You must output TWO sections exactly:

1) A JSON object for item_json (extraction_criteria + scoring_model).
2) A German markdown cheat sheet for expert_knowledge.

Do not add any extra text, explanations, or comments outside these two sections.

---

### SECTION 1: JSON BLOCK

Output a single raw JSON object for item_json, matching this schema EXACTLY:

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

OUTPUT RULES FOR JSON:
- Output valid JSON only. No markdown fences, no explanations before or after.
- All scoring_model.weights.importance values must sum to exactly 100.
- Each extraction_criteria.id must be unique and use camelCase.
- Every key in scoring_model.weights must correspond to an id in extraction_criteria.
- Every id in extraction_criteria must appear exactly once in scoring_model.weights.
- Do not include any fields not present in the schema.
- Do not include comments, newlines outside of JSON structure, or extra text.

CRITERIA DESIGN RULES:
- Create 5 to 10 criteria only.
- Include only criteria that are realistically extractable from listing text, title, or ad details.
- Prefer boolean when the question is yes/no.
- Prefer number when lower/higher or exact numeric comparison matters.
- Use string only if boolean or number would lose important meaning.
- Avoid vague criteria like "good condition", "serious seller", or "worth buying".
- Avoid duplicate or overlapping criteria.
- Each description must describe a concrete attribute to extract from the listing, not a scoring opinion.
- Criteria should reflect real buyer decision factors: common defects, maintenance history, configuration, usage signals, ownership signals, authenticity, and deal-breakers.

SCORING RULES:
- importance is the percentage contribution of that criterion to the total score.
- satisfied_if is the condition that should count as positive.
- For boolean criteria, satisfied_if must be true or false.
- For number criteria, satisfied_if should be the ideal target number.
- For string criteria, satisfied_if should be the preferred exact string value only if a precise preferred value is meaningful.
- Put more weight on high-risk defects, expensive repairs, authenticity, maintenance proof, and deal-breakers.
- Put less weight on nice-to-have extras.

---

### SECTION 2: GERMAN EXPERT CHEAT SHEET

After the JSON block (with a blank line between them), output a German markdown cheat sheet for expert_knowledge inside a ```markdown ... ``` block.

Structure it exactly like this:

```markdown
# Expert: [Product Domain]

## Worauf du achten willst
- [Technical/hardware details, model-specific vulnerabilities]
- [Wear-and-tear areas, typical failure points]
- [Service/history checks, documentation, provenance]

## Soft seller questions
- "Hallo, schönes Teil! [Friendly, non-interrogative question about critical maintenance]"
- "[Another soft question about a different critical aspect]"
- "[One more soft question about usage, storage, or ownership]"

## Sample Outreach Message Template
"Hallo,

interessantes Angebot! Ich suche gerade nach einem [product] und habe mich speziell auf [model/feature] eingestuft.

Könntest du mir bitte kurz folgende Fragen beantworten?

- [Critical maintenance item 1]
- [Critical maintenance item 2]
- [Usage/storage/ownership detail]

Ich freue mich auf deine Antwort!

Viele Grüße
[Dein Name]"
```

CONTENT RULES FOR EXPERT_KNOWLEDGE:
- Write in natural German, not robotic or overly formal.
- Focus on real-world buyer concerns: common defects, expensive repairs, manufacturer-specific failure points, service intervals, and typical seller hand-waving.
- Include specific technical checks relevant to the product domain.
- Soft questions should be friendly, non-accusatory, and invite honest answers.
- The outreach template should be a ready-to-send German message that references the domain's critical points.

---

### EXAMPLE OUTPUT (Honda CBR 1000 RR Fireblade SC57)

```json
{
  "product_domain": "Honda CBR 1000 RR Fireblade SC57",
  "extraction_criteria": [
    { "id": "unfallfrei",       "description": "Is the bike explicitly described as crash-free and not dropped?",                     "type": "boolean" },
    { "id": "statorReplaced",   "description": "Has the alternator or stator been replaced, repaired, or upgraded?",                 "type": "boolean" },
    { "id": "valveServiceDone", "description": "Has a valve clearance inspection or adjustment been performed?",                     "type": "boolean" },
    { "id": "ownerCount",       "description": "How many previous owners are mentioned?",                                            "type": "number"  },
    { "id": "trackUseSigns",    "description": "Are there signs the bike was used on track or modified for track riding?",           "type": "boolean" }
  ],
  "scoring_model": {
    "weights": {
      "unfallfrei":       { "satisfied_if": true,  "importance": 30 },
      "statorReplaced":   { "satisfied_if": true,  "importance": 25 },
      "valveServiceDone": { "satisfied_if": true,  "importance": 20 },
      "ownerCount":       { "satisfied_if": 1,     "importance": 10 },
      "trackUseSigns":    { "satisfied_if": false, "importance": 15 }
    }
  }
}
```

```markdown
# Expert: Honda CBR 1000 RR Fireblade SC57

## Worauf du achten willst
- Ventilspiel-Historie, vor allem die große 24.000-km-Kontrolle (kostenintensiv, entscheidend).
- Lichtmaschine / Stator / Regler, besonders bei frühen SC57 (Stator brennt gerne durch).
- Getriebe unter Last, besonders 2. und 3. Gang; nichts darf rausspringen oder klappern.
- Gabeldichtringe (Simmerringe), auf Ölverlust im Bereich der Gabelbeine prüfen.
- Kupplung auf Durchzug, besonders bei hohen Kilometerständen.
- TÜV-Status und letzte Hauptuntersuchung, inklusive erlaubter Mängel.
- Serviceheft und Nachweise für große Wartungen (Ventile, Stator, Kupplung).
- Hinweise auf Sturz, Reparatur, Lackierungsarbeiten oder Fahrgestellschaden.
- Track-Use-Signale: Rennmodifikationen, aggressive Umbauten, fehlende Straßenzulassung.

## Soft seller questions
- "Hallo, schönes Teil! Wurde die große Ventilspielkontrolle bei 24.000 km schon erledigt und gibt es Belege dazu?"
- "Ist die Lichtmaschine / der Stator irgendwann mal gemacht worden? Bei frühen SC57 ist das ein bekanntes Thema."
- "Wie verhält sich das Getriebe unter Last, besonders in 2. und 3. Gang?"
- "Ist das Fahrzeug garage- oder außenstehend? Gab es Ölverlust an der Gabel?"

## Sample Outreach Message Template
"Hallo,

interessantes Angebot! Ich suche gerade nach einer Fireblade SC57 und habe mich speziell auf dieses Modell eingestuft.

Könntest du mir bitte kurz folgende Fragen beantworten?

- Wurde die große Ventilspielkontrolle bei 24.000 km schon gemacht? Gibt es Belege?
- Ist Lichtmaschine / Stator mal gemacht worden?
- Wie war das Getriebe unter Last, besonders in 2. und 3. Gang?
- Ist das Fahrzeug garage- oder außenstehend?

Ich freue mich auf deine Antwort!

Viele Grüße
[Dein Name]"
```

---

### HOW TO USE

1. Replace the last line below with your product description.
2. Paste the full prompt into ChatGPT (or any capable LLM).
3. Copy the JSON object → paste into `knowledge_sets.item_json` in the UI.
4. Copy the markdown block → paste into `knowledge_sets.expert_knowledge` in the UI.

Everything else is automatic: the internal worker picks up both fields at runtime for every scraped listing.

---

### USER INPUT

[Describe your target product, what matters to you, your deal-breakers, common defects, and what signals a good or bad listing]