# Plan: the product graph — the core

*2026-09-26. Supersedes the per-hunt structures of `plan-hunt-engine.md` (P1–P9). The
product core in `product-core.md` stays the "why"; this is the "what and how".*

## 0. The idea in one paragraph

Every hunt today builds its own small world — its own terms, verdicts per search, its own
knowledge node, generations, market median — and nothing it learns helps the next hunt. The
core becomes **one shared product graph** that grows with every hunt and every listing:
products as nodes, how sellers name them, which facts matter, what goes wrong with them, what
they cost. A **listing is resolved into the graph once**, its facts read once. A **hunt is a
thin query**: target nodes, conditions, a frame (price, place, route) and weights. Verdicts
are computed, never stored per search. Knowledge, market and crawl are shared and
demand-driven. The marginal hunt costs nearly nothing; the platform gets better with each user.

## 1. Principles (checked against every category — see §9)

- **One truth per thing.** A product exists once (node id), a listing's facts exist once, a
  hunt's intent exists once. Everything else is derived and may be recomputed; nothing is a copy
  that can go stale (the SC59 brief bug).
- **Nothing hardcoded per category.** Categories come from the Kleinanzeigen taxonomy (161
  categories with their site filters). Attributes, generations, aliases and knowledge are data
  on nodes, created by a small model once and confirmed by the market. The five playbooks become
  seed data, not code paths.
- **Evidence before existence.** A node the model proposes is `proposed` until listings on the
  market name it (title hits). Hallucinated models never become real.
- **Cheap first, model only for the unknown, and every model answer is learned.** Alias match
  before model; each model resolution adds an alias, so the next one is free.
- **Compute, don't store, what depends on the hunt.** Facts belong to the listing; the verdict
  is `f(hunt conditions, listing facts, listing node)`.
- **Demand decides spend.** Research, model extraction and crawl go where many hunts want it
  and value is high.
- **The scarce resource is the crawl (≤ 1 req/s).** Shared across all hunts, planned.
- **No fallbacks, no migration.** The old per-hunt structures are removed, not bridged; no
  second code path "for old data". Raw crawl data stays (`listings`, `listing_search_hits`,
  `listing_price_history`, `listing_route_geo`, `kept_listings`) — it is observation, not
  structure. Hunts are created anew through the new setup (§10, G7). No model answer means
  "KI nicht erreichbar", never a template that looks like one.

## 2. Data model

### 2.1 Graph
- `nodes`
  - `id` INTEGER PK — stable; everything references ids, never paths.
  - `parent_id`, `kind` (`category|class|brand|family|model|generation|config`).
  - `key` TEXT UNIQUE — canonical slug path (`motorrad/honda/cbr-1000-rr/sc59`), derived
    from ancestors, regenerable; for humans, logs and URLs, not for joins.
  - `name` (display: "Honda CBR 1000 RR SC59"), `category_code` (Kleinanzeigen `c305`,
    inherited), `years_from`, `years_to` (generations, models).
  - `status` (`proposed|confirmed|retired`), `merged_into` (dedup keeps old ids working).
  - `evidence_json` (title hits, listing count, first/last seen), `source`
    (`taxonomy|seed|model|probe|user`), `created_at`, `confirmed_at`.
- `node_aliases` — how sellers and searches name a node.
  - `node_id`, `alias` (folded: lowercase, umlauts spelled, punctuation → space),
    `kind` (`name|code|term`), `hits`, `source`; PK (`node_id`, `alias`), index on `alias`.
  - `term` aliases carry probe stats (`total`, `likely_share`, `probed_at`) — replaces `node_terms`.
- `node_attributes` — which facts matter; inherited downward, a child may override.
  - `node_id`, `attr_id`, `label`, `type` (`number|boolean|enum|text`), `unit`, `options_json`.
  - `reader` — how the fact is read, generic:
    `details:<Kilometerstand>` (detail-page attribute), `number` (value with unit near label
    words), `keywords:[…]`, `pattern:<playbook>/<field>` (the seeded regexes stay in code,
    referenced by name), `model` (only an extraction call can read it).
  - `absent_means_json`, `site_filter` (the taxonomy filter key, e.g. `motorraeder_roller.km_i`
    — so a condition can also narrow the crawl URL), `source`.
- `node_knowledge` — the current `claims`, re-keyed: `node_id` instead of `node_key`;
  kind, statement, check_path, weight, sources, confidence, `approved`, expires_at.
- `node_market` — per node: `n`, `median`, `p25`, `p75`, `model_json` (price model, §6),
  `updated_at`.

### 2.2 Listings
- `listing_resolution` — `listing_id` PK, `node_id`, `confidence`, `method`
  (`alias|search|model|user`), `resolved_at`. Replaces `listing_nodes`.
- `listing_facts` — `listing_id`, `attr_id`, `value_json`, `source`
  (`details|title|description|model|photo|user`), `quote`, `extracted_at`,
  PK (`listing_id`, `attr_id`). Replaces `fact_sheets` and `listing_fit.facts_json`.
- Kept: `listings`, `listing_search_hits`, `listing_price_history`, `kept_listings`,
  `listing_route_geo`.

### 2.3 Hunts
- `campaigns` gains `frame_json`: `{max_price, place:{postal_code, location_id, slug}, radius_km,
  route_id, weights}`. `intent_json` stays as what was typed, read by nobody for decisions.
- `hunt_targets` — `campaign_id`, `node_id`, `position`. Any depth: a generation (SC59), a model
  list, a class (Ventilator), a config (RAM 2×16 DDR4-3200).
- `hunt_conditions` — `id`, `campaign_id`, `node_id` (NULL = all targets; else only that
  target's subtree — the scoped "under 5000 km for the CBR"), `attr_id`, `op`
  (`min|max|eq|in|not_in|present|absent`), `value_json`, `importance` (`must|wish`), `label`.
- The crawl plan is derived: `search_families`/`searches` stay as the internal crawl units,
  generated from targets × frame (§7). The user never edits search terms again; the edit screen
  and "Mit KI ändern" edit targets, conditions and frame.

### 2.4 Removed (in the step that replaces them, §10)
Tables: `listing_fit`, `listing_nodes`, `model_generations`, `class_models`, `node_terms`,
`dossiers`, `fact_sheets`, `knowledge_sets`, `claims` (→ `node_knowledge`), `judge_runs` /
`listing_ranks` node columns, `search_families` / `search_family_terms` /
`search_family_searches` as user-facing hunt structure (the crawl plan owns its own tables).
Code: requirements hash (P9) + `fitJoinOn`, P8/P9/P1 backfills, `identity.py`, `dossiers.py`,
`fact_sheets.py`, `hunt_identity.py` model logic, `generation.py` regex codes, playbooks as code
paths, `reference_price.js` per-search medians, `market_node.js`, `requirements_api.js`,
`family_store.py` user paths, the legacy `agent_worker` scoring.

## 3. The graph: how it grows

- **Root layer** from the taxonomy: 161 category nodes with `category_code` and their site
  filters as attributes (`site_filter`). Profiles (weights, research value, headings) attach to
  category nodes as data.
- **Seeds:** the five playbooks' fields become `node_attributes` at their category node
  (`reader: pattern:…`), so nothing that works today is lost.
- **Placing a target (setup, AI edit):** "Honda CBR 1000 RR SC59" → folded aliases matched
  first; otherwise one small-model call returns the path under the category
  (`brand / model / generation`, years, aliases, 3–8 attributes that matter for this kind of
  product). Created `proposed`.
- **Confirming:** a probe or crawl finds listings whose titles hit the node's aliases →
  `confirmed`, `evidence_json` updated. Proposed nodes without hits after N probes → `retired`.
- **Dedup:** two nodes whose alias sets overlap strongly under the same parent are merged
  (`merged_into`), ids keep resolving.
- **Generation (generic):** a generation is a child node with years — RN19, SC59, "Gen 3",
  "Mk2", "E90", "(2019–2021)". Detected by the placing call, not by a regex for codes. A
  spec like "DDR4" is a node level of the config tree (`ram/ddr4/…`), not a generation.

## 4. Listings: resolved and read once

- **Resolve** on crawl (new listings) and on graph change (affected aliases only):
  1. Search prior: the listing was found by a crawl unit derived from target T → candidates are
     T's subtree and its siblings.
  2. Alias match on the folded title (longest, deepest match wins; category code must agree).
  3. Unknown and inside an active hunt's subtree → batched model call ("which of these nodes,
     or a new one under X?"); the answer adds an alias.
  4. Request titles ("Suche …") are resolved as `is_request` (a fact on the root), not a product.
- **Read facts** for the node's effective attributes (own + inherited), cheapest reader first:
  detail-page attributes → patterns/number/keywords in title and description → model
  extraction **only for attributes a live hunt condition needs and nothing else could read**.
  Re-read when the listing's text hash or the node's attribute schema changes.
- Negation, German numbers, compounds: the readers from `wishes.py` / `probe_sieve.py` /
  `citations.py` become the generic readers.

## 5. Hunts as queries; the verdict computed

- **Verdict** (`backend/db/verdict.js`, the only implementation):
  - listing node outside every target subtree → `no` ("anderes Modell: Yamaha WR 125") when it
    resolved to a sibling, `unclear` ("Modell nicht erkannt") when unresolved;
  - generation targets add an implicit condition: first registration within the node's years
    (±1) — the SC59/RN19 rule, now for every generation of every category;
  - each condition applicable to the listing's target: must violated → `no`, must unread →
    `unclear`, wish → score only;
  - `is_request` → `no`.
- **Score:** unchanged formula (gate × weighted axes), fed by the same computed states; value
  axis from the node price model (§6).
- **Tabs, counts, filters, order** all use the computed verdict (the listings endpoint already
  reads the whole hunt; overview uses the same function).
- **Setup** saves targets + conditions + frame; the intent parser proposes them; musts/prefs
  map to `hunt_conditions` against the target's attribute schema (new attributes are added to
  the target node when the schema lacks one — "Innenraum" becomes a keywords attribute of the
  Ventilator class node, for every later Ventilator hunt too).
- **Edit / "Mit KI ändern"** operate on the hunt document `{targets:[{node, conditions}],
  conditions, frame}`; placing a changed target goes through §3. The change list stays
  computed from the diff.

## 6. Market per node

*Built as a read-time computation (`backend/db/market.js`), not a stored table: the hunts are
few and the fit is milliseconds. A stored `node_market` comes when reads get expensive.*

- Every listing ever seen is a price observation for its node with its facts.
- Per node with enough observations (≥ 20 in the node, else walk up): a robust log-price model
  on the numeric attributes present for most listings (vehicles: age, km; laptops: RAM, age;
  RAM: none → plain median), fitted with Theil–Sen / median regression, refreshed after crawls.
- **Deal** = asking price clearly below the price predicted for *this* listing's facts
  (residual), not below the median of whatever is online now. Shown as "≈ 1.200 € unter dem
  üblichen Preis für eine SC59 mit 21.000 km".
- Later, same table: time to sell (delisting), seasonality.

## 7. Crawl as one plan

- Demand per crawl unit (term × area): active hunts whose targets map to it × their value ×
  staleness. Terms per target come from the node's best `term` aliases (probe stats).
- The scheduler crawls in demand order within the 1 req/s budget; one unit serves every hunt
  that wants it (URL uniqueness already shares the row).
- A condition with a `site_filter` (km ≤ 30000) narrows the crawl URL; conditions without one
  are judged after.
- Today: one user — the plan mostly reorders. The shape is what matters for many users.

## 8. Knowledge per node, by demand

- `node_knowledge` inherits leaf → root (as `claims` does by path today, now by ids).
- **Research value** per node from its category profile and its price level; RAM, mattresses,
  wardrobes rarely warrant research, motorcycles do.
- **Brief** per hunt = its targets grouped by lowest common ancestor (12 printers → per series),
  one section per group, with the node's generation years and what is already known. Cached by a
  hash of (targets, conditions, knowledge ids); regenerated only on change. No template text: no
  model answer → "KI nicht erreichbar".
- **Classify:** the pasted answer is split into claims (citations resolved first), and each claim
  is attached to the deepest node it names (SC57 facts to SC57, not to SC59).
- Claims pasted by one user are shared after approval; later, confirmation across users raises
  confidence.

## 9. Generalization check

| Hunt | Targets | Conditions | Knowledge | Market | Crawl |
|---|---|---|---|---|---|
| R1 RN19 / CBR SC59 (shortlist) | 2 generation nodes | km < 5000 on SC59 | per generation, inherits model/brand | price model age + km | yamaha-r1, honda-cbr-1000-rr |
| Corsair 2×16 DDR4-3200 CL16 (exact) | config node | CL ≤ 16 | none (commodity) | median | corsair-vengeance, 32gb-ddr4 |
| ThinkPad T14 Gen 3 | generation node "Gen 3" | 16 GB, no defect | series T14 | age + RAM | thinkpad-t14 |
| 12 printers (shortlist) | 12 model nodes, 3 series | duplex | per series | per model / series | 12 terms |
| Ventilator (class) | class node | Innenraum (wish), known brand (brand tier wish) | brand tiers | class band | ventilator, tischventilator |
| Kleiderschrank / Matratze (fit/taste) | class node | width ≤ 120 cm, 140×200 | rarely | by size | kleiderschrank |
| Opportunity ("günstig was Gutes") | category node | price below model | — | the residual *is* the hunt | category-wide |

The same structure carries every row; only target depth and inherited attributes differ.

## 10. Build order — one branch, each step replaces and deletes what it supersedes

1. **G1 Graph core.** Tables §2.1; `scraper/graph.py` (place, alias, inherit, merge, confirm)
   and `backend/db/graph.js` (read); taxonomy root layer; the five playbooks' fields as seed
   attributes. Deletes: `model_generations`, `class_models`, `node_terms`, `dossiers`.
2. **G2 Resolution + facts.** `listing_resolution`, `listing_facts`; resolver and readers, run on
   every crawl. Deletes: `listing_nodes` + P8, `fact_sheets`, `identity.py`, the per-search
   pipeline.
3. **G3 Hunts as queries.** `hunt_targets`, `hunt_conditions`, `frame_json`; `verdict.js`;
   listings/overview/score/compare on computed verdicts; setup and edit/AI on targets.
   Deletes: `listing_fit` + P9 + `fitJoinOn`, `knowledge_sets`, `requirements_api.js`,
   `hunt_identity.py`, families as user structure.
4. **G4 Knowledge per node.** `node_knowledge`; brief per target group, cached; classify to the
   deepest node. Deletes: `claims`, node guessing in `knowledge_cli.py`, the template brief.
5. **G5 Market per node.** `node_market` with the price model. Deletes: `reference_price.js`
   medians, `market_node.js`.
6. **G6 Crawl plan.** demand + scheduler + site filters from conditions; crawl units derived
   from targets × frame.
7. **G7 Hunts anew.** The live hunts recreated by hand through the new setup: R1 RN19 / CBR SC59
   (km < 5000 for the SC59), Ventilator (Innenraum, known brand), Corsair 2×16 DDR4-3200 CL16,
   the printers, Laptops, Matratze, Kleiderschrank, Motorrad — each played end to end on a copy
   of the live database before it goes live.

## 11. Risks

- **A wrong node hurts every user.** Evidence gate, confidence on resolutions, user corrections
  flow back, merges keep ids.
- **Model cost.** Bounded by demand: placing is once per new product, resolution learns aliases,
  extraction only for attributes a condition needs.
- **Live hunts are gone until G7.** Accepted: they are recreated by hand, and the whole branch
  is played on a copy of the live database before it replaces the running version.
- **Scope.** G1–G3 are the core and ship together; G4–G6 build on it within the same branch.

## 12. Modules and interfaces (as built)

### Python — `scraper/graph/` (the only writer of graph, resolution, facts, knowledge)
- `store.py` — nodes, aliases, attributes (options as `{value, label}`), `effective_attributes`,
  `fold` (the one normaliser; `backend/db/verdict.js` folds the same way), merge, confirm.
- `taxonomy.py` — `seed`: 161 category nodes, their site filters as attributes. Seeded
  automatically by `cli.py` on an empty graph.
- `place.py` — `place(conn, text, category_code)`: alias or described name first, else one
  model call (path, all generations with years, 0–6 attributes with readers); `describe`.
- `resolve.py` / `readers.py` / `facts.py` — `facts.process(conn, listing_id, prior)`: node,
  facts, `is_request`; a generation found by year; a model's placement never undone by names.
- `hunts.py` — `save` (targets placed, conditions mapped onto attributes — a missing one is
  added to the node —, crawl family derived: one term per crawled node, site filters from musts
  for all targets), `refine` (hunt listings re-read with targets as prior, those above the
  searched node asked once in batches), `delete` (listings stay; searches detached).
- `draft.py` — text → hunt document (two calls: category with its "Art" options, then targets,
  conditions, price).
- `knowledge.py` — `for_node`, `brief` (cached per targets × known ids), `classify` (each
  statement to the deepest node it names, dead sources dropped), approve/reject.
- `crawlplan.py` — `plan`: searches owned by hunts, ordered by hunts × hours stale.
- `cli.py` — `seed|place|describe|process|hunt-save|refine|hunt-delete|draft|brief|classify|
  approve|reject`, JSON on stdout, exit 2 = no model (503), exit 1 = refused input (400).
- `main.py` — after every crawl: `process` new listings, `refine` every hunt.

### Backend — Node
- `db/graph.js` — `loadTree`, `describe`, `effectiveAttributes`, `loadHunt`, `loadReadings`.
- `db/verdict.js` — `prepare(tree, hunt)`, `verdict(prepared, reading)` →
  `{verdict, reason, states, target_id}`; `stateOf`, `conditionText`.
- `db/market.js` — the node market on read: median, plus a Huber-fitted log-price model on at
  most two facts (coverage ≥ 60 %, |ρ| ≥ 0.3, duplicates dropped), borrowed from the nearest
  product node above with ≥ 20 offers; a deal is well under *this* offer's expected price.
- `db/score.js` — gate from computed states, five axes by profile.
- `hunt_listings.js` — `huntScope`, `huntListings`: the one read path for list, overview,
  hunt list, kept listings, single listing and comparison candidates.
- `hunts_api.js` — `GET/POST /api/hunts`, `GET/PUT/DELETE /api/hunts/:id`,
  `/api/hunts/:id/listings|overview`, `POST /api/hunts/draft|edit`, `GET /api/listings/:id`.
- `knowledge_api.js` — `/api/hunts/:id/brief|knowledge`, `/api/knowledge/:id/approve|reject`,
  `/api/listings/:id/knowledge`.
- `compare_api.js` — candidates = not-ruled-out listings by score (≤ 90) + conditions +
  knowledge, sent to `compare_cli.py` on stdin.

### Frontend
- Setup saves through `POST /api/hunts`; edit screen and "Mit KI ändern" through
  `GET/PUT /api/hunts/:id` and `/api/hunts/edit`; the requirements sheet edits conditions;
  results through `/api/hunts/:id/listings|overview`. Search terms are not shown as editable —
  "Wie gesucht wird" lists the derived crawl units read-only.
