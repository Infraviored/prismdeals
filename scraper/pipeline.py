"""The playbook-driven processing path.

This is the production wiring of the extraction/scoring split. It exists beside
the legacy `agent_worker.process_unprocessed_listings` rather than inside it:
listings in a category that has a playbook run here, everything else falls back
to the old path untouched. Once every active category has a playbook, the legacy
path can go.

The order of operations is the architecture in miniature:

    playbook  ->  fact sheet (cached, buyer-independent)
                      |
                      +-> identity -> dossier  (knowledge the listing omits)
                      |
                      +-> intent   -> score    (per buyer, no model call)
"""

import json
import logging

import dossiers
import fact_sheets
import identity as identity_mod
import playbooks
from extraction import get_or_extract, score_against_intent

logger = logging.getLogger(__name__)

LISTING_QUERY = """
    SELECT l.id, l.title, l.detailed_description, l.details, l.search_id,
           s.url AS search_url, k.item_json, k.expert_knowledge
    FROM listings l
    JOIN searches s ON l.search_id = s.id
    LEFT JOIN knowledge_sets k ON s.knowledge_set_id = k.id
    WHERE s.enabled = 1
"""


class Outcome:
    """What happened to one listing, so a run can be reported honestly."""

    __slots__ = (
        "listing_id",
        "playbook_key",
        "score",
        "from_cache",
        "identity_key",
        "skipped",
    )

    def __init__(
        self,
        listing_id,
        playbook_key=None,
        score=None,
        from_cache=False,
        identity_key=None,
        skipped=None,
    ):
        self.listing_id = listing_id
        self.playbook_key = playbook_key
        self.score = score
        self.from_cache = from_cache
        self.identity_key = identity_key
        self.skipped = skipped

    def __repr__(self):
        if self.skipped:
            return f"<Outcome {self.listing_id} skipped={self.skipped}>"
        origin = "cache" if self.from_cache else "model"
        return f"<Outcome {self.listing_id} score={self.score} from={origin}>"


def parse_intent(item_json):
    """Reads a buyer's intent from a knowledge set, tolerating an empty profile."""
    try:
        config = json.loads(item_json or "{}")
    except (ValueError, TypeError):
        logger.warning("Knowledge set holds unparseable item_json; treating as empty.")
        return {}
    return config if isinstance(config, dict) else {}


def effective_fields(playbook, dossier_payload):
    """Playbook fields plus any model-specific checks a dossier contributes.

    Dossier checks are still buyer-independent, so they belong in the fact sheet
    rather than in the scoring step. Playbook fields win on an id collision: the
    category definition is reviewed, a researched one is generated.
    """
    fields = list(playbooks.extraction_fields(playbook))
    if not dossier_payload:
        return fields

    known = {f["id"] for f in fields}
    for extra in dossiers.check_fields(dossier_payload):
        if extra.get("id") and extra["id"] not in known:
            fields.append(extra)
            known.add(extra["id"])
    return fields


def process_listing(
    conn, listing, call_model, dossier_lookup=None, require_intent=True
):
    """Extracts, resolves identity and scores one listing. Returns an Outcome."""
    listing_id = listing["id"]
    playbook = playbooks.playbook_for_url(listing["search_url"])
    if playbook is None:
        return Outcome(listing_id, skipped="no playbook for category")

    intent = parse_intent(listing["item_json"])

    # A knowledge set that names no fields is the normal case, not the odd one:
    # all three stored ones are empty objects. What the buyer actually said is
    # in the search itself -- the category they picked and the filters they set.
    if not intent.get("fields"):
        import intent_from_filters
        import search_url

        derived = intent_from_filters.intent_for_search(
            playbook, listing["search_url"], search_url.parse_tail
        )
        if derived["fields"]:
            intent = derived

    # Transitional guard. Extraction is buyer-independent and precomputing it is
    # the whole point, but while the legacy worker still runs alongside this
    # path, a listing the pipeline extracts without scoring stays
    # llm_processed = 0 and gets extracted a second time by the legacy worker.
    # Until every active category has a playbook and the legacy path is removed,
    # only take listings this pipeline can see all the way through.
    if require_intent and not intent.get("fields"):
        return Outcome(listing_id, skipped="knowledge set defines no fields")

    # What the seller already wrote decides most of them, for nothing.
    #
    # A title like "32GB DDR3 CORSAIR VENGEANCE (4x8GB)" states four facts, and
    # three of them fail a buyer who wants two DDR4 sticks. Asking a model about
    # that title would return the same four at a thousand times the cost. Of 50
    # stored Corsair offers, 32 are settled here and never reach extraction.
    import text_facts

    wanted = intent.get("fields") or []
    listing_text = "\n".join(
        part for part in (listing["title"], listing.get("detailed_description")) if part
    )
    if wanted:
        # Title first, then the description under what the title settled. A
        # title that lists every specification reads as a match -- nobody
        # advertises a fault in the headline -- so judging the title alone sent
        # "Ein Riegel defekt, Bastlerware" to the model at full price and let it
        # come back a candidate. Free text we already hold is never a reason to
        # stop looking, and an assumption from the title's silence must not
        # shield a statement in the body.
        verdict, _facts, why = text_facts.judge(playbook, wanted, listing["title"])
        stage = "title"
        if verdict != "reject" and listing.get("detailed_description"):
            # Only what the title *stated* carries forward. judge() also returns
            # what it assumed from silence, and passing that as settled would
            # let the title's silence outrank the body's words.
            verdict, _facts, why = text_facts.judge(
                playbook,
                wanted,
                listing_text,
                settled=text_facts.read_stated(playbook, listing["title"]),
            )
            stage = "description"
        if verdict == "reject":
            # Mark it, or the saving is imaginary. The legacy worker takes
            # every listing with llm_processed = 0, so a title rejected here
            # for nothing was sent to the model by the next stage of the same
            # run -- one paid call each, for the listings this step exists to
            # avoid paying for.
            _mark_settled_without_a_model(conn, listing_id)
            return Outcome(
                listing_id, playbook["key"], skipped=f"{stage} says {why[0]}"
            )

    result = get_or_extract(
        conn,
        listing,
        playbook,
        call_model,
        expert_knowledge=listing["expert_knowledge"] or "",
    )

    # Identity is resolved from the extracted fields rather than the raw title,
    # so this is normalisation rather than parsing.
    key, _parts = identity_mod.resolve_or_log(result.facts, playbook, listing_id)

    dossier_payload = None
    if key and playbook.get("dossier_relevant") and dossier_lookup:
        dossier_payload = dossier_lookup(key)

    if not intent.get("fields"):
        # Reached only with require_intent=False: the fact sheet is built, which
        # is the expensive half, but there is no intent to score it against yet.
        logger.info(
            "Listing %s extracted but not scored: knowledge set defines no fields.",
            listing_id,
        )
        return Outcome(listing_id, playbook["key"], None, result.from_cache, key)

    scoring_result, unknown = score_against_intent(
        result.facts, playbook, intent, _score_listing()
    )

    _persist(conn, listing_id, result.facts, scoring_result.score)

    # The model has now read the whole listing, so its facts replace what the
    # title reader could only guess at. Leaving both meant a score of 61 sitting
    # beside "passt nicht", which tells a buyer nothing.
    import fit

    if listing.get("search_id"):
        fit.from_extracted(
            conn,
            listing_id,
            listing["search_id"],
            playbook,
            result.facts,
            wanted,
            text=listing_text,
        )
    return Outcome(
        listing_id, playbook["key"], scoring_result.score, result.from_cache, key
    )


def _score_listing():
    from scoring import score_listing

    return score_listing


def _mark_settled_without_a_model(conn, listing_id):
    """Records that this listing needs no model call, and why nothing was spent.

    llm_processed is what the legacy worker reads to decide whom to ask. A
    listing the title settled is settled; leaving the flag at 0 hands it
    straight to the expensive path.
    """
    import datetime

    conn.execute(
        "UPDATE listings SET llm_processed = 1, last_ai_evaluated_at = ? WHERE id = ?",
        (datetime.datetime.now(datetime.timezone.utc).isoformat(), listing_id),
    )
    conn.commit()


def _persist(conn, listing_id, facts, score):
    import datetime

    conn.execute(
        "UPDATE listings SET extracted_facts = ?, niceness_score = ?, "
        "llm_processed = 1, last_ai_evaluated_at = ? WHERE id = ?",
        (
            json.dumps(facts, ensure_ascii=False),
            score,
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
            listing_id,
        ),
    )
    conn.commit()


def run(conn, call_model, dossier_lookup=None, limit=None, require_intent=True):
    """Processes every listing whose category has a playbook.

    Returns the list of Outcomes so the caller can report cache hit rate, which
    is the number that tells you whether the decoupling is actually paying off.
    """
    fact_sheets.ensure_schema(conn)
    dossiers.ensure_schema(conn)

    conn.row_factory = __import__("sqlite3").Row
    query = LISTING_QUERY + (" LIMIT %d" % int(limit) if limit else "")
    rows = conn.execute(query).fetchall()

    outcomes = []
    for row in rows:
        # sqlite3.Row indexes but does not .get(); downstream treats a listing as
        # a plain mapping, so normalise here rather than at every call site.
        listing = dict(row)
        try:
            outcomes.append(
                process_listing(
                    conn,
                    listing,
                    call_model,
                    dossier_lookup=dossier_lookup,
                    require_intent=require_intent,
                )
            )
        except Exception as exc:
            logger.error("Failed to process listing %s: %s", listing["id"], exc)
            outcomes.append(Outcome(listing["id"], skipped=f"error: {exc}"))

    return outcomes


def default_model_caller():
    """The production model caller: prompt in, sanitised facts out.

    Imported lazily so the pipeline stays unit-testable without an API key or a
    configured provider.
    """
    import agent_worker
    from evidence_extractor import EvidenceExtractor

    extractor = EvidenceExtractor()

    def call(prompt, fields):
        kwargs = agent_worker.build_llm_kwargs([{"role": "user", "content": prompt}])
        response = agent_worker.client.chat.completions.create(**kwargs)
        text = agent_worker.get_response_text(response)

        facts, errors = extractor.extract(text, fields)
        if errors:
            logger.warning("Extraction validation reported: %s", errors)
        return facts or {}

    return call


def summarise(outcomes):
    processed = [o for o in outcomes if not o.skipped]
    cached = [o for o in processed if o.from_cache]
    scored = [o for o in processed if o.score is not None]

    # Skip reasons are counted separately: "no playbook" and "no intent" call for
    # opposite responses, and a single total invites the wrong conclusion.
    reasons = {}
    for outcome in outcomes:
        if outcome.skipped:
            reasons[outcome.skipped] = reasons.get(outcome.skipped, 0) + 1

    return {
        "listings": len(outcomes),
        "processed": len(processed),
        "skipped": len(outcomes) - len(processed),
        "skip_reasons": reasons,
        "from_cache": len(cached),
        "model_calls": len(processed) - len(cached),
        "scored": len(scored),
        "identities_resolved": len([o for o in processed if o.identity_key]),
    }
