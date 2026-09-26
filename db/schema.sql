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
      knowledge_set_id INTEGER
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

-- The card's postal code, apart from the printed place: it is what places a
-- listing on the map, and the place text stays what the seller wrote.
ALTER TABLE listings ADD COLUMN postal_code TEXT;

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

-- Hunt engine campaign intent and profile tracking
ALTER TABLE campaigns ADD COLUMN hunt_type TEXT;
ALTER TABLE campaigns ADD COLUMN profile_key TEXT;
ALTER TABLE campaigns ADD COLUMN intent_json TEXT;

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

-- What each must meant when a run judged it, as a JSON map id to buyer_wants.
-- A judged state is applied only while the buyer still wants the same thing.
ALTER TABLE judge_runs ADD COLUMN requirements_json TEXT;

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

-- ===========================================================================
-- The product graph (docs/plan-product-graph.md). One shared world of
-- products: every hunt reads it, every listing is resolved into it once.
-- ===========================================================================

-- A product at any depth: category, class, brand, family, model, generation,
-- config. Referenced by id everywhere, `key` is the readable path, derived.
CREATE TABLE IF NOT EXISTS nodes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id     INTEGER REFERENCES nodes(id),
    kind          TEXT NOT NULL,
    key           TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    category_code TEXT,
    years_from    INTEGER,
    years_to      INTEGER,
    status        TEXT NOT NULL DEFAULT 'proposed',
    merged_into   INTEGER REFERENCES nodes(id),
    evidence_json TEXT NOT NULL DEFAULT '{}',
    source        TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    confirmed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);

-- How sellers and searches name a node, folded and glued ("cbr1000rr").
CREATE TABLE IF NOT EXISTS node_aliases (
    node_id      INTEGER NOT NULL REFERENCES nodes(id),
    alias        TEXT NOT NULL,
    kind         TEXT NOT NULL,
    hits         INTEGER NOT NULL DEFAULT 0,
    total        INTEGER,
    likely_share REAL,
    probed_at    TEXT,
    source       TEXT NOT NULL,
    PRIMARY KEY (node_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_node_aliases_alias ON node_aliases(alias);

-- Which facts matter for a node, inherited downward (a child overrides).
CREATE TABLE IF NOT EXISTS node_attributes (
    node_id      INTEGER NOT NULL REFERENCES nodes(id),
    attr_id      TEXT NOT NULL,
    label        TEXT NOT NULL,
    type         TEXT NOT NULL,
    unit         TEXT,
    options_json TEXT,
    readers_json TEXT NOT NULL,
    site_filter  TEXT,
    absent_json  TEXT,
    source       TEXT NOT NULL,
    PRIMARY KEY (node_id, attr_id)
);

-- The node a listing is, decided once.
CREATE TABLE IF NOT EXISTS listing_resolution (
    listing_id  TEXT PRIMARY KEY,
    node_id     INTEGER NOT NULL REFERENCES nodes(id),
    confidence  REAL NOT NULL,
    method      TEXT NOT NULL,
    resolved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listing_resolution_node ON listing_resolution(node_id);

-- Listings the model confirmed as the product itself, not an accessory or a
-- spare part of it: asked once per listing and hunted node.
CREATE TABLE IF NOT EXISTS listing_kind_checks (
    listing_id TEXT NOT NULL,
    node_id    INTEGER NOT NULL REFERENCES nodes(id),
    checked_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, node_id)
);

-- What a listing states, read once per attribute.
CREATE TABLE IF NOT EXISTS listing_facts (
    listing_id   TEXT NOT NULL,
    attr_id      TEXT NOT NULL,
    value_json   TEXT NOT NULL,
    source       TEXT NOT NULL,
    quote        TEXT,
    text_hash    TEXT NOT NULL,
    extracted_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, attr_id)
);

-- Hunts as queries (plan §2.3). A hunt is its targets -- graph nodes at any
-- depth -- plus conditions on their facts, plus the frame (price, place,
-- radius, route). Conditions with a node_id apply to that target's subtree
-- only ("under 5000 km for the SC59"), those without apply to every target.
ALTER TABLE campaigns ADD COLUMN frame_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS hunt_targets (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    node_id     INTEGER NOT NULL REFERENCES nodes(id),
    position    INTEGER NOT NULL,
    typed       TEXT NOT NULL,
    name        TEXT NOT NULL,
    PRIMARY KEY (campaign_id, node_id)
);

CREATE TABLE IF NOT EXISTS hunt_conditions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    node_id     INTEGER REFERENCES nodes(id),
    attr_id     TEXT NOT NULL,
    op          TEXT NOT NULL,
    value_json  TEXT,
    importance  TEXT NOT NULL,
    label       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hunt_conditions_campaign ON hunt_conditions(campaign_id);

-- Knowledge per node (plan §8): true at its node and everything below it.
CREATE TABLE IF NOT EXISTS node_knowledge (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id      INTEGER NOT NULL REFERENCES nodes(id),
    kind         TEXT NOT NULL,
    statement    TEXT NOT NULL,
    check_path   TEXT NOT NULL,
    weight       TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    expires_at   TEXT,
    approved     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_node_knowledge_node ON node_knowledge(node_id, approved);

-- A research brief per set of targets and what was known when it was written.
CREATE TABLE IF NOT EXISTS node_briefs (
    key          TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

-- Replaced by the product graph: verdicts are computed (backend/db/verdict.js),
-- products are nodes, facts are listing_facts, knowledge is node_knowledge.
DROP TABLE IF EXISTS listing_fit;
DROP TABLE IF EXISTS listing_nodes;
DROP TABLE IF EXISTS fact_sheets;
DROP TABLE IF EXISTS dossiers;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS model_generations;
DROP TABLE IF EXISTS class_models;
DROP TABLE IF EXISTS node_terms;
DROP TABLE IF EXISTS probe_cache;
-- knowledge_sets stays in databases created before the graph: their searches
-- table names it in a foreign key, and SQLite checks that on every write.

-- Signals (docs/plan-signals.md). A wish weighs -3..+3: positive a plus, negative
-- a minus (present costs), 0 shown only. A target weighs 0..3: preference among
-- the hunt's targets.
ALTER TABLE hunt_conditions ADD COLUMN weight INTEGER NOT NULL DEFAULT 2;
-- A must is a gate, not a weight: rows from before the column say so too.
UPDATE hunt_conditions SET weight = 0 WHERE importance = 'must' AND weight != 0;
ALTER TABLE hunt_targets ADD COLUMN weight INTEGER NOT NULL DEFAULT 0;

-- What varies between the offers of a node and matters to a buyer, proposed once
-- from the offers found and shared by every hunt below that node.
CREATE TABLE IF NOT EXISTS node_signals (
    node_id        INTEGER NOT NULL REFERENCES nodes(id),
    attr_id        TEXT NOT NULL,
    polarity       TEXT NOT NULL,
    default_weight INTEGER NOT NULL,
    found          INTEGER NOT NULL,
    total          INTEGER NOT NULL,
    proposed_at    TEXT NOT NULL,
    PRIMARY KEY (node_id, attr_id)
);

-- When a node's signals were last asked for and over how many offers: also
-- when nothing came of it, so an empty answer is not asked again every crawl.
CREATE TABLE IF NOT EXISTS node_signal_runs (
    node_id     INTEGER PRIMARY KEY REFERENCES nodes(id),
    proposed_at TEXT NOT NULL,
    total       INTEGER NOT NULL
);

-- The buyer's Kleinanzeigen conversations, as the last poll saw them
-- (backend/ka_messages.js). ad_id is a listing id.
CREATE TABLE IF NOT EXISTS ka_conversations (
    id           TEXT PRIMARY KEY,
    ad_id        TEXT NOT NULL,
    role         TEXT NOT NULL,
    ad_title     TEXT,
    other_name   TEXT,
    last_text    TEXT,
    last_inbound INTEGER NOT NULL DEFAULT 0,
    last_at      TEXT,
    unread       INTEGER NOT NULL DEFAULT 0,
    seen_at      TEXT, -- last_at when the buyer last opened it here
    polled_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ka_conversations_ad ON ka_conversations(ad_id);
