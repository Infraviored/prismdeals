# KleinanzeigenScraper: Full System Architecture

KleinanzeigenScraper is a classifieds intelligence system for German marketplace listings, built to scrape, structure, evaluate, and operationalize used motorcycle ads with a strong focus on evidence quality, risk detection, and explainable scoring. The project’s core idea is not “ask an LLM whether a listing is good,” but to split the problem into a pipeline where scraping, calibration, evidence extraction, scoring, and outreach are each handled by the right layer.

The system has evolved into a dual-stage AI architecture: one model or expert process designs the evaluation profile, and another low-cost worker model applies that profile to individual listings at scale. This architecture exists because generic holistic LLM judgments were too forgiving, too opaque, and too hard to debug for a market where omission, vague wording, and hidden risk matter as much as the explicit claims.

## Product Goal

The product is optimized for one specific class of problem: used high-performance motorcycle classifieds are noisy, inconsistent, and often written to maximize attractiveness while minimizing liability. For the current target segment, especially older Honda CBR1000RR / Fireblade SC57/SC59 listings, the system must identify explicit positives, explicit negatives, and high-value unknowns such as maintenance proof, crash history, original parts, ownership history, and structural integrity.

That makes the project closer to a **forensic market filter** than a shopping assistant. It is designed to tell the user what the listing actually supports, what it does not support, and where the seller may be leaving important information out.

## High-Level Design

The architecture is intentionally layered. Scraping and data acquisition are handled separately from AI interpretation, and AI interpretation is separated again from scoring and presentation. That split keeps the crawler fast, the worker cheap, and the scoring logic deterministic enough to debug when a listing feels “too good” or “too vague.”

The main execution path is: discover listings, harvest details, load the correct knowledge profile, run a structured evaluation prompt through a worker model, sanitize the response, validate it, compute a score in Python, and persist both the structured facts and the final rating. The user then sees the result through the web interface rather than through raw prompts or raw model output.

## Repository Structure

The repository is organized around the lifecycle of a listing rather than around framework boundaries. `scraper/` contains the Python worker stack, `backend/` contains the Node.js API and orchestration layer, `frontend/` contains the React UI, `prompts/` contains version-controlled prompt templates, `data/` stores the SQLite database and logs, and `scripts/` contains maintenance utilities.

This layout is deliberate because the system needs to preserve a clear separation between:
- the persistent market knowledge profile,
- the current listing data,
- the model prompt templates,
- and the UI and API that act on that state.

## Data Layer

The central persistent store is SQLite, which is a good fit because the system is single-host, local-first, and heavily write-oriented on listings rather than on large concurrent transactions. The main production database lives in `data/scraper.db`, and the surrounding logging and session artifacts live beside it in the same `data/` hierarchy.

The database design reflects the product logic rather than just the UI. `campaigns` define broad market segments, `searches` define concrete Kleinanzeigen queries tied to a campaign and a knowledge set, `knowledge_sets` store the expert evaluation profile, and `listings` store the scraped ad plus all extracted and computed outputs. That gives the application a clean separation between configuration and per-listing runtime state.

The `listings` table is especially important because it is not just a scrape cache. It holds the original card-level data, the detailed page text, specs, images, processing state, extracted facts, the score, and the status of the listing in the analysis pipeline. In other words, the database is the canonical memory of the system.

## Knowledge Sets

`knowledge_sets` are the architectural heart of the product. They store two things: `expert_knowledge`, which is the market-specific instruction set, and `item_json`, which defines the extraction criteria and scoring model. This allows each campaign or search profile to behave like a custom evaluator rather than a hardcoded one-size-fits-all classifier.

This is the right design because different markets have different trust signals. For Fireblades, TÜV, service records, ownership history, crash disclosure, and track history matter a lot; another market would require a different checklist and different weighting. The database therefore functions as a reusable “market brain” rather than a static settings table.

The current profiles have clearly evolved from simpler booleans into a richer evidence schema. Earlier versions focused on straightforward criterion satisfaction, while newer versions add risk-aware outputs like `high_value_unknowns`, `risk_flags`, and `_full_info_obtained`. That is a meaningful shift toward evidence-based triage rather than binary classification.

## Two-Model Strategy

The project currently uses a **two-agent strategy** conceptually, even if one of the agents may be a human or a stronger planning model rather than another always-on service. The external planning agent creates or refines the market profile, while the internal worker agent applies that profile to each listing.

The external planning role is where the system decides what “good” means in a specific market. It writes `expert_knowledge`, defines the extraction criteria, and assigns weight importance through `scoring_model.weights`. This is the high-cognition layer: it interprets the market, decides what matters, and converts that into a machine-readable evaluation spec.

The internal worker is the high-throughput execution layer. It receives the listing title, details, description, the expert knowledge, the extraction criteria, and a strict JSON skeleton, then returns evidence, uncertainty markers, and a structured comparison to reference listings. It has no role in shaping the market definition; its job is to apply it faithfully and cheaply.

## Why This Split Exists

The split exists because a single model doing both calibration and evaluation tends to blur the line between evidence and judgment. For marketplace analysis, that is a problem: a listing can “feel” good while lacking hard proof, and the system should not reward that feeling as if it were evidence.

By separating planning from execution, the architecture lets expensive reasoning happen once per market profile instead of repeatedly per listing. That reduces cost, improves consistency, and makes the worker prompt much easier to constrain. It also gives you a cleaner debugging surface, because scoring errors can be traced to either the profile design or the per-listing extraction.

## Scraping Pipeline

The scraping flow is split into discovery and detail harvesting. Discovery crawls the Kleinanzeigen index pages and stores the card-level ad information: title, price, location, URL, and short description. Detail harvesting then loads individual listing pages to capture richer fields such as the longer description, structured details, and images.

This two-step design is practical because not every listing needs full detail parsing at the discovery stage. It also reduces wasted work: the system can index many ads quickly, then selectively deepen only those that need full evaluation.

The scraper stores everything first and evaluates later. That separation is useful because the AI worker can then operate on a stable dataset, and the scraping code does not need to wait on any model call to continue capturing new listings.

## Internal Worker Role

The worker in `agent_worker.py` is the core AI execution engine. It takes listings from the database, loads the relevant knowledge set, builds the evaluation prompt, sends it to the OpenAI client, parses the result, validates the JSON structure, computes a final score, and writes the result back into SQLite.

The worker is intentionally not a black box wrapper around the model. It performs post-processing and enforcement in Python, including JSON block extraction, highlight sanitization, validation, scoring, logging, and persistence. That makes the worker the true operational center of the AI pipeline rather than just a thin API caller.

## Prompt Strategy

`prompts.py` is the translation layer between knowledge-set data and model calls. It reads the internal prompt template, injects the expert knowledge, listing content, market references, and a JSON skeleton, then returns the final prompt string to the worker. This means the prompt content is driven by configuration and data rather than by hardcoded branch logic.

That design matters because it lets the same worker code support many different market profiles. A Fireblade campaign can use one checklist and scoring distribution, while another campaign can use a different schema without changing the worker’s core logic.

The system also supports an outreach prompt path for generating a first-contact message once a listing is deemed interesting or once specific unknowns need to be clarified. That means the prompt stack is not just evaluative; it also supports sales follow-up and negotiation support.

## Internal Prompt Philosophy

The internal evaluation prompt has become much stricter than the earlier style of “analyze and score this ad.” It now behaves like a forensic extraction task: only explicit evidence should count, missing high-value facts should be marked as unknown, and generic seller praise should not be overvalued.

This is a strong design choice for a classifieds intelligence system. It prevents the model from smoothing over uncertainty, which is exactly what a human buyer would need to avoid when dealing with used bikes, uncertain maintenance histories, or potentially hidden damage.

The prompt also uses reference descriptions, one strong and one weak, to anchor the model’s judgment. This helps calibrate the system toward the local market rather than toward generic internet advice. In effect, the prompt gives the model a calibration target instead of asking it to reason in a vacuum.

## Extraction Schema

The result format has evolved into a structured evidence envelope. The worker expects `criteria` with per-field values and evidence quotes, `dimensions` with score/rationale pairs, `reference_comparison`, optional `high_value_unknowns`, optional `risk_flags`, a possible `draft_message`, and the `_full_info_obtained` flag.

This is a big improvement over a naive summary approach because it separates:
- confirmed facts,
- unresolved but important gaps,
- explicit warning signals,
- and the system’s overall comparison judgment.

That structure also makes the outputs explainable and audit-friendly. When a score looks wrong, the extracted evidence can be inspected directly without reverse-engineering the model’s prose.

## Sanitization and Validation

The worker does not trust the model output blindly. It extracts the JSON block from the response, sanitizes highlights by mapping fuzzy `kind` values into a controlled type set, and validates the schema with a focus on catastrophic failures rather than minor formatting issues.

This is an important engineering choice because model outputs are not always perfectly stable. The system deliberately treats severe schema failures as retry-worthy, while minor shape variations are normalized in code. That keeps the pipeline resilient without turning every minor formatting problem into a failed job.

The bounded one-shot retry is another practical safeguard. If validation fails, the worker sends a targeted follow-up with the validation errors and asks for a corrected JSON response. If that still fails, it proceeds with best-effort parsing instead of blocking the whole pipeline.

## Scoring Logic

The current scoring strategy is a blended scoring model. The worker computes a criteria score from satisfied checklist items, computes a dimensions score from trust and risk dimensions, and then combines them with a weighting scheme. It also applies a coverage factor so that sparse or vague listings cannot score highly simply because they avoided explicit negatives.

That logic is more defensible than a pure sum of positives because it recognizes the difference between “good evidence” and “little evidence.” A listing with only a few confirmed positives should not automatically outrank a listing with deeper, more complete disclosure.

The helper `is_satisfied()` is intentionally strict: unknown never satisfies a criterion. That is an important philosophical choice in this project because silence is not proof of safety, and omitted risk-relevant details must not count as confirmed positives.

## What Was Explored

The logs and code evolution suggest a series of architectural experiments. The earliest likely stage was simple model summarization or single-pass judgment; then the system evolved toward checklist-based extraction; then toward weighted scoring; and now toward a stricter forensic extraction model with explicit uncertainty handling.

That progression makes sense. Generic summaries are easy to generate but hard to trust. Pure boolean scoring is easier to verify but too brittle. The current architecture is trying to land in the middle with structured evidence, weighted interpretation, and explicit unknowns.

The system has also explored reference anchoring, which is helpful in a noisy classifieds market. Instead of asking the model “is this good?”, it asks it to compare against known good and bad listing styles, which reduces calibration drift.

## Logging Architecture

Logging is one of the strongest parts of the implementation. The system uses a rotated global log for operational health and separate per-listing logs for detailed AI runs. That means the top-level log stays readable, while each listing gets a full audit trail of prompt, response, validation errors, retry, parsed JSON, score contributions, and final score.

This design is excellent for debugging AI systems because it preserves causality. If a score looks suspicious, you can inspect exactly what the model saw, what it returned, how the parser handled it, and how the scorer converted it into the final number.

The isolated log directories also make the system scalable from an observability perspective. Each listing becomes a self-contained evidence folder, which is very useful for incident review, QA, and prompt iteration.

## Conversation Analysis

A secondary analysis path exists for conversational follow-up. `analyze_conversation()` inspects message history and tries to resolve unknown criteria based on the actual seller conversation, then recomputes the score if new evidence is found.

This is architecturally elegant because it treats confidence as a process rather than a one-time output. A listing may be incomplete at scrape time, but later messages may answer the important missing questions, and the system can incorporate that new evidence without redoing the whole pipeline.

That makes the product more than a static listing parser. It becomes a negotiation assistant and evidence tracker that can adapt as the conversation unfolds.

## Frontend and API

The Node/Express backend exposes the operational APIs, while the React frontend presents the dashboard and listing workflows. The backend handles campaigns, searches, knowledge sets, session status, scraping triggers, processing triggers, listing retrieval, and outreach draft generation.

The frontend is state-driven and is intended to show listings, editing views, and the operational dashboard for the user. The architecture suggests a single-page app experience where analysis state, processing state, and user editing all live in one coherent interface rather than being split across multiple tools.

This is appropriate for a tool that combines triage, analysis, and action. Users are not just looking at data; they are deciding which listings deserve attention, which need clarification, and which are worth outreach.

## Current Model Choice

The current design favors a low-cost worker model for the per-listing evaluation path. That choice is sensible because the system’s workload is repetitive and high-volume, and the worker is primarily extracting structured facts rather than inventing new reasoning from scratch.

The architecture implicitly assumes that more expensive reasoning should be used upstream, when the market profile is being designed and calibrated, not on every single ad. That is why the model can be cheaper in the loop while still benefiting from a stronger planning process outside the loop.

This is a pragmatic cost-performance tradeoff. The system gets consistency and throughput while reserving the more expensive “what matters in this market?” reasoning for the profile-design stage.

## Why This Is Better Than a Generic AI Tool

A generic AI tool would summarize listings or produce a polished opinion. This system instead tries to produce an evidence ledger with a conservative score, which is much more appropriate for used vehicle markets.

That distinction matters because used motorcycle purchases are dominated by hidden state: service history, crash history, structural modifications, and omission patterns. The architecture is designed to surface exactly those hidden-state questions instead of hiding them behind a smooth summary.

## Current Weaknesses

The biggest current weakness is that the prompt and the scorer are not yet perfectly aligned. The newer prompt outputs richer uncertainty signals, but the scoring function still primarily consumes the old-style criteria and dimensions structure, so the new semantics are not fully reflected in the final score.

That is why the architecture can feel “ahead” in extraction but “behind” in scoring. The model is already flagging high-value unknowns and risks, but Python still needs to absorb those signals more explicitly for the final number to match the evidence model.

A second weakness is schema drift. The system supports legacy and new formats simultaneously, which is good for migration but risky for long-term clarity. As the refactor continues, it would be wise to simplify the supported schema and make the scorer explicitly aware of every field that matters.

## What the Architecture Is Trying To Become

The long-term direction is clear: a market-specific evidence engine that can classify listings, explain the result, generate follow-up questions, and support outreach. It is not a chatbot bolted onto a scraper; it is a domain workflow where AI is just one layer in a larger decision pipeline.

The ideal end state is a system where:
- the market profile is carefully designed,
- the scraper reliably captures listing reality,
- the worker extracts explicit evidence,
- the scorer assigns a deterministic risk-aware rating,
- and the UI makes the whole process understandable.

## Practical Summary

In one sentence, KleinanzeigenScraper is a **forensic classifieds analysis pipeline** for used motorcycles, built around structured evidence extraction, deterministic scoring, and audit-friendly logging. Its architecture is intentionally split between planning, extraction, scoring, and follow-up so that each layer can be optimized independently.

The current implementation is already strong in structure and observability, but the next architectural step is to make the Python scoring layer fully consume the richer uncertainty and risk semantics that the newer prompt already produces.