# Internal Worker Model Inference Concept

This document explains the structural prompting, schema validation, post-processing sanitization, and isolated logging design of the internal evaluator model ([agent_worker.py](scraper/agent_worker.py)).

---

## 1. Structured Prompting & Dynamic JSON Skeleton Injection

To ensure absolute JSON structure adherence and completely eliminate schema validation failures (common with smaller high-efficiency models like `gpt-5-nano`), the system utilizes a **Dynamic JSON Skeleton Injection** technique.

The python worker [agent_worker.py](scraper/agent_worker.py) constructs the prompt using the template [internal_prompt.md](prompts/internal_prompt.md). 
Instead of merely asking the model to construct a complex JSON structure from scratch, the system pre-computes a blank target JSON skeleton filled with default values (`"unknown"`, empty arrays, and defaults) for every campaign-specific criterion ID.

This skeleton is appended directly to the end of the prompt immediately following the `START_JSON` marker:

```markdown
You are a precise listing evaluation agent.
...
START_JSON
{
  "criteria": {
    "unfallfrei": {
      "value": "unknown",
      "evidence_quote": "",
      "reasoning": ""
    },
    "ventilspielGemacht": {
      "value": "unknown",
      "evidence_quote": "",
      "reasoning": ""
    }
  },
  "highlights": [],
  "draft_message": "",
  "_full_info_obtained": false
}
```

The LLM is instructed to fill out this pre-built skeleton and terminate the output with an `END_JSON` marker. This constraints the model's generation path, preventing syntactical mistakes and structural omissions.

---

## 2. Shift of Strictness from LLM to Code (Fuzzy Sanitization)

Rather than treating the LLM as a rigid, zero-tolerance structured parser—which makes the prompt fragile and leads to repetitive retry loops—we treat the LLM as a **soft fact extractor** and place the strictness in a **post-processing sanitization layer** inside our Python execution engine.

### Highlights / Badges Sanitization
The model is asked to extract buyer-relevant highlights/tags and assign them an arbitrary descriptive `kind` or `type` (e.g., `maintenance`, `warning`, `accessory`, `upgrade`, etc.).
Rather than failing validation if the model outputs an unexpected category string, the sanitization layer in [agent_worker.py](scraper/agent_worker.py) maps the arbitrary strings to a strict, standardized set of frontend types and sentiments:

1. **Fuzzy Type Matching**: 
   - Maintenance-related tags (`service`, `oil change`, `wartung`, `reifen`, etc.) are mapped to `"maintenance"`.
   - Threat/defect-related tags (`broken`, `accident`, `damage`, `scratch`, `unfall`, etc.) are mapped to `"warning"`.
   - Upgrades or accessory-related tags are mapped to `"feature"`.
2. **Sentiment Derivation**: Sentiments are automatically assigned depending on the resolved type:
   - `"warning"` -> `"negative"`
   - `"feature"` -> `"positive"`
   - `"maintenance"` -> `"neutral"`
3. **Constraint Enforcement**: Label lengths are strictly truncated to 32 characters (`label[:32]`) in code, rather than failing validation and retrying if the model writes a verbose phrase.

---

## 3. Minimalist Validation & Bounded One-Shot Retry

The system distinguishes between **catastrophic schema failures** (which break database or business logic) and **soft metadata variations** (which can be safely post-processed in code).

### Validation Focus
Validation checks (`validate_extracted_data`) are restricted solely to catastrophic errors:
1. Is the top-level `"criteria"` object present?
2. Are all campaign-defined criterion IDs present inside the `"criteria"` object?

Any deviations in tag types, message strings, or auxiliary properties are transparently resolved by the sanitization layer, bypassing the validation flow.

### Bounded One-Shot Retry
If a catastrophic validation error occurs:
1. A single targeted **One-Shot Retry** is executed.
2. The engine creates a detailed validation report showing the exact failing errors and appends it along with the previous response to the user prompt.
3. If validation still fails on the second attempt, the worker falls back to **best-effort parsing** and proceeds without raising fatal exceptions, maintaining system uptime.

---

## 4. Log Rotation & Isolated Listing-Level Sandboxed Logs

To prevent global log files from expanding infinitely and becoming cluttered with massive LLM prompt blocks, the system leverages a dual-layer logging strategy:

### 1. Global Log Rotation
The main application logs [scraper.log](data/scraper.log) are handled via `RotatingFileHandler`.
- **Configuration**: `maxBytes=5*1024*1024` (5 MB limit) and `backupCount=3`.
- **Behavior**: When `scraper.log` reaches 5 MB, it is automatically rotated to `scraper.log.1`, then `scraper.log.2`, preserving system disk health and only keeping high-level operational info.

### 2. Isolated Per-Object Log Folders
Every scraped listing/object is assigned a dedicated directory under `data/logs/<listing_id>/`. In this folder, the exact inputs, raw outputs, validation metrics, and retries of our internal LLM models are recorded:
- `analysis.log`: The exact evaluation prompt (carrying domain rules, criteria, listing metadata, and the dynamic JSON skeleton), the OpenAI raw response, any validation errors, and subsequent retry loops.
- `conversation_analysis.log`: The exact conversation history prompt and structured JSON response used during chat negotiations.
- `outreach_draft.log`: The exact missing facts analysis prompt and generated seller outreach draft.

This ensures developers can troubleshoot individual model extraction errors without sorting through noisy global console log streams.