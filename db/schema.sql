-- The database schema. All of it, in one place.
--
-- Before this file the schema lived in five: backend/db_setup.js created five
-- tables, backend/server.js created four more at startup, and
-- scraper/route_store.py, scraper/fact_sheets.py and scraper/dossiers.py each
-- created their own on first use. Nothing owned it, so whichever process ran
-- first decided what existed -- and on 2026-09-10 that produced a campaign
-- dashboard returning 500 on every fresh install, because Node queried a table
-- only Python knew how to create.
--
-- Two definitions of the same table are worse than one in the wrong place:
-- route_searches was declared in both Node and Python and had already begun to
-- drift. So: one file, plain SQL, no runtime.
--
-- Rules for changing it:
--   * Every statement is IF NOT EXISTS, so applying this to a live database is
--     a no-op. It runs on every connection, from both runtimes.
--   * Only ever add. SQLite cannot drop a column or add a foreign key to an
--     existing table, and these databases are live.
--   * A new column goes in ALTER TABLE ADD COLUMN below, not into the CREATE
--     TABLE above -- existing databases never re-run the CREATE.
--
-- Applied by backend/db/schema.js and scraper/db_schema.py, which read this
-- exact file rather than restating it.

PRAGMA foreign_keys = ON;


CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      hunt_type TEXT,
      profile_key TEXT,
      intent_json TEXT
    );

CREATE TABLE IF NOT EXISTS dossiers (
    identity_key    TEXT PRIMARY KEY,
    category_key    TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    payload_json    TEXT NOT NULL,
    researched_at   TEXT NOT NULL,
    approved        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fact_sheets (
    listing_id      TEXT NOT NULL,
    playbook_key    TEXT NOT NULL,
    playbook_version INTEGER NOT NULL,
    facts_json      TEXT NOT NULL,
    source_hash     TEXT,
    extracted_at    TEXT NOT NULL,
    PRIMARY KEY (listing_id, playbook_key)
);

CREATE TABLE IF NOT EXISTS knowledge_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      expert_knowledge TEXT,
      item_json TEXT,
      market_memo TEXT,
      good_reference_description TEXT,
      bad_reference_description TEXT,
      market_samples_json TEXT,
      source_search_url TEXT,
      sample_timestamp TEXT
    );

CREATE TABLE IF NOT EXISTS listing_route_geo (
    listing_id      TEXT NOT NULL,
    route_search_id INTEGER NOT NULL,
    lat             REAL,
    lon             REAL,
    offroute_km     REAL,
    detour_min      REAL,
    computed_at     TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'routed',
    PRIMARY KEY (listing_id, route_search_id)
);

CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      title TEXT,
      price TEXT,
      location TEXT,
      url TEXT,
      short_description TEXT,
      detailed_description TEXT,
      llm_processed INTEGER DEFAULT 0,
      llm_processed_time TEXT,
      full_info_obtained INTEGER DEFAULT 0,
      extracted_facts TEXT,
      niceness_score INTEGER,
      status TEXT DEFAULT 'New',
      search_id INTEGER REFERENCES searches(id) ON DELETE CASCADE,
      details TEXT,
      images TEXT,
      last_description_changed_at TEXT,
      last_ai_evaluated_at TEXT
    );

CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
      sender_name TEXT,
      sender_initials TEXT,
      is_outbound INTEGER,
      message_text TEXT,
      message_date TEXT
    );

CREATE TABLE IF NOT EXISTS route_search_circles (
    route_search_id INTEGER NOT NULL,
    search_id       INTEGER NOT NULL,
    location_id     TEXT,
    label           TEXT,
    radius_km       REAL,
    PRIMARY KEY (route_search_id, search_id)
);

CREATE TABLE IF NOT EXISTS route_searches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT,
    campaign_id     INTEGER,
    knowledge_set_id INTEGER,
    base_url        TEXT NOT NULL,
    origin          TEXT NOT NULL,
    destination     TEXT NOT NULL,
    radius_km       REAL NOT NULL,
    half_width_km   REAL NOT NULL,
    plan_json       TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT,
      url TEXT UNIQUE,
      enabled INTEGER DEFAULT 1,
      knowledge_set_id INTEGER REFERENCES knowledge_sets(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS search_families (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    campaign_id      INTEGER,
    knowledge_set_id INTEGER,
    base_url         TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_family_terms (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    term      TEXT NOT NULL,   -- was in die URL geht
    label     TEXT,            -- was der Mensch liest
    enabled   INTEGER NOT NULL DEFAULT 1,
    position  INTEGER NOT NULL DEFAULT 0
);

-- Welche searches-Zeilen zu (Familie, Begriff) gehören. Die Zeile kann geteilt
-- sein: dieselbe URL kann mehreren Familien gehören.
CREATE TABLE IF NOT EXISTS search_family_searches (
    family_id INTEGER NOT NULL,
    term_id   INTEGER NOT NULL,
    search_id INTEGER NOT NULL,
    PRIMARY KEY (family_id, term_id, search_id)
);

-- Punkt 1: die n:m-Beziehung, die listings.search_id nicht sein kann.
CREATE TABLE IF NOT EXISTS listing_search_hits (
    listing_id    TEXT NOT NULL,
    search_id     INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_search_hits_search
    ON listing_search_hits (search_id);

CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );

-- Columns added after the tables above already existed in the wild.
--
-- These must be ALTER, not part of the CREATE: a live database never re-runs a
-- CREATE TABLE IF NOT EXISTS, so a column added to the definition above would
-- appear on fresh installs and be missing everywhere else -- the exact split
-- this file exists to prevent.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS. The appliers on both sides treat
-- "duplicate column name" as success, which is what it means here.

ALTER TABLE listings ADD COLUMN last_description_changed_at TEXT;

ALTER TABLE listings ADD COLUMN last_ai_evaluated_at TEXT;

ALTER TABLE route_searches ADD COLUMN family_id INTEGER;

ALTER TABLE route_search_circles ADD COLUMN family_id INTEGER;

-- Phase 0: Canonical source and source ID tracking.
-- Quelle zuerst: listings.source mit Vorgabe 'kleinanzeigen' und source_id.
ALTER TABLE listings ADD COLUMN source TEXT DEFAULT 'kleinanzeigen';

ALTER TABLE listings ADD COLUMN source_id TEXT;

-- Phase 2a: Structured integer price in EUR.
ALTER TABLE listings ADD COLUMN price_eur INTEGER;

-- CREATE INDEX muss im Dateitext unter dem zugehörigen ALTER stehen, damit
-- Neuinstallationen wie bestehende Datenbanken von oben nach unten durchlaufen
-- können, ohne auf eine noch nicht existierende Spalte zu treffen.
CREATE INDEX IF NOT EXISTS idx_listings_price_eur ON listings (price_eur);

-- Phase 2b: Freshness tracking and delisting timestamp.
-- last_seen_at und delisted_at werden gemeinsam ausgeliefert.
-- Indizes auf last_seen_at/delisted_at bewusst noch nicht -- es gibt bis zur
-- Umstellung der Ernte keine Abfrage, die darauf filtert.
ALTER TABLE listings ADD COLUMN last_seen_at TEXT;

ALTER TABLE listings ADD COLUMN delisted_at TEXT;


-- Re-aiming a family left its old searches behind.
--
-- update_family's base_url path detaches every term and re-attaches it under
-- the new URL. The old searches rows survived with no owner at all, and
-- recompute_enabled deliberately never switches an unowned row -- it reads one
-- as hand-made. So every edit of a town, a radius or a price permanently added
-- N always-enabled searches to the scrape schedule, and the family's own
-- listings vanished from the results because listing_search_hits still pointed
-- at the detached rows.
--
-- The link is kept and marked instead of deleted: an inactive row is not an
-- owner for the enabled rule, so the scraper leaves it alone, and the history
-- it found is still reachable.
ALTER TABLE search_family_searches ADD COLUMN active INTEGER NOT NULL DEFAULT 1;

-- Keeping a find.
--
-- A hunt through a thousand laptops turns up three worth a second look, and
-- until now there was nowhere to put them: the list is sorted by something
-- else the moment you change a filter, and the only way back to a listing was
-- to find it again. A kept find is the buyer's own shortlist, not a property
-- of the listing, so it lives in its own table rather than a column.
CREATE TABLE IF NOT EXISTS kept_listings (
    listing_id TEXT NOT NULL,
    user_id    INTEGER NOT NULL,
    kept_at    TEXT NOT NULL,
    note       TEXT,
    PRIMARY KEY (listing_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kept_listings_user ON kept_listings(user_id, kept_at DESC);

-- The verdict on one listing for one buyer's requirements.
--
-- It was being computed and thrown away: the title stage settles most of a
-- search for nothing, inside the scoring pipeline, and the answer went nowhere.
-- So a list of fifty offers looked exactly like the same list on Kleinanzeigen,
-- with a 4x8 kit sitting between the matches.
--
-- Per (listing, search) rather than per listing: the same memory kit fits one
-- buyer's requirements and fails another's.
CREATE TABLE IF NOT EXISTS listing_fit (
    listing_id TEXT NOT NULL,
    search_id  INTEGER NOT NULL,
    verdict    TEXT NOT NULL,          -- fit | no | unclear
    reason     TEXT,
    facts_json TEXT,                   -- what was read, so a verdict can be argued with
    stage      TEXT NOT NULL,          -- title | description | photo
    judged_at  TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_fit_search ON listing_fit(search_id, verdict);

-- What a listing has cost over time.
--
-- The scraper only ever added: a listing it had seen before was skipped
-- outright, so a kit that fell from 130 EUR to 100 went unnoticed, and the
-- photograph a later harvest could have filled in never arrived either. A
-- price that moves is the most useful thing a watched search can tell you and
-- it was being thrown away on every run.
--
-- One row per observed change, not per observation: a price that holds for
-- three weeks is one row, not twenty-one.
-- No primary key on (listing_id, seen_at): the timestamp has second
-- resolution, so two changes inside one second collided and one was lost.
-- record_price already refuses to write a price that has not moved, which is
-- the guard that actually belongs here.
CREATE TABLE IF NOT EXISTS listing_price_history (
    listing_id TEXT NOT NULL,
    price_eur  INTEGER,
    seen_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_listing ON listing_price_history(listing_id, seen_at);

-- Tracking when a search was last successfully scraped.
--
-- A re-aimed family marks its old searches inactive (active = 0) and creates a
-- new search for the new parameters. Until the new search runs its first crawl,
-- the old search's listings and verdicts must stay visible in the campaign view
-- so saving never looks like "everything was deleted".
ALTER TABLE searches ADD COLUMN last_scraped_at TEXT;

-- P1: Hunt engine model columns on campaigns

-- Probe cache: raw HTML of fetched search pages, reusable within 6 hours.
--
-- Editing a hunt and re-probing costs nothing when URLs repeat.
CREATE TABLE IF NOT EXISTS probe_cache (
    url        TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    status     INTEGER NOT NULL,
    html_gz    BLOB NOT NULL
);

-- Search memory: terms probed per knowledge node, remembered for next time.
--
-- Written after every probe - read as extra seed terms next time for the same
-- node (node = profile key until P7 gives real nodes).
CREATE TABLE IF NOT EXISTS node_terms (
    node_key      TEXT NOT NULL,
    term          TEXT NOT NULL,
    category_code TEXT,
    total         INTEGER NOT NULL,
    likely_share  REAL NOT NULL,
    probed_at     TEXT NOT NULL,
    PRIMARY KEY (node_key, term)
);

CREATE INDEX IF NOT EXISTS idx_node_terms_key ON node_terms(node_key, probed_at DESC);

-- Hunt engine campaign intent and profile tracking
ALTER TABLE campaigns ADD COLUMN hunt_type TEXT;
ALTER TABLE campaigns ADD COLUMN profile_key TEXT;
ALTER TABLE campaigns ADD COLUMN intent_json TEXT;

-- Model proposals for class hunts (package P5).
--
-- Caches candidate models proposed by the small model per class node for 30 days.
-- Also tracks probe counts and title hits so the hallucination guard can drop
-- models never seen in marketplace titles after two probes.
CREATE TABLE IF NOT EXISTS class_models (
    node_key    TEXT NOT NULL,
    model       TEXT NOT NULL,
    years       TEXT,
    proposed_at TEXT NOT NULL,
    probe_count INTEGER NOT NULL DEFAULT 0,
    title_hits  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (node_key, model)
);

CREATE INDEX IF NOT EXISTS idx_class_models_node ON class_models(node_key);

-- P6: comparative judging runs.
--
-- One row per complete comparison session. A session is 3 shuffled runs whose
-- ranks are averaged, and the row records the merged result.  The requirements_hash
-- and knowledge_hash let the code decide whether a cached run still applies
-- after the buyer edits requirements or new research arrives.
CREATE TABLE IF NOT EXISTS judge_runs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id      INTEGER NOT NULL,
    requirements_hash TEXT,
    knowledge_hash   TEXT,
    created_at       TEXT NOT NULL,
    model            TEXT,
    tokens_in        INTEGER,
    tokens_out       INTEGER,
    cost_eur         REAL,
    duration_s       REAL,
    candidate_count  INTEGER,
    kendall_tau      REAL,
    status           TEXT NOT NULL DEFAULT 'complete'
);

CREATE INDEX IF NOT EXISTS idx_judge_runs_campaign ON judge_runs(campaign_id, created_at DESC);

-- P6: per-listing rank from a comparative run.
--
-- Each listing that entered the candidate set gets one row per run. The rank is
-- the mean across the 3 shuffled sub-runs, and a spread > 5 marks the listing
-- uncertain.  musts_json, facts_json and questions_json carry the structured
-- output the prompt returned, validated (quotes checked) before storage.
CREATE TABLE IF NOT EXISTS listing_ranks (
    run_id       INTEGER NOT NULL REFERENCES judge_runs(id) ON DELETE CASCADE,
    listing_id   TEXT NOT NULL,
    rank         INTEGER NOT NULL,
    rank_of      INTEGER NOT NULL,
    reason       TEXT,
    musts_json   TEXT,
    facts_json   TEXT,
    questions_json TEXT,
    same_as      TEXT,
    uncertain    INTEGER NOT NULL DEFAULT 0,
    spread       REAL,
    PRIMARY KEY (run_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_ranks_listing ON listing_ranks(listing_id);


