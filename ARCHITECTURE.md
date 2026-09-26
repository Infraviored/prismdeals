# prismdeals — architecture

Used-goods hunting on Kleinanzeigen: say what you want, get the offers that fit, ranked, with
what to check before you drive there. The core is one shared **product graph**; a hunt is a
query on it. Full design: `docs/plan-product-graph.md`.

## The core in five lines
- **Graph** — nodes from the Kleinanzeigen taxonomy down to brand, model, generation (with
  years), class ("Ventilator"). Aliases name them; attributes (with readers) say which facts
  matter and how to read them. Grows when a hunt names something new (one model call).
- **Listings** — crawled raw, then resolved into the graph once (`listing_resolution`) and their
  facts read once (`listing_facts`): detail page, text readers, `is_request`.
- **Hunts** — targets (nodes at any depth) + conditions (on facts, per target or for all) +
  frame (price, place, radius, corridor). Stored in `hunt_targets`, `hunt_conditions`,
  `campaigns.frame_json`.
- **Verdict** — computed on every read (`backend/db/verdict.js`): another model → no, above the
  target → unclear, generation years, must conditions. Never stored, never re-judged.
- **Market and knowledge** — per node, shared by every hunt: a price model on the facts that
  move the price (`backend/db/market.js`), and researched knowledge filed at the deepest node it
  is true for (`node_knowledge`).

## Where things live
- `scraper/graph/` — the only writer of graph, resolution, facts, hunts, knowledge.
  Entry: `python -m graph.cli …` (JSON out; exit 2 = no model).
- `scraper/main.py` — crawl (searches ordered by `graph/crawlplan.py`), harvest details,
  then resolve + read new listings and refine each hunt.
- `scraper/family_store.py`, `family_route.py`, `route_*.py` — the crawl units behind a hunt:
  one search per crawled node × place/corridor circle.
- `backend/` — Express API. `hunt_listings.js` is the one read path; `hunts_api.js`,
  `knowledge_api.js`, `compare_api.js`, `kept.js` sit on it.
- `frontend/` — React SPA: dashboard, setup (text → draft → editor), results, edit
  ("Mit KI ändern"), requirements, knowledge.
- `db/schema.sql` — the one schema, applied by both runtimes.

## Rules
- No fallbacks: no model answer is an error ("KI nicht erreichbar"), never a template.
- Nothing category-specific in code: every category goes through the same graph, readers and
  verdict (`docs/plan-product-graph.md` §9).
- Raw crawl data is never deleted with a hunt: listings, hits, price history stay.
