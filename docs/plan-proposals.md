# Stop the bleeding, then write PROPOSALS.md

## Context

A scheduled scrape started on its own and began harvesting mattress listings.
Nothing in the interface said it was running — it was found by reading a log line
that happened to scroll past. The cause turned out to be structural: the backend
re-scrapes **every enabled search every 45 minutes**, nothing had ever been
disabled, and the scheduler does not touch the flag the dashboard reads, so it
reports "idle" while it works.

That is one symptom of a pattern. Three read-only surveys (scraper, backend/data
model, frontend/product model) were run across the whole repository looking for
the same thing: logic that does not hold together, and design that only works
because the data is small. They returned ~120 findings.

**Two of those findings are actively costing something right now**, so they are
fixed first. Everything else becomes `PROPOSALS.md` — a complete catalogue, for
the owner to argue with. No other behaviour changes.

---

## Part 1 — Stop the bleeding (two changes, both verified by hand)

### 1.1 Disarm the scheduler

`backend/server.js:1687-1744` (`setupScheduledScraping`) arms a fixed-rate
`setInterval` that runs `runScraper()` (`:1746`). Verified:

- `scraper/main.py:368` selects targets with `SELECT id, url FROM searches WHERE
  enabled = 1` — **no age filter, no campaign filter, no limit**. There is no
  `last_scraped_at` column anywhere in the schema, so nothing *can* skip.
- `runScraper()` never reads or sets `activeScraperProcess`. The manual endpoints
  all guard on it (`:1432`, `:1495`, `:1548`); the timer does not — so runs
  overlap, and `/api/scrape/status` (`:1407`) reports idle throughout.
- The scheduled `spawn` has no `'error'` handler, unlike `:764` which documents
  why that is fatal.

Set `data/schedule_config.json` `interval` to `0` and make
`setupScheduledScraping` treat `0`/absent as "do not arm", logging that it is
off. Nothing scrapes again without someone pressing a button.

*This is a pause, not the fix.* The real fix — per-search recency, a run lock,
campaign-level archiving — is proposal S-1.

### 1.2 Stop re-harvesting listings that are already complete

`scraper/scraper.py:330-347` decides "needs harvesting" from the **shape of the
stored data**: `details = '{}' OR images = '[]'`. A listing that genuinely has no
detail table and no gallery parses to exactly those values, is stored with
`full_info_obtained = 1`, and is selected again forever.

Measured on the live database:

    44 listings marked harvested but shaped like unharvested
    → 44 HTTP requests + 88 s of sleeping every cycle, indefinitely,
      against a site that bans on volume

Change the predicate to key off `full_info_obtained` (the flag that already
exists and is already written) rather than the shape of the result.

**Do not batch these two with anything else.** One commit each, each stating the
measurement.

---

## Part 2 — `PROPOSALS.md`

A complete catalogue at the repository root. All ~120 findings, each entry the
same shape:

    ### ID — one-line title
    **Where:** file:line
    **What:** the defect, stated plainly
    **Evidence:** a measurement, a query result, or an AST/grep check — not an assertion
    **Bites:** today / at 10× / at 100×
    **Shape of the fix:** two or three lines. Not an implementation.
    **Cost:** honest, including "this is a schema migration"

Ordered **by damage, not by effort**, and grouped so a reader can stop after
group A and still have the important part.

### Group A — Broken now (things that do not work at all)

Lead with the six that are verified dead or destructive:

| ID | Where | Verified |
|---|---|---|
| A-1 | `scraper/scraper.py:466-512` | **The `update-all` loop body sits outside the loop.** AST-checked: the `for` at 466 ends at 487; lines 489+ are siblings. It fetches every listing (N requests × 2 s) and writes **one row** — the last. With no rows, `parsed` is unbound → `NameError`, swallowed at `:519`. |
| A-2 | `backend/server.js:254` | Score recalculation does `UPDATE listings SET niceness_score = ?, status = ?` with `'New'` **hardcoded** — wiping every `Contacted`/`Negotiating`. *Correction to the survey: it has not destroyed anything yet — `messages` is empty, so no status was ever set. Latent, not historical.* |
| A-3 | `backend/server.js:1199-1215` | `POST /api/searches/recalculate` writes `searches.item_json`. That column does not exist (`searches` = `id, campaign_id, name, url, enabled, knowledge_set_id`). Always 500. |
| A-4 | `backend/server.js:1282-1306` | `POST /api/listings/draft` reads `listing.profile_id` and `SELECT * FROM profiles`. Neither exists. Always 400. |
| A-5 | `App.tsx:963-965` | The filter labelled "AI Evaluated Only" tests `status === 'New'`. Every row is `'New'` — verified, one distinct value. It filters nothing. |
| A-6 | `scraper/main.py:379-384` | The no-searches fallback emits `"profile_id"`; the consumer at `:388` reads `"search_id"`. Listings land with `search_id = NULL` and are invisible to every downstream join. |

### Group B — Does not scale (the ceiling)

Anchored on the measurement: **zero indexes**, average listing row **5.8 KB**
(3.8 KB of it `extracted_facts` JSON), projecting to **291 MB at 50k rows** and
**2.9 GB at 500k**.

Cover: the missing indexes (`listings.search_id`, `listing_route_geo`'s wrong
leading PK column, `messages.listing_id`); `GET /api/listings` returning the
entire table with no LIMIT while the frontend re-fetches it from a 2-second
poll; `recalculateItemScores` doing N sequential un-transacted UPDATEs on the
single shared connection; `/api/logs` reading a 3.5 MB unrotated file
synchronously every 1.5 s; no virtualisation on either listing list; the O(n²)
marker clustering that re-projects on every pan; `price TEXT` making price
unsortable in SQL.

### Group C — Logic that contradicts itself

The scheduler's invisibility; `replan` committing four times with no atomicity;
`retire_searches` disabling searches the user created by hand; `requeue`
re-queuing only `TOO_FAR` while `annotate`'s docstring asserts the opposite;
dossier TTLs computed and never applied on the read path; a total model failure
persisted as a plausible mid score with `llm_processed = 1` and no retry;
`last_description_changed_at` stamped on every fetch rather than on every change,
which forces needless LLM re-evaluation; two Python processes sharing one
`data/temp_scraped.json` path.

Plus the React-layer contradictions: the 2-second poller's stale closure that can
navigate the user out of the campaign they are reading; the knowledge-set effect
that overwrites unsaved wizard input when a background scrape finishes; the
bulk-AI completion hardcoded to a 4-second `setTimeout`.

### Group D — Product model

The questions the code cannot currently answer: what a campaign *is* when it
holds both a corridor and ordinary searches (the backend documents the
contradiction in a comment; the UI shows only the corridor); a campaign owning
several corridors of which only the newest is reachable; **no way to pause,
rename, or list a search from the UI at all** — `enabled` appears in
`types.ts:25` and nowhere else; AI state as one boolean with no `failed`,
`queued` or `stale`; vehicle-specific fields hardcoded into a generic product.

And the one the numbers raise on their own: **10 of 1,263 listings have ever been
AI-scored**, and **1,070 of 1,263 (85 %) belong to a search nobody runs any
more**, with no retention concept. The wizard was built around the feature that
is not being used.

### Group E — Multi-user

Kept as one group because it is one decision, not nine: no `user_id` on any
table, globally-`UNIQUE` `searches.url` / `campaigns.name`, `users.role` read and
never compared, one shared Kleinanzeigen session, one global schedule file, one
global scraper lock, and no way to create a second user except by hand-editing
SQLite. Worth stating plainly that this is a schema-and-every-query rewrite, so
the decision is *whether*, not *how*.

### Group F — Configuration and hygiene

The long tail, as a table rather than prose: hardcoded OSRM demo server and its
1 req/s ceiling; `PAGES_TO_SCRAPE` global rather than per-search; three copies of
a `User-Agent` block, two pinned to Firefox 120; the scoring model's ~15 magic
constants with no versioning, so a score from last week is not comparable to
today's; `scripts/ui_shots.py` checkpointing and copying the **live** database
and spawning the real server (which arms the scheduler); `backend/_tmp_probe2.js`
tracked in git with auth stubbed out; `settings` the UI writes that nothing reads
(`delayBetweenPages`, `delayBetweenListings`).

---

## What this plan deliberately does not do

- **No fixes beyond the two in Part 1.** Every other finding is a proposal.
- **No estimates in hours.** Cost is stated as shape: "one index", "a schema
  migration", "rewrite every query".
- **No recommendation on Group E.** Multi-user is the owner's call.

---

## Verification

**Part 1:**

    # scheduler disarmed — no timer, and it says so
    sudo systemctl restart prismdeals-api && journalctl -u prismdeals-api -n 20
    # expect a line stating scheduled scraping is off; no "Running scheduled scrape"

    # nothing spawns on its own
    sleep 3000 && ps -ef | grep "main.py --mode" | grep -v grep   # expect nothing

    # the re-harvest set is empty under the new predicate
    ./venv/bin/python -c "..."   # expect 0, was 44

    buildlock ./venv/bin/pytest scraper/ -q     # 214 tests
    cd frontend && npm run build && npm run lint && npm test

**Part 2:** `PROPOSALS.md` exists, every entry carries a `file:line` and an
Evidence line, and spot-checking five entries at random finds the claim true in
the code. Any claim that cannot be verified is cut rather than softened — two
were already corrected this way (the status wipe had not happened; the survey's
"46 listings" is 44).
