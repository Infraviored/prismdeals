# Kleinanzeigen Scraper & AI Agent Architecture

This document maps the repository layout, data schemas, sequence workflow, and API interfaces for the Kleinanzeigen deal-matching and automated outreach workspace.

---

## 📂 Repository Layout

```
├── ARCHITECTURE.md          # This system map
├── data/
│   └── scraper.db           # SQLite production database
├── backend/                 # Node.js/Express SQLite API Server
│   ├── package.json
│   ├── db_setup.js          # SQLite table creation schema and triggers
│   └── server.js            # Express router, SSE progress streams, & draft generation endpoints
├── scraper/                 # Python 3 Scraper Daemon & AI worker
│   ├── main.py              # CLI controller orchestrating crawling and interpretation stages
│   ├── scraper.py           # Playwright scraper (index discovery & detailed specs/images harvesting)
│   ├── agent_worker.py      # OpenAI GPT evaluator calculating scores and matching status
│   ├── prompts.py           # Evaluation criteria & outreach message prompts templates
│   └── requirements.txt     # Python backend dependencies
├── frontend/                # Vite + React Client App
│   ├── src/
│   │   ├── App.tsx          # Single-Page state-driven dashboard (Landing, Dashboard, Edit view)
│   │   ├── main.tsx
│   │   └── index.css        # Premium styling sheet
│   └── package.json
└── scripts/                 # Maintenance scripts
    └── reset_listings.py    # Database utility to purge listings while preserving credentials
```

---

## 🗃️ Database Schema

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
    *   `extraction_criteria`: List of `{ id, question, type }` evaluated by Worker AI.
    *   `scoring_model`: `{ base_score, rules: [{ criterion_id, value, is_dealbreaker, weight }] }`.

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
*   `niceness_score` (INTEGER) - Dynamic deal rating (default 50)
*   `status` (TEXT) - `'New' | 'Evaluating' | 'Matched' | 'Dealbreaker'`
*   `search_id` (INTEGER, FK -> searches.id)
*   `details` (TEXT, JSON string) - Generic KV specifications parsed from `.addetailslist--detail`
*   `images` (TEXT, JSON string) - List of harvested carousel image slide URLs

---

## 🔄 Execution & Lifecycle Pipeline

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

---

## 🔌 API Documentation (backend/server.js)

### Campaigns
*   `GET /api/campaigns` - Retrieves campaigns including active listings metrics.
*   `POST /api/campaigns` - Creates a new campaign.
*   `DELETE /api/campaigns/:id` - Deletes a campaign and cascades associated search queries.

### Search Targets
*   `GET /api/search-urls` - Retrieves active search queries and their linked `knowledge_set_id`.
*   `POST /api/search-urls` - Persists search target lists and binds expert profiles.
*   `DELETE /api/search-urls/:id` - Deletes a tracking search target.

### Listings & Operations
*   `GET /api/listings` - Returns detailed lists of scraped items.
*   `POST /api/listings/evaluate` - Triggers direct, immediate Worker AI interpretation for a single ad.
*   `POST /api/listings/draft` - Returns or dynamically generates a personalized outreach message draft.
*   `POST /api/scrape` - Asynchronously triggers Python scraper daemon commands.
*   `GET /api/scrape/progress` - Server-Sent Events (SSE) stream returning real-time progress card details.
