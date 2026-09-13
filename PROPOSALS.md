# PROPOSALS: System Defects, Architectural Ceilings, and Product Model Contradictions

This document is a verified, comprehensive catalogue of defects, scalability limits, architectural contradictions, and product-model questions across the Prismdeals repository (`scraper`, `backend`, and `frontend`).

Every entry is grounded in an actual code location, AST check, grep measurement, or live database query. Claims from prior surveys that did not survive verification have been cut or corrected rather than repeated.

---

## Baseline Measurements

Re-checked against the live system (database read-only via `mode=ro`):

| Metric | Measured Value | Implication |
| :--- | :--- | :--- |
| **Total stored listings** | **1,265** | Baseline data size. |
| **User-defined indexes** | **0** | Every single join, filter, and sorting query performs a full-table scan. |
| **Distinct listing statuses** | **1 (`'New'`)** | All 1,265 listings are `'New'`; workflow statuses (`Contacted`, `Negotiating`) have never been used. |
| **Listings ever AI-scored** | **10 (0.8%)** | Only 10 listings have `llm_processed = 1` and `niceness_score IS NOT NULL`. |
| **Listings on passive search 1** | **1,070 (84.6%)** | 85% of stored listings belong to an abandoned search that nobody runs or views. |
| **Average listing row size** | **1.9 KB (6.0 KB with AI facts)** | Evaluated listings store 3.8 KB of JSON in `extracted_facts`. |
| **Projected size at 50,000 rows** | **291 MB** | Assuming evaluated listings with extracted facts. |
| **Projected size at 500,000 rows** | **2.9 GB** | Severe disk, memory, and SQLite cache pressure without pagination or column projections. |

### The Core Product Argument
The system's engineering investment is inverted: the 3-step AI wizard, multi-prompt pipeline, and 600-line scoring engine were constructed around a feature that has touched exactly 10 listings. Meanwhile, 85% of the database is occupied by 1,070 listings harvested from a single passive search that nobody runs, and the system possesses zero retention, archival, or cleanup capabilities.

---

## Group A — Broken Now (Defects That Do Not Work at All)

Things that are broken in production today: dead endpoints, inverted loops, missing database columns, and crashes.

### A-1 — `update-all` loop body sits outside the loop
**Where:** `scraper/scraper.py:466-512`
**What:** The loop iterating over listings to fetch deep descriptions terminates prematurely at line 487. Lines 489–513 are indented at 12 spaces (matching the `for` statement) instead of 16 spaces. The scraper fetches all N listings over HTTP (with a 2s sleep each), but only updates the very last listing in the database. If 0 rows match, `parsed` is unbound, raising `UnboundLocalError` at line 489 (swallowed by `except Exception` at line 519).
**Evidence:** AST inspection verifies `for idx, r in enumerate(rows):` contains lines 467–487; line 489 (`detailed_description = parsed["detailed_description"] or ""`) is a sibling statement following the loop.
**Bites:** Today (deep updates waste N requests and update exactly 1 listing).
**Shape of the fix:** Indent lines 489–513 inside the loop body under the `if parsed is None: continue` block.
**Cost:** 10 lines of re-indentation in `scraper/scraper.py`.

### A-2 — Score recalculation hardcodes `status = 'New'`, wiping negotiation states
**Where:** `backend/server.js:254`
**What:** In `recalculateItemScores`, the query updates the score but hardcodes the listing status: `UPDATE listings SET niceness_score = ?, status = ? WHERE id = ?` passing `[score, 'New', listing.id]`. Any listing marked `Contacted` or `Negotiating` is reverted to `New`.
**Evidence:** Live query `SELECT DISTINCT status FROM listings` returns only `[('New',)]` and `SELECT COUNT(*) FROM messages` returns 0. *Correction to initial survey:* No live user data has been destroyed yet because no listings have ever progressed past `'New'`. The defect is a real, latent regression waiting for active outreach.
**Bites:** As soon as outreach/negotiations start.
**Shape of the fix:** Remove `status = ?` from the `UPDATE` statement so score recalculation only modifies `niceness_score`.
**Cost:** 1 line in `backend/server.js`.

### A-3 — `POST /api/searches/recalculate` writes to non-existent column `item_json`
**Where:** `backend/server.js:1203-1206`
**What:** Endpoint executes `UPDATE searches SET item_json = ? WHERE id = ?`. Column `item_json` does not exist on table `searches` (it lives on `knowledge_sets`). Every invocation fails with a 500 internal server error.
**Evidence:** `PRAGMA table_info(searches)` returns columns: `id, campaign_id, name, url, enabled, knowledge_set_id`.
**Bites:** Today (endpoint fails 100% of the time).
**Shape of the fix:** Update `knowledge_sets.item_json` via the search's `knowledge_set_id` foreign key, or drop the dead column update.
**Cost:** 5 lines in `backend/server.js`.

### A-4 — `POST /api/listings/draft` reads non-existent column and non-existent table
**Where:** `backend/server.js:1292-1296`
**What:** Endpoint checks `if (!listing.profile_id) return res.status(400)` and executes `SELECT * FROM profiles WHERE id = ?`. Column `profile_id` does not exist on `listings`, and table `profiles` does not exist in SQLite.
**Evidence:** `PRAGMA table_info(listings)` contains no `profile_id`. `SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'` returns empty. Endpoint unconditionally returns 400.
**Bites:** Today (outreach drafting is completely inoperative).
**Shape of the fix:** Wire draft generation to the listing's associated campaign knowledge set instead of an obsolete profiles model.
**Cost:** ~25 lines in `backend/server.js`.

### A-5 — Dashboard filter "AI Evaluated Only" checks `status === 'New'`, filtering nothing
**Where:** `frontend/src/App.tsx:963-965`, `frontend/src/App.tsx:1546`, `frontend/src/i18n/translations.ts:108`
**What:** The dropdown option with label `t('dashboard.statusEvaluated')` ("AI Evaluated Only" / "Nur KI-bewertet") maps to value `'New'`. In `App.tsx:964`, `selectedStatusFilter === 'New'` tests `l.status === 'New'`. Because all 1,265 rows have `status = 'New'`, the filter returns all 1,265 rows instead of the 10 evaluated listings.
**Evidence:** `translations.ts:108` defines `statusEvaluated: "AI Evaluated Only"`. `App.tsx:1546` sets `{ value: 'New', label: t('dashboard.statusEvaluated') }`. Live database query confirms 1,265 of 1,265 rows have `status = 'New'`, whereas only 10 have `llm_processed = 1`.
**Bites:** Today (users selecting "AI Evaluated Only" see the entire un-evaluated catalogue).
**Shape of the fix:** Change filter predicate to test `Boolean(l.llm_processed)` and rename the select value to `'Evaluated'`.
**Cost:** 4 lines in `frontend/src/App.tsx`.

### A-6 — Fallback search target emits `profile_id` instead of `search_id`, producing orphaned listings
**Where:** `scraper/main.py:383` and `scraper/main.py:388`
**What:** When no searches exist in SQLite, fallback code appends `{"url": default_url, "profile_id": None}`. Line 388 reads `target.get("search_id")`, which evaluates to `None`. Scraped listings are inserted with `search_id = NULL`.
**Evidence:** Code check: line 383 keys dictionary on `"profile_id"`; line 388 reads `"search_id"`. Ingest query at line 427 inserts `(..., search_id)`. Listings with `search_id IS NULL` are omitted from all inner joins.
**Bites:** Today (fallback scrapes harvest data that is invisible in the dashboard).
**Shape of the fix:** Change key `"profile_id"` to `"search_id"` in `main.py:383`.
**Cost:** 1 line in `scraper/main.py`.

### A-7 — Unhandled `error` events on spawned child processes crash the Node.js API server
**Where:** `backend/server.js:1469`, `1516`, `1565`, `1616`, `1766`
**What:** Lines 761–769 document why `python.on('error')` is critical: *"An unhandled 'error' event ends the Node process. Planning a route would take the whole API down."* Yet five other spawn call sites (`/api/scrape`, `/api/scrape/update-all`, `/api/searches/:search_id/scrape`, `/api/process`, and `runScraper`) lack error handlers. If the Python executable is missing or fails to spawn, Node crashes immediately.
**Evidence:** Grep across `server.js` shows lines 764 and 595 handle `'error'`, while lines 1469, 1516, 1565, 1616, and 1766 attach only `'data'` and `'close'` listeners.
**Bites:** Today (any spawn error in scraping or AI evaluation terminates the backend service).
**Shape of the fix:** Attach `.on('error', (err) => { ... })` handlers to all child processes and reset process locks.
**Cost:** ~15 lines in `backend/server.js`.

### A-8 — Interactive login endpoint executes on non-search URL and fails in JSON parsing
**Where:** `backend/server.js:1656` and `scraper/main.py:408-411`
**What:** `/api/login-session` invokes `main.py --mode scrape --urls https://www.kleinanzeigen.de/m-meine-anzeigen.html?tab=PROJECTS`. `main.py` runs listing scrapers against this URL and then attempts to parse `data/temp_scraped.json`. Because the account page contains no listing cards, `temp_scraped.json` is empty, causing JSON decode errors.
**Evidence:** Code check: `server.js:1656` targets an account URL. `main.py:409` executes `with open(temp_output_file) as f: scraped_items = json.load(f)`.
**Bites:** Today (interactive login button in Settings view fails).
**Shape of the fix:** Separate interactive session login from the listing scrape pipeline into a dedicated helper script.
**Cost:** ~20 lines across backend and scraper.

### A-9 — Dead `/api/external-prompt` endpoint reads non-existent file
**Where:** `backend/server.js:350-355`
**What:** Endpoint tries to read `path.join(__dirname, '..', 'prompts', 'external_prompt.md')`. That file does not exist (the directory contains `external_prompt_market.md`, `external_prompt_profile.md`, and `external_prompt_research.md`).
**Evidence:** File existence check: `ls prompts/external_prompt.md` returns file not found. Endpoint always returns 500 `{ error: 'external_prompt.md not found' }`.
**Bites:** Today (endpoint is 100% broken).
**Shape of the fix:** Remove the obsolete endpoint or redirect to the modular prompt files.
**Cost:** 8 lines in `backend/server.js`.


---

## Group B — Does Not Scale (The Ceilings)

Architectural ceilings that function with 1,200 rows but collapse at 10x or 100x data scale.

### B-1 — Missing index on `listings.search_id` forces full-table scans for all campaign feeds
**Where:** `db/schema.sql:77-96`, `backend/server.js:364-388`
**What:** `listings` has a primary key on `id`, but no index on `search_id`. Every dashboard query joining `searches` and `listings` performs a full table scan.
**Evidence:** `PRAGMA index_list(listings)` returns 0 user-defined indexes. `EXPLAIN QUERY PLAN SELECT * FROM listings WHERE search_id = 1` reports `SCAN listings`.
**Bites:** Today: negligible; at 10x (12,000 rows): dashboard load latency; at 100x (120,000 rows): multi-second table scans blocking the SQLite single-thread lock.
**Shape of the fix:** Add index `CREATE INDEX idx_listings_search_id ON listings(search_id);`.
**Cost:** Schema migration (1 line in `db/schema.sql`).

### B-2 — Composite primary key on `listing_route_geo` has wrong leading column for corridor lookups
**Where:** `db/schema.sql:66-75`, `scraper/route_store.py:326`, `backend/server.js:899`
**What:** `listing_route_geo` defines `PRIMARY KEY (listing_id, route_search_id)`. All corridor queries filter by `WHERE route_search_id = ?`. In B-Trees, an index cannot be used for lookups where the leading column is omitted.
**Evidence:** `EXPLAIN QUERY PLAN SELECT * FROM listing_route_geo WHERE route_search_id = 1` confirms `SCAN listing_route_geo`.
**Bites:** Today: full table scan on every route render; at 10x: route calculations stall; at 100x: corridor planner times out.
**Shape of the fix:** Invert primary key order to `PRIMARY KEY (route_search_id, listing_id)` or add an index on `route_search_id`.
**Cost:** Schema migration in `db/schema.sql`.

### B-3 — Missing index on `messages.listing_id` forces full table scan on every chat view
**Where:** `db/schema.sql:98-106`, `backend/server.js:1272`
**What:** Table `messages` has a primary key on `id`, but no index on `listing_id`. Fetching chat history for any listing performs a full scan of the messages table.
**Evidence:** `PRAGMA index_list(messages)` returns 0 user-defined indexes.
**Bites:** Today: negligible (0 messages); at 10x: slow drawer opening; at 100x: high I/O across thousands of messages.
**Shape of the fix:** Add `CREATE INDEX idx_messages_listing_id ON messages(listing_id);`.
**Cost:** Schema migration (1 line in `db/schema.sql`).

### B-4 — `GET /api/listings` returns entire table with no pagination or field projection
**Where:** `backend/server.js:359-405`
**What:** The listings endpoint executes `SELECT l.* FROM listings l` with no `LIMIT` or `OFFSET`. It fetches every listing and parses every JSON blob (`extracted_facts`, `details`, `images`) in Node memory before sending the full payload.
**Evidence:** Monitored payload size: ~2.5 MB today. Projected payload for 50,000 listings is ~291 MB; for 500,000 listings, ~2.9 GB.
**Bites:** Today: heavy JSON serialization; at 10x: 25 MB payload freezing browsers; at 100x: Node.js V8 heap out-of-memory crash.
**Shape of the fix:** Add cursor/offset pagination (`LIMIT ? OFFSET ?`), and omit heavy `extracted_facts` and `details` blobs from feed views.
**Cost:** ~40 lines in `backend/server.js` + frontend pagination support.

### B-5 — Frontend polls `/api/listings` every 2 seconds during active processing
**Where:** `frontend/src/App.tsx:376-401` and `frontend/src/App.tsx:243-265`
**What:** When AI processing is active, `App.tsx:398` polls `/api/process/active` every 2,000ms. When any item finishes, `refreshAll()` re-fetches the entire database via `/api/listings`, `/api/campaigns`, `/api/search-urls`, and `/api/knowledge-sets`.
**Evidence:** Code check: `checkActiveProcesses` runs on a 2-second interval, invoking `refreshAll()`.
**Bites:** Today: constant network load; at 10x: network saturation and UI stutter; at 100x: self-inflicted denial-of-service.
**Shape of the fix:** Replace full-table polling with delta updates (`/api/listings?since=...`) or WebSocket/SSE events.
**Cost:** ~50 lines across backend and frontend.

### B-6 — `recalculateItemScores` executes N sequential un-transacted `UPDATE` queries
**Where:** `backend/server.js:233-255`
**What:** The function loops through listings sequentially: `for (const listing of listings)` executing `await run('UPDATE listings SET niceness_score = ... WHERE id = ?')` in autocommit mode. Each update triggers an individual disk write and WAL sync.
**Evidence:** AST inspection shows loop at line 233 without `BEGIN TRANSACTION` or `COMMIT`.
**Bites:** Today: 10 listings takes ~50ms; at 10x (1,000 listings): takes 5–10 seconds of locked database writes; at 100x: completely hangs API server.
**Shape of the fix:** Wrap the loop in `BEGIN TRANSACTION` and `COMMIT`, or batch updates into a temporary table or `CASE` expression.
**Cost:** 5 lines in `backend/server.js`.

### B-7 — Synchronous 3.6 MB log file read in `/api/logs` blocks event loop every 1.5 seconds
**Where:** `backend/server.js:1413-1427`, `frontend/src/App.tsx:339-343`
**What:** When scraping is active, the frontend polls `/api/logs` every 1,500ms. The backend reads `data/scraper.log` synchronously with `fs.readFileSync(logFile, 'utf8')` and splits the string by `\n` to return the last 80 lines.
**Evidence:** File size measurement: `data/scraper.log` is currently 3.6 MB. `fs.readFileSync` runs synchronously on Node's main thread.
**Bites:** Today: 20–50ms event loop stalls every 1.5s; at 10x: 35 MB log file freezes all API requests; at 100x: process crashes on string allocation.
**Shape of the fix:** Read only the tail end of the file descriptor (e.g. read last 64 KB using `fs.readSync` with file offset).
**Cost:** 15 lines in `backend/server.js`.

### B-8 — Absence of DOM virtualisation on listing feeds renders thousands of concurrent DOM elements
**Where:** `frontend/src/App.tsx:1587` and `frontend/src/components/RouteResultsView.tsx:495`
**What:** Both the main dashboard feed and route results view render all matching listings directly into the DOM using `.map()`. With 1,265 listings, thousands of heavy DOM nodes, image elements, and event listeners exist simultaneously.
**Evidence:** Grep confirms `filteredListings.map(l => <ListingDetailCard ... />)` without virtual windowing libraries.
**Bites:** Today: sluggish scrolling and high memory usage; at 10x: mobile browser crashes; at 100x: DOM tree unrenderable.
**Shape of the fix:** Integrate `@tanstack/react-virtual` or `react-window` for virtualized list rendering.
**Cost:** ~40 lines across `App.tsx` and `RouteResultsView.tsx`.

### B-9 — Map markers are DOM nodes, so clustering only postpones the ceiling
**Where:** `frontend/src/components/RouteCorridorMap.tsx:91-103, 127-150`
**What:** Clustering was added on this branch (`createClusterIcon`, `ListingClusterMarkers`), so overlapping listings collapse into one marker with a count and the O(n²) projection pass is gone. What remains is the underlying limit: every cluster and every unclustered listing is still a Leaflet `divIcon`, i.e. a real DOM node with Tailwind classes. Leaflet's DOM marker path tops out somewhere around 1–2k simultaneous markers regardless of how they are grouped.
**Evidence:** `grep -n "cluster" RouteCorridorMap.tsx` shows the clustering subcomponent on this branch; the icons are still built with `L.divIcon({ html: ... })` rather than a canvas renderer.
**Bites:** At 10x (a corridor of a few thousand listings zoomed in far enough to uncluster them).
**Shape of the fix:** `L.canvas()` as the renderer for unselected markers, keeping DOM only for the selected one.
**Cost:** ~30 lines, and it changes how markers are styled — canvas takes no CSS.

*(This entry originally claimed clustering was absent. It was true against `main` and false by the time the catalogue was read; corrected rather than deleted, because the ceiling underneath it is real.)*

### B-9b — A deleted listing is re-fetched every cycle, forever
**Where:** `scraper/scraper.py:381-384`
**What:** When a listing is removed from Kleinanzeigen the fetch returns 404, `parse_listing_details_requests` returns `None`, and the loop does `continue` — without touching the row. It keeps `full_info_obtained = 0`, so the next crawl selects it again. There is no attempt counter and no tombstone, so a dead ad costs one request per cycle for as long as the search stays enabled.
**Evidence:** `scraper.py:381-384` — `parsed = parse_listing_details_requests(url, session=session)` / `if parsed is None: continue`, with no `UPDATE` on that path. Found by the review of PR #11; not fixed there because it needs a column.
**Bites:** Today, quietly — and it grows, because listings expire continuously while the set only ever gets larger.
**Shape of the fix:** A `harvest_attempts` counter or a `gone_at` timestamp; stop selecting a row after N consecutive failures, and say so in the interface rather than hiding it.
**Cost:** One column, one migration, and a decision about what the interface shows for an ad that no longer exists.

### B-10 — Price stored as unparsed `TEXT` prevents SQL numerical sorting and range filtering
**Where:** `db/schema.sql:80`, `listings.price` column
**What:** Price is stored as raw scraped text: `'109 € VB'`, `'350 € VB390 €'`, `'140 €149 €'`. Lexicographical string sorting in SQL sorts `'1000 €'` before `'20 €'`. SQL cannot execute `WHERE price < 500` or `ORDER BY price ASC`.
**Evidence:** Live query `SELECT price FROM listings LIMIT 5` returns string representations with currency symbols and negotiation suffixes.
**Bites:** Today: frontend must parse prices client-side with regex; at 10x: SQL cannot filter price ranges; at 100x: un-indexable.
**Shape of the fix:** Add `price_cents INTEGER` (or `price_eur NUMERIC`) and `is_vb BOOLEAN` to `listings`, parsing prices at ingest.
**Cost:** Schema migration + scraper ingest parser update (~25 lines).

### B-11 — Extracted facts stored as monolithic JSON blob instead of structured columns
**Where:** `db/schema.sql:88`, `listings.extracted_facts`
**What:** Extraction results are stored as raw JSON strings averaging 3,841 bytes per row. This prevents indexing specific criteria (GPU, RAM, condition) and forces both runtimes to deserialize megabytes of JSON to evaluate simple conditions.
**Evidence:** Live database measurement: average length of `extracted_facts` where non-null is 3,841.1 bytes (63% of the total row size).
**Bites:** Today: JSON parsing overhead; at 10x: high memory churn; at 100x: database file bloat to gigabytes.
**Shape of the fix:** Promote top-level queryable criteria to dedicated typed columns or use SQLite generated columns with `json_extract`.
**Cost:** Schema migration.

### B-12 — Monolithic frontend JavaScript bundle exceeds 540 KB without route-based code splitting
**Where:** `frontend/vite.config.ts`, `frontend/src/App.tsx`
**What:** All views, components, modals, Leaflet mapping dependencies, and Lucide icons are bundled into a single entry chunk.
**Evidence:** Vite production build output: `dist/assets/index-1u-7I34d.js 543.14 kB (gzip: 155.92 kB)`. Warning: `(!) Some chunks are larger than 500 kB after minification`.
**Bites:** Today: slower initial mobile load; at 10x: bundle grows with every feature; at 100x: degraded mobile performance.
**Shape of the fix:** Use React `lazy()` and dynamic `import()` for `RouteResultsView`, `SettingsView`, and `RouteCorridorMap`.
**Cost:** 15 lines in `frontend/src/App.tsx`.

---

## Group C — Logic That Contradicts Itself

Logic where two parts of the system make conflicting assumptions, or where promises made in docstrings/UI are violated in execution.

### C-1 — Scheduler runs invisibly, reporting "idle" on `/api/scrape/status` while scraping
**Where:** `backend/server.js:1746-1774` and `backend/server.js:1381`
**What:** When scheduled scraping triggers, `runScraper()` (`:1746`) spawns `main.py` but never assigns the process to `activeScraperProcess`. `/api/scrape/status` (`:1407`) checks `active: activeScraperProcess !== null`, reporting `{ active: false, progress: { phase: 'idle' } }` throughout the entire run.
**Evidence:** Code check: manual endpoints (`:1473`, `:1520`, `:1569`) assign `activeScraperProcess = python;`, while line 1766 spawns without assignment.
**Bites:** Today (background scrapes run completely invisibly to the user interface).
**Shape of the fix:** Assign `activeScraperProcess = python` in `runScraper()`, resetting on `'close'`.
**Cost:** 6 lines in `backend/server.js`.

### C-2 — `replan` commits four separate times across multiple tables without transaction atomicity
**Where:** `scraper/route_pipeline.py:326-356`
**What:** The corridor replanning function executes multiple steps, each performing its own internal commit: `ensure_schema` commits at `db_schema.py:33`, `replace_circles` commits at `route_store.py:422`, `retire_searches` commits at `route_store.py:453`, and `requeue` commits at `route_store.py:481`.
**Evidence:** Code check: four separate `conn.commit()` calls occur in sequence without an enclosing transaction.
**Bites:** Today: potential database corruption if interrupted mid-pipeline; at 10x: multiple corridors desync.
**Shape of the fix:** Enclose `replan` in a single `with conn:` transaction block, deferring commit until all steps complete.
**Cost:** 10 lines across `route_pipeline.py` and `route_store.py`.

### C-3 — `retire_searches` disables manual searches sharing a URL with a dropped corridor circle
**Where:** `scraper/route_store.py:440-454`
**What:** When a corridor is redrawn or narrowed, circles that fall outside are detached. `retire_searches` takes all dropped URLs and checks if any row in `route_search_circles` still uses them. If not, it executes `UPDATE searches SET enabled = 0 WHERE id = ?`. If a user manually added that search URL to their campaign, it is silently switched off.
**Evidence:** Code check: query checks only `route_search_circles`, ignoring whether the search was created manually.
**Bites:** Today (user's saved searches are silently disabled when adjusting a route corridor).
**Shape of the fix:** Flag corridor-generated searches with `is_corridor = 1` and only retire corridor-owned searches.
**Cost:** Schema migration + 10 lines in `route_store.py`.

### C-4 — Dossier TTL is computed by `claim_is_fresh` but never evaluated on the read path
**Where:** `scraper/dossiers.py:224-233` and `scraper/dossiers.py:245-266`
**What:** `TTL_DAYS` and helper functions `claim_is_fresh` and `fresh_claims` are defined to expire stale dossier data. But `dossiers.get()` returns the stored JSON payload directly without evaluating freshness, and `pipeline.py` consumes it without checks.
**Evidence:** Grep for `fresh_claims` and `claim_is_fresh` shows they are defined at lines 224–233 of `dossiers.py` and called nowhere else in the codebase.
**Bites:** Today (outdated market intelligence and price bands persist indefinitely).
**Shape of the fix:** Filter claims through `fresh_claims()` in `dossiers.get()` before returning the payload.
**Cost:** 6 lines in `scraper/dossiers.py`.

### C-5 — Total model failure is persisted as a plausible mid score and marked complete
**Where:** `scraper/agent_worker.py:442-536`, `scraper/agent_worker.py:594`
**What:** When LLM extraction fails completely or outputs invalid JSON, `extracted_data` defaults to `{}`. All criteria default to `"unknown"`, all dimensions default to 3 (`raw_score = 3`), reference comparison defaults to `"mixed"`, and `score_listing` computes a neutral score around 50. Line 594 writes `llm_processed = 1, niceness_score = score, status = 'New'`. The failure is recorded as complete and will never be retried.
**Evidence:** Code trace: `agent_worker.py:519` defaults missing dimensions to 3; line 594 writes `llm_processed = 1`.
**Bites:** Today (failed AI extractions masquerade as average deals with score ~50).
**Shape of the fix:** Set `status = 'Error'` and keep `llm_processed = 0` (or `-1`) when extraction fails so it can be re-run.
**Cost:** 6 lines in `scraper/agent_worker.py`.

### C-6 — Unconditional timestamp update in `harvest_listing_details_requests` forces endless LLM re-evaluations
**Where:** `scraper/scraper.py:393-401` and `scraper/agent_worker.py:248`
**What:** Line 393 sets `last_description_changed_at = now()` on every detail fetch, even if `detailed_description` is identical to what is already stored. In `agent_worker.py:248`, the predicate `last_description_changed_at > last_ai_evaluated_at` triggers re-evaluation. Re-harvesting completed listings forces expensive LLM re-evaluations on unchanged text.
**Evidence:** Code check: `scraper.py:393` executes unconditional `UPDATE` without comparing with existing description.
**Bites:** Today (every detail harvest triggers redundant LLM token expenditures).
**Shape of the fix:** Check if `detailed_description.strip() != old_description.strip()` before updating `last_description_changed_at`.
**Cost:** 5 lines in `scraper/scraper.py`.

### C-7 — Shared `data/temp_scraped.json` file used concurrently by multiple processes
**Where:** `scraper/main.py:341`, `scraper/main.py:393-410`
**What:** The temporary scrape file path is static: `temp_output_file = os.path.join(data_dir, "temp_scraped.json")`. When multiple scraping processes execute concurrently, one process unlinks or overwrites the file while another is writing or reading it.
**Evidence:** Code check: line 341 defines hardcoded string; line 395 calls `os.remove(temp_output_file)` before each target.
**Bites:** Today (intermittent file read errors and lost listings during concurrent runs).
**Shape of the fix:** Use unique temporary file names (e.g. `tempfile.NamedTemporaryFile`).
**Cost:** 5 lines in `scraper/main.py`.

### C-8 — Stale closure in React polling loop navigates user out of their selected campaign
**Where:** `frontend/src/App.tsx:259-262`, `frontend/src/App.tsx:323-373`
**What:** `refreshAll()` sets default campaign selection: `if (campaignsData.length > 0 && currentCampaignId === null) setCurrentCampaignId(campaignsData[0].id)`. When called from the interval poller whose closure captured `currentCampaignId` as `null`, it resets the user's active campaign back to the first campaign.
**Evidence:** Code check: `checkStatus` interval at line 366 invokes `refreshAll()`, closing over stale initial render state.
**Bites:** Today (user gets kicked out of their active campaign view when a background scrape completes).
**Shape of the fix:** Use functional state updater: `setCurrentCampaignId(prev => prev ?? campaignsData[0].id)`.
**Cost:** 2 lines in `frontend/src/App.tsx`.

### C-9 — Knowledge-set polling effect overwrites unsaved wizard input when background scrape completes
**Where:** `frontend/src/App.tsx:691-745`
**What:** `useEffect` at line 691 depends on `[activeSearchTarget, searches, knowledgeSets]`. When a scrape finishes, `refreshAll()` fetches knowledge sets and updates `knowledgeSets` state. The new array reference triggers the effect, which reloads database values into local form state, blowing away unsaved user edits in the Guidelines Wizard.
**Evidence:** Code check: lines 696–724 call setters for `editKsName`, `marketMemo`, `sampledListings`, and `researcherOutput` whenever `knowledgeSets` reference updates.
**Bites:** Today (user loses in-progress wizard draft when background scrape completes).
**Shape of the fix:** Guard state reset with a `dirty` flag or only update on explicit user action.
**Cost:** 10 lines in `frontend/src/App.tsx`.

### C-10 — Bulk AI matching completion is hardcoded to a 4-second `setTimeout`
**Where:** `frontend/src/App.tsx:933-937`
**What:** When a user starts AI matching, the frontend sets status to "AI matching completed!" and resets loading state after exactly 4,000ms via `setTimeout`, regardless of how many listings are being processed or whether the background worker has finished.
**Evidence:** Code check: lines 934–937 execute `setTimeout(() => { refreshAll(); setIsProcessing(false); }, 4000);`.
**Bites:** Today (premature success feedback; listings remain un-evaluated after spinner disappears).
**Shape of the fix:** Poll `/api/process/active` until the background process finishes.
**Cost:** 12 lines in `frontend/src/App.tsx`.


---

## Group D — Product Model Contradictions

Questions the application's domain model cannot answer consistently.

### D-1 — Undefined campaign semantics for mixed corridor and ordinary searches
**Where:** `backend/server.js:885-888`, `frontend/src/App.tsx:1450-1500`
**What:** The domain model allows a campaign to contain both ordinary searches and a route corridor. In `server.js:885`, comments acknowledge that non-corridor listings have no `listing_route_geo` row and appear as unplaceable corridor finds. In the UI, if a corridor exists, `RouteResultsView` replaces the entire dashboard, rendering ordinary searches completely inaccessible.
**Evidence:** Comment in `server.js:885-888`: *"A campaign may hold ordinary searches alongside the corridor. Those listings have no row in listing_route_geo, so they arrive with a null detour and get shown as corridor finds that could not be placed."*
**Bites:** Today (mixing searches and corridors in one campaign hides data or displays false errors).
**Shape of the fix:** Enforce campaign types (e.g. `corridor` vs `feed`), or provide tabbed views separating corridor results from ordinary searches.
**Cost:** Product model and UI restructuring.

### D-2 — Multiple corridors in the same campaign are shadowed; only newest is reachable
**Where:** `backend/server.js:413`, `backend/server.js:941`
**What:** The database allows multiple `route_searches` to reference the same `campaign_id`. But backend queries use `ORDER BY id DESC LIMIT 1`. Only the most recently created corridor is ever loaded or rendered; previous corridors are permanently shadowed.
**Evidence:** Queries at lines 413 and 941: `SELECT * FROM route_searches WHERE campaign_id = ? ORDER BY id DESC LIMIT 1`.
**Bites:** Today (creating a second route in a campaign permanently orphans the first).
**Shape of the fix:** Add unique constraint `campaign_id UNIQUE` on `route_searches` or add multi-corridor UI navigation.
**Cost:** Schema constraint or backend routing update.

### D-3 — Searches cannot be paused, renamed, or listed in the UI
**Where:** `frontend/src/types.ts:25`, `frontend/src/App.tsx`
**What:** Search entities have an `enabled` flag in SQLite (`enabled INTEGER DEFAULT 1`). But `enabled` appears only in TypeScript definitions (`types.ts:25`) and nowhere in the UI. Users cannot view, pause, resume, or rename searches without deleting them.
**Evidence:** Grep across `frontend/src/` confirms `enabled` appears exclusively in `types.ts`.
**Bites:** Today (users cannot stop scraping a search without destroying its history).
**Shape of the fix:** Add toggle switches and edit controls to search items in the campaign edit view.
**Cost:** ~25 lines in `frontend/src/App.tsx`.

### D-4 — AI evaluation state is a single boolean with no representation of failed, queued, or stale
**Where:** `db/schema.sql:85`, `listings.llm_processed`
**What:** Column `llm_processed` is defined as `INTEGER DEFAULT 0`. There is no state representation for `queued`, `in_progress`, `failed`, or `stale`. The frontend cannot distinguish between a listing awaiting evaluation, a listing that timed out, and a listing that permanently failed schema validation.
**Evidence:** `db/schema.sql:85` reads `llm_processed INTEGER DEFAULT 0`; `PRAGMA table_info(listings)` confirms there is no other evaluation-state column. (The line number was wrong in the first draft — line 28 is blank.)
**Bites:** Today (no visibility into pipeline bottlenecks or evaluation failures).
**Shape of the fix:** Replace boolean with an evaluation status enum (`pending`, `processing`, `completed`, `failed`, `stale`).
**Cost:** Schema migration + enum handling in backend/frontend.

### D-5 — Car-specific attributes (`mileage`) hardcoded into a general-purpose deals platform
**Where:** `frontend/src/components/GuidelinesWizard.tsx:46-61`, `frontend/src/utils/listingTransformer.ts:30`, `frontend/src/components/ListingDetailCard.tsx:264`
**What:** Automotive fields (`mileage`) are hardcoded into core UI components and prompt templates. In `GuidelinesWizard.tsx:46`, `maxMileage` is injected into buyer context prompts for all categories (including laptops and mattresses). In `listingTransformer.ts:30`, `mileage` is extracted from `Kilometerstand` on all listings.
**Evidence:** Grep check: `maxMileage` appears in lines 46, 61, 119, 131, 141 of `GuidelinesWizard.tsx`.
**Bites:** Today (confusing prompts and UI cards for non-automotive categories).
**Shape of the fix:** Move domain-specific fields into dynamic category playbooks and knowledge sets.
**Cost:** Refactoring prompt generators and listing detail cards (~30 lines).

### D-6 — Feature investment inverted: 3-step wizard built for 10 listings while 85% of data is abandoned
**Where:** `backend/server.js`, `frontend/src/components/GuidelinesWizard.tsx`, live database
**What:** Architectural effort was focused on a 3-step guidelines wizard, multiple prompt files, and a complex scoring engine that have only ever processed 10 listings in production. In contrast, 85% of stored listings belong to an unmaintained search, with zero retention, archival, or cleanup capabilities.
**Evidence:** Live database measurements: 1,070 of 1,265 listings belong to `search_id = 1`. Exactly 10 listings have `llm_processed = 1`.
**Bites:** Today (maintenance burden is concentrated on unused features while database bloats with unmanaged listings).
**Shape of the fix:** Introduce automated listing expiration/archival and retention policies before expanding wizard capabilities.
**Cost:** Product roadmap alignment.

---

## Group E — Multi-User Architecture (The "Whether, Not How" Decision)

The entire application is architected as a single-user system. Supporting multi-user is a ground-up rewrite of the database schema and every query in the codebase.

### E-1 — Database schema has zero tenant isolation (`user_id` absent from all tables)
**Where:** `db/schema.sql` (all tables)
**What:** No table (`campaigns`, `searches`, `listings`, `messages`, `knowledge_sets`, `fact_sheets`, `dossiers`, `route_searches`, `route_search_circles`, `listing_route_geo`) contains a `user_id` column. All data belongs to a single global tenant.
**Evidence:** `PRAGMA table_info` across all 11 tables confirms zero `user_id` foreign keys.
**Bites:** Multi-user: any authenticated user sees, edits, and deletes every other user's campaigns and searches.
**Shape of the fix:** Add `user_id INTEGER REFERENCES users(id)` across all domain tables, with foreign keys enabled.
**Cost:** High (full schema migration + modifying every query in `server.js`, `route_store.py`, `dossiers.py`).

### E-2 — Global `UNIQUE` constraints on `searches.url` and `campaigns.name` prevent multi-user sharing
**Where:** `db/schema.sql:31`, `db/schema.sql:135`
**What:** `campaigns.name` and `searches.url` are declared globally `UNIQUE`. If User A creates a campaign named "Laptops" or tracks a specific search URL, User B is barred from using that name or tracking that URL.
**Evidence:** DDL: `CREATE TABLE campaigns ( name TEXT UNIQUE )` and `CREATE TABLE searches ( url TEXT UNIQUE )`.
**Bites:** Multi-user: immediate constraint violation errors on common searches and names.
**Shape of the fix:** Replace global unique constraints with composite unique constraints: `UNIQUE(user_id, name)` and `UNIQUE(user_id, url)`.
**Cost:** Schema migration.

### E-3 — `users.role` is stored and returned in JWT but never enforced in authorization
**Where:** `backend/server.js:208`, `backend/server.js:323`, `backend/server.js:345`
**What:** The `users` table stores a `role` column, which is decoded in `authenticateToken`. But no endpoint checks permissions or roles. Any authenticated user can perform all operations (e.g. deleting campaigns, changing schedule intervals, running scrapers).
**Evidence:** Grep for `role` in `server.js` shows it is only selected and returned; zero `req.user.role === 'admin'` checks exist.
**Bites:** Multi-user: zero role-based access control; all users have administrative capabilities.
**Shape of the fix:** Add authorization middleware `requireRole('admin')` for sensitive endpoints.
**Cost:** 15 lines in `backend/server.js`.

### E-4 — Shared Kleinanzeigen browser session and cookies profile across all users
**Where:** `data/chrome_profile`, `data/cookies.pkl`, `scraper/scraper.py:530-550`
**What:** Scraper session state is stored in a single shared directory (`data/chrome_profile`) and pickle file (`data/cookies.pkl`). All automated actions and messaging use a single shared account.
**Evidence:** Code check: static paths in `scraper.py` and `server.js`.
**Bites:** Multi-user: all users share one Kleinanzeigen account, risking rapid account flagging and ban.
**Shape of the fix:** Store credentials/session cookies per user in encrypted database records or isolated profile directories.
**Cost:** Architecture rewrite of scraper session management.

### E-5 — Global singleton configuration file for scraper scheduling
**Where:** `data/schedule_config.json`, `backend/server.js:1693-1715`
**What:** Scraping interval and settings are stored in a single JSON file on disk. Any user updating settings modifies the schedule for the entire server.
**Evidence:** `server.js:1693` reads and writes `data/schedule_config.json`.
**Bites:** Multi-user: users overwrite each other's scraper configurations.
**Shape of the fix:** Move schedule settings into user/campaign database columns.
**Cost:** Schema migration + ~20 lines in backend.

### E-6 — Global singleton process lock (`activeScraperProcess`) blocks concurrency
**Where:** `backend/server.js:1432`, `backend/server.js:1495`, `backend/server.js:1548`
**What:** A single in-memory variable `let activeScraperProcess = null;` guards all scraping operations. If User A is running a scrape, User B is blocked with 400 `{ error: 'Scraper is already running' }`.
**Evidence:** Code inspection of `server.js:1432`.
**Bites:** Multi-user: zero concurrency; users block each other indefinitely.
**Shape of the fix:** Implement a job queue (e.g. BullMQ, Celery, or SQLite-backed job table).
**Cost:** High architectural rewrite.

### E-7 — No user registration or invitation mechanism; users can only be created via SQLite CLI
**Where:** `backend/server.js:55-85`, `backend/server.js:288-330`
**What:** The server only seeds a default admin user on first startup. There are no registration endpoints, invitation tokens, or admin user management interfaces.
**Evidence:** Grep for `INSERT INTO users` shows line 79 in `seedDefaultUser()` is the only insertion site in the entire codebase.
**Bites:** Today (adding a user requires opening a root shell and running manual SQL inserts).
**Shape of the fix:** Add administrative user management endpoint (`POST /api/users`).
**Cost:** ~30 lines in `backend/server.js`.

---

## Group F — Configuration and Hygiene

The long tail: hardcoded hosts, unversioned constants, untracked artifacts, and dead code.

### F-1 — Hardcoded public OSRM demo server with 1 req/s rate limit ceiling
**Where:** `scraper/routing.py:32-35`
**What:** Routing defaults to `https://router.project-osrm.org` with an artificial delay of `MIN_REQUEST_INTERVAL_S = 1.0`. The public demo server prohibits heavy use and bans IPs on sustained traffic.
**Evidence:** Code check in `routing.py:32-35`.
**Bites:** Today: calculating detours for 60 listings takes over a full minute purely in sleep delays.
**Shape of the fix:** Allow `OSRM_URL` environment variable override and point to a local Docker container in production.
**Cost:** 5 lines in `scraper/routing.py`.

### F-2 — `PAGES_TO_SCRAPE` is a global process-level constant rather than per-search
**Where:** `scraper/config_template.py:18`, `scraper/scraper.py:24`, `scraper/scraper.py:175`
**What:** `PAGES_TO_SCRAPE = 2` is imported from `config.py`. All searches scrape exactly 2 pages regardless of whether the search has 2 items or 2,000 items.
**Evidence:** Code check: `for page in range(1, PAGES_TO_SCRAPE + 1):` at `scraper.py:195`.
**Bites:** Today: cannot crawl deep pages on sparse searches; wastes bandwidth on dense searches.
**Shape of the fix:** Add `pages_to_scrape INTEGER DEFAULT 2` to `searches` table and pass as parameter.
**Cost:** Schema migration + 10 lines in `main.py` and `scraper.py`.

### F-3 — Three duplicate copies of `User-Agent` string, all pinned to Firefox 120
**Where:** `scraper/scraper.py:31`, `scraper/route_search.py:44`, `scraper/dossiers.py:144`
**What:** Grep check reveals three separate string literals pinned to `Firefox/120.0` (released November 2023). Two on Linux x86_64, one on Ubuntu. Static fingerprint across all scraper requests.
**Evidence:** Grep for `Firefox/120` returns 3 matches in `scraper/`.
**Bites:** Today: increased risk of Akamai / Cloudflare captcha challenges.
**Shape of the fix:** Consolidate User-Agent and headers into a single utility module with rotation.
**Cost:** 10 lines in a shared utility.

### F-4 — Scoring model contains ~15 unversioned magic numbers
**Where:** `scraper/scoring.py:206`, `215-217`, `245`, `261-262`, `297`
**What:** Magic numbers: `0.65`, `0.35`, `50.0`, `0.60`, `12, 7, 3`, `4, 2, 1`, `35`, `15`, `0.8**critical_gaps`. Neither the version of the scoring model nor the weights used are stored in `listings`. Changing any constant silently invalidates score comparisons with previously scored listings.
**Evidence:** Code check in `scraper/scoring.py`.
**Bites:** Today (scores computed last week mean something different from scores computed today).
**Shape of the fix:** Add `scoring_version` column to `listings` and store versioned parameter configs.
**Cost:** Schema migration + 10 lines in `scoring.py`.

### F-5 — `scripts/ui_shots.py` checkpoints live database and spawns server with active scheduler
**Where:** `scripts/ui_shots.py:274`, `scripts/ui_shots.py:295`
**What:** Line 274 runs `sqlite3 src_db "PRAGMA wal_checkpoint(TRUNCATE);"` directly on production `data/scraper.db`. Line 295 spawns `server.js`, which automatically calls `setupScheduledScraping()`, arming background scraping timers during test runs.
**Evidence:** Code check in `scripts/ui_shots.py:274, 295`.
**Bites:** Today (running screenshot automation can lock production DB and spawn unwanted scrapes).
**Shape of the fix:** Open source database with `mode=ro` or create an empty SQLite fixture; disable scheduler in test mode.
**Cost:** 10 lines in `scripts/ui_shots.py`.

### F-6 — Scratch probe script `backend/_tmp_probe2.js` tracked in git with auth bypassed
**Where:** `backend/_tmp_probe2.js:1-23`
**What:** A scratch test script is tracked in git. Line 5 stubs out authentication: `app.use('/api', (req,res,next)=>next());`. Hardcoded port 4599.
**Evidence:** `git ls-files backend/_tmp_probe2.js` returns tracked file.
**Bites:** Today (repository hygiene violation and dead code).
**Shape of the fix:** `git rm backend/_tmp_probe2.js`.
**Cost:** Delete file.

### F-7 — Settings written by UI (`delayBetweenPages`, `delayBetweenListings`) are never read by scraper
**Where:** `frontend/src/components/SettingsView.tsx:189`, `backend/server.js:1343-1357`, `scraper/config_template.py:16-17`
**What:** The UI writes `delayBetweenPages` and `delayBetweenListings` to `data/schedule_config.json`. The Python scraper never reads `schedule_config.json`; it imports static constants `DELAY_BETWEEN_PAGES` and `DELAY_BETWEEN_LISTINGS` from `config.py`.
**Evidence:** Grep for `schedule_config.json` in `scraper/` returns zero matches.
**Bites:** Today (user settings in UI give illusion of control but have zero effect).
**Shape of the fix:** Read `schedule_config.json` inside Python scraper, or remove dead controls from Settings UI.
**Cost:** 10 lines in `scraper/scraper.py`.

### F-8 — Dead 933-line `scraper/scraper_selenium.py` retained in repository
**Where:** `scraper/scraper_selenium.py:1-933`
**What:** 933 lines of legacy Selenium scraping code exist in `scraper_selenium.py`. The file is never imported anywhere in the repository.
**Evidence:** Grep across repository for `scraper_selenium` returns zero imports.
**Bites:** Today (confusion about active scraper architecture, bloats code audits).
**Shape of the fix:** Remove `scraper/scraper_selenium.py`.
**Cost:** Delete file (removes 933 lines of dead code).

### F-9 — Missing automated schema versioning and migration runner
**Where:** `db/schema.sql`, `scraper/db_schema.py:1-40`, `backend/db/schema.js:1-50`
**What:** Database uses `CREATE TABLE IF NOT EXISTS` for all tables. There is no `schema_migrations` table or migration runner. Any column alterations (like `last_description_changed_at`) require ad-hoc `ALTER TABLE` try/catch blocks scattered across runtimes.
**Evidence:** Code check: both Python and Node run separate ad-hoc DDL applications without a shared version tracking table.
**Bites:** Today (fragile deployments, duplicate migration logic in Node and Python).
**Shape of the fix:** Introduce a lightweight numbered migration runner (e.g. `001_initial.sql`, `002_route.sql`) shared by both runtimes.
**Cost:** ~50 lines in `db/`.

### F-10 — Redundant SQLite query in `authenticateToken` middleware executes on every API request
**Where:** `backend/server.js:208`
**What:** On every authenticated request, `authenticateToken` executes `SELECT id, email, role FROM users WHERE id = ?`, even though the JWT token is already cryptographically verified with `jwt.verify(token, JWT_SECRET)`.
**Evidence:** Code check in `server.js:208`.
**Bites:** Today: adds database read contention to every static API and poller request; at 10x: SQLite lock contention.
**Shape of the fix:** Trust the verified JWT payload, or cache user lookups in memory with a short TTL.
**Cost:** 5 lines in `backend/server.js`.

### F-11 — `Card.tsx` concatenates class names via string template rather than `cn()`
**Where:** `frontend/src/components/ui/Card.tsx:20`
**What:** `Card.tsx` renders `className={`${baseStyle} ${interactiveStyle} ${className}`` rather than calling `cn()` (`clsx` + `tailwind-merge`). When callers pass custom utility classes (e.g. custom backgrounds or borders), CSS specificity clashes occur in non-deterministic order.
**Evidence:** Code check: `Card.tsx:20` uses template literals, while `frontend/src/utils/cn.ts` is already available in the project.
**Bites:** Today (styling glitches when overriding Card styles).
**Shape of the fix:** Wrap classes with `cn(baseStyle, interactiveStyle, className)`.
**Cost:** 2 lines in `frontend/src/components/ui/Card.tsx`.

### F-12 — `Button.tsx` variant names contradict assigned brand colors
**Where:** `frontend/src/components/ui/Button.tsx:24`, `frontend/src/components/ui/Button.tsx:28`
**What:** Button variants are named `action-emerald` and `mini-emerald`, but their CSS definitions use `brand-accent` (coral) and hardcoded `#f09587`. Meanwhile `action-sky` and `action-indigo` use obsolete palette colors that clash with the brand dark-teal design system.
**Evidence:** `Button.tsx:12-15` still declares `action-emerald`, `action-sky`, `action-indigo` and `mini-emerald`; `:40` gives `action-emerald` a body made entirely of brand tokens (`bg-bg-surface`, `hover:text-brand-accent`). The palette sweep on this branch restyled the variants and left their names — so the contradiction is now between a name and a token set rather than between a name and a hex code. Re-checked on `integration/everything`: still true.
**Bites:** Today (developer confusion and visual design inconsistency).
**Shape of the fix:** Rename variants to semantic names (`accent`, `subtle`, `outline`) and remove dead color variants.
**Cost:** ~15 lines in `frontend/src/components/ui/Button.tsx`.
