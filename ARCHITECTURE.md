# Kleinanzeigen Scraper and AI Agent Architecture

This document maps the repository layout, data schemas, sequence workflow, and API interfaces for the Kleinanzeigen deal-matching and automated outreach workspace.

---

## Repository Layout

```
├── ARCHITECTURE.md          # System map & architectural reference
├── data/
│   ├── scraper.db           # SQLite production database
│   └── session_status.json  # Persisted login session data (email & timestamp)
├── prompts/                 # Version-controlled Externalized AI Prompt templates
│   ├── schema_prompt.md     # Ingestion JSON schema prompt reference
│   └── expert_guidelines_prompt.md # Expert checklist/guidelines prompt reference
├── backend/                 # Node.js/Express SQLite API Server
│   ├── package.json
│   ├── db_setup.js          # SQLite table creation schema and triggers
│   ├── server.js            # Express server handling listing APIs & scheduler
│   └── public/              # Legacy frontend fallback dashboard
├── scraper/                 # Python 3 Scraper Daemon & AI worker
│   ├── main.py              # CLI controller orchestrating crawling and interpretation stages
│   ├── scraper.py           # Playwright scraper (index discovery & detailed specs/images harvesting)
│   ├── agent_worker.py      # OpenAI GPT evaluator calculating scores and matching status
│   ├── prompts.py           # Evaluation criteria & outreach message prompts templates
│   ├── config.py            # Scraping and LLM settings, dynamic .env loader
│   └── requirements.txt     # Python backend dependencies
├── frontend/                # Vite + React Client App
│   ├── src/
│   │   ├── App.tsx          # Single-Page state-driven dashboard (Landing, Dashboard, Edit view)
│   │   ├── types.ts         # TypeScript schema and state definitions
│   │   ├── main.tsx
│   │   └── index.css        # Tailwind/Vite premium styling sheet
│   └── package.json
└── scripts/                 # Maintenance scripts
    └── reset_listings.py    # Database utility to purge listings while preserving credentials
```

---

## Database Schema

### 1. `campaigns`
Top-level campaign entity representing a broad market segment (e.g. "Sport Bikes").
*   `id` (INTEGER, PK)
*   `name` (TEXT, UNIQUE)

### 2. `knowledge_sets`
Contains expert instructions, checklists, and real-time evaluation weights.
*   `id` (INTEGER, PK)
*   `name` (TEXT)
*   `expert_knowledge` (TEXT) - General domain description instructions
*   `item_json` (TEXT) - JSON payload representing:
    *   `extraction_criteria`: List of `{ id, description, type }` evaluated by Worker AI.
    *   `scoring_model`: A normalized, importance-based scoring engine:
        ```json
        {
          "weights": {
            "camelCaseFieldId": {
              "satisfied_if": true,
              "importance": 25
            }
          }
        }
        ```

### 3. `searches`
Configured Kleinanzeigen tracking queries linked to a single guidelines profile.
*   `id` (INTEGER, PK)
*   `campaign_id` (INTEGER, FK -> campaigns.id)
*   `name` (TEXT)
*   `url` (TEXT) - Kleinanzeigen search endpoint URL
*   `enabled` (INTEGER, BOOLEAN)
*   `knowledge_set_id` (INTEGER, FK -> knowledge_sets.id)

### 4. `listings`
Scraped ads, harvested sub-page metrics, and calculated AI evaluations.
*   `id` (TEXT, PK) - Scraped Kleinanzeigen ad ID
*   `title` (TEXT)
*   `price` (TEXT)
*   `location` (TEXT)
*   `url` (TEXT)
*   `short_description` (TEXT) - Parsed from search card list
*   `detailed_description` (TEXT) - Harvested from full ad detail page
*   `llm_processed` (INTEGER, BOOLEAN)
*   `llm_processed_time` (TEXT, ISO timestamp)
*   `full_info_obtained` (INTEGER, BOOLEAN) - 1 if all criteria evaluated cleanly
*   `extracted_facts` (TEXT, JSON string) - KV mapping matching criterion IDs to values
*   `niceness_score` (INTEGER) - Normalized weight-based rating from 0 to 100
*   `status` (TEXT) - `'New' | 'Evaluating' | 'Matched'`
*   `search_id` (INTEGER, FK -> searches.id)
*   `details` (TEXT, JSON string) - Generic KV specifications parsed from `.addetailslist--detail`
*   `images` (TEXT, JSON string) - List of harvested carousel image slide URLs

---

## Hierarchical Intelligent Agent Pipeline (The Dual-Model Engine)

The deal-matching workspace relies on a decoupled, hierarchical dual-model agent pipeline to balance high-level structural intelligence with low-cost execution.

```mermaid
graph TD
    subgraph Architecture Stage
        A[High-Tier Planning Model / Expert Creator]
        A -->|Compiles Profile Prompt Template| B[Guidelines Profile: expert_knowledge & item_json]
    end
    
    subgraph Bulk Processing Stage
        C[Detailed Listing Text & specs]
        B -->|Context Feed| D[Low-Cost Worker Model: gpt-5-nano]
        C -->|Context Feed| D
        D -->|JSON Checklist Output| E[Scoring & Database Storage]
    end
```

### 1. Ingestion Profile Architect (Planning Agent)
*   **Role**: An advanced, reasoning-capable model (or human domain expert) outlines the campaign guidelines parameters.
*   **Operation**: The architect creates the specific ingestion configuration. It designs the core domain logic (`expert_knowledge`), maps checklist targets (`extraction_criteria`), and assigns the scoring importance weights (`scoring_model.weights`).
*   **Logical Focus**: Decouples search design and expert criteria formulation (requiring high logical reasoning) from continuous, manual item review.

### 2. Execution Processor (Low-Cost Worker Agent)
*   **Role**: A high-efficiency, lower-cost model (`gpt-5-nano`) executes high-throughput evaluation tasks.
*   **Context Fed to the Worker**:
    *   **Scraped Listing Text**: The specific Kleinanzeigen ad's detailed description, title, and key specifications.
    *   **Domain & Expert Knowledge Rules**: General instructions, specific warnings (e.g. what indicates track use or valve wear), and product constraints.
    *   **Extraction Criteria List**: Strict target fields to evaluate and parse from the text.
*   **Operation**: The low-cost model processes each listing independently. It maps the listing's text against the guidelines checklists and generates a clean, structured JSON output (`extracted_facts`). It has no knowledge of scoring weights, serving strictly as an objective, unbiased fact extractor.
*   **Dynamic Scoring**: The backend server and agent worker post-calculate the score using the structured output from the cheap model and the importance weights defined by the architect.

---

## Normalized Scoring Engine

The matching system calculates item deal suitability using a normalized weight-based percentage (0% to 100%).

1. **Decentralized Guidelines Profiles**: Expert evaluation checklists and weights are stored in the database per campaign search target via `knowledge_sets`.
2. **Normalized Weights**: Instead of a starting baseline score and absolute adjustments, each satisfied criterion adds its specific `importance` weight.
3. **Score Range**: Calculated as `sum(satisfied_criteria.importance)`. The frontend and backend cap the score within `[0, 100]`.
4. **Color Badges**: Badges are rendered dynamically based on the score threshold:
   * **Green (Excellent)**: Score >= 70
   * **Amber (Good/Neutral)**: Score >= 40 and < 70
   * **Grey (Low)**: Score < 40

---

## Execution & Lifecycle Pipeline

```mermaid
sequenceDiagram
    autonumber
    participant Playwright as Scraper Discovery
    participant Harvester as Scraper Harvester
    participant DB as SQLite DB
    participant Agent as LLM Agent Worker
    
    Note over Playwright, DB: Stage 1: Discovery Phase (Fast Index Crawling)
    Playwright->>Playwright: Scan Kleinanzeigen Index Pages
    Playwright->>DB: INSERT OR IGNORE base ad info (ID, title, price, location, short_description)
    
    Note over Harvester, DB: Stage 2: Detail Harvesting Phase (Sub-page Crawling)
    Harvester->>DB: SELECT listings WHERE detailed_description IS NULL
    loop For each missing listing
        Harvester->>Harvester: Crawl listing page directly
        Harvester->>DB: UPDATE listing SET detailed_description, details, images, full_info_obtained=1
    end
    
    Note over Agent, DB: Stage 3: Grading & Analysis Phase (AI Interpretation)
    Agent->>DB: SELECT listings WHERE llm_processed=0
    loop For each unprocessed listing
        Agent->>Agent: Generate prompt utilizing expert_knowledge and extraction_criteria
        Agent->>DB: UPDATE listing SET llm_processed=1, extracted_facts, niceness_score, status
    end
```

### Key Execution Highlights

1. **Per-Listing Independent AI Evaluation**:
   Users can click "AI-Eval" on any listing in the dashboard to trigger an independent, real-time background evaluation request (`POST /api/process` with listing ID). The frontend monitors execution state at the listing card level, keeping other UI components interactive.
2. **Dynamic External Prompt Template**:
   The AI Researcher prompt is externalized in `prompts/schema_prompt.md`. When evaluating a listing, the worker incorporates search-specific target parameters directly into this dynamic template. The frontend retrieves the template via `GET /api/schema-prompt` to allow copying the current prompt reference.
3. **Resilient Environment Key Loader**:
   `scraper/config.py` contains a dynamic environment file loader that parses the parent `.env` file for `OPENAI_API_KEY` on startup. This fallback ensures standalone Python tasks (e.g. cron-like scheduler tasks) inherit the correct API key regardless of terminal environment variables.

---

## API Documentation (backend/server.js)

### Campaigns
*   `GET /api/campaigns` - Retrieves campaigns including active listings metrics.
*   `POST /api/campaigns` - Creates a new campaign.
*   `DELETE /api/campaigns/:id` - Deletes a campaign and cascades associated search queries.

### Search Targets
*   `GET /api/search-urls` - Retrieves active search queries and their linked `knowledge_set_id`.
*   `POST /api/search-urls` - Persists search target lists and binds expert profiles.
*   `DELETE /api/search-urls/:id` - Deletes a tracking search target.

### Guidelines & Schema Prompts
*   `GET /api/knowledge-sets` - Returns all guidelines profiles.
*   `POST /api/knowledge-sets` - Saves or updates a dynamic guidelines profile.
*   `GET /api/schema-prompt` - Retrieves the active dynamic AI Researcher prompt markdown template.

### Session Authentication Management
*   `GET /api/session-status` - Returns cookie-based session email and last updated timestamp.
*   `POST /api/login-session` - Spawns Playwright browser worker in dynamic interactive login mode.

### Listings & Operations
*   `GET /api/listings` - Returns detailed lists of scraped items.
*   `POST /api/process` - Triggers match grading and scoring evaluations. Accepts optional `listing_id` parameter to run per-card evaluations.
*   `POST /api/listings/draft` - Returns or dynamically generates a personalized outreach message draft.
*   `POST /api/scrape` - Asynchronously triggers Python scraper daemon commands.
*   `GET /api/scrape/progress` - Server-Sent Events (SSE) stream returning real-time progress card details.
