"""Judging every listing of a search, and keeping the answer.

The three stages cost wildly different amounts, so they run in that order and
each one only sees what the cheaper one could not settle:

    title        free          settles most of a search
    description  one page      for what the title left open
    photo        one model     for what neither could answer

The verdict is stored per (listing, search): the same memory kit fits one
buyer's requirements and fails another's, and a verdict nobody can read is the
same as no verdict at all -- which is what this product had.

The table itself lives in db/schema.sql, like every other. Declaring it here as
well is how a table comes to exist in two shapes, which is what
test_no_module_declares_tables_outside_the_schema_file exists to stop -- and it
caught exactly that here.
"""

import datetime
import json
import logging

import playbooks
import text_facts

logger = logging.getLogger(__name__)

VERDICTS = ("fit", "unclear", "no")


def intent_for(conn, search_id):
    """The buyer's requirements for this search, or an empty list."""
    row = conn.execute(
        """SELECT k.item_json FROM searches s
             LEFT JOIN knowledge_sets k ON k.id = s.knowledge_set_id
            WHERE s.id = ?""",
        (search_id,),
    ).fetchone()
    if not row or not row[0]:
        return []
    try:
        return json.loads(row[0]).get("fields") or []
    except ValueError:
        logger.warning("Search %s has an unreadable knowledge set.", search_id)
        return []


def record(conn, listing_id, search_id, verdict, reason, facts, stage):
    """Writes one verdict. Public because the pipeline has a better one.

    Two judgements that disagree are worse than one: a score of 61 beside
    "passt nicht" tells a buyer nothing. Once the model has read the whole
    listing, its facts replace what the title reader guessed at, and the
    verdict is rewritten from them.
    """
    _store(conn, listing_id, search_id, verdict, reason, facts, stage)


def from_extracted(conn, listing_id, search_id, playbook, extracted, wanted):
    """Re-judges a listing from its fact sheet, once a model has read it.

    `extracted` is the fact sheet's shape -- {"criteria": {field: {"value":…}}}
    -- so it is flattened to the plain mapping the requirements compare against.
    """
    criteria = (extracted or {}).get("criteria") or {}
    facts = {}
    for field_id, entry in criteria.items():
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value is None or value == "unknown":
            continue
        # The model answers an enum in the words of the listing; the playbook's
        # options are lowercase. Compared as written, "DDR4" never matched
        # "ddr4" and the requirement silently went unsatisfied.
        facts[field_id] = value.lower() if isinstance(value, str) else value

    # Absence still answers for the fields only ever written when true, so the
    # playbook's own rule applies before the comparison.
    for field in playbook.get("fields", []):
        if "absent_means" in field and field["id"] not in facts:
            facts[field["id"]] = field["absent_means"]

    verdict, known, reasons = text_facts.judge_facts(wanted, facts)
    stored = {"candidate": "fit", "reject": "no", "unclear": "unclear"}[verdict]
    _store(conn, listing_id, search_id, stored, "; ".join(reasons[:3]), known, "model")
    return stored


def _store(conn, listing_id, search_id, verdict, reason, facts, stage):
    conn.execute(
        """INSERT INTO listing_fit
               (listing_id, search_id, verdict, reason, facts_json, stage, judged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(listing_id, search_id) DO UPDATE SET
               verdict = excluded.verdict,
               reason = excluded.reason,
               facts_json = excluded.facts_json,
               stage = excluded.stage,
               judged_at = excluded.judged_at""",
        (
            str(listing_id),
            int(search_id),
            verdict,
            reason,
            json.dumps(facts, ensure_ascii=False),
            stage,
            datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        ),
    )


def judge_search(conn, search_id, use_descriptions=True):
    """Judges every listing of one search from its own words.

    Returns a count per verdict. No model is called: this is the free half, and
    on the Corsair search it settles 34 of 50 before anything is spent.
    """
    search = conn.execute(
        "SELECT id, url FROM searches WHERE id = ?", (search_id,)
    ).fetchone()
    if not search:
        raise ValueError(f"No search {search_id}")

    playbook = playbooks.playbook_for_url(search[1])
    if playbook is None:
        return {"error": "no playbook for this search's category"}

    wanted = intent_for(conn, search_id)
    if not wanted:
        return {"error": "this search has no requirements to judge against"}

    rows = conn.execute(
        "SELECT id, title, detailed_description, short_description "
        "FROM listings WHERE search_id = ?",
        (search_id,),
    ).fetchall()

    counts = {v: 0 for v in VERDICTS}
    for row in rows:
        listing_id, title, detailed, short = row

        verdict, facts, reasons = text_facts.judge(playbook, wanted, title)
        stage = "title"

        # Only what the title could not settle goes on, and only if we already
        # have the text -- fetching descriptions is the scraper's job, not this
        # one's.
        if verdict == "unclear" and use_descriptions:
            description = detailed or short
            if description:
                verdict, facts, reasons = text_facts.judge(
                    playbook, wanted, f"{title}\n{description}", settled=facts
                )
                stage = "description"

        stored = {"candidate": "fit", "reject": "no", "unclear": "unclear"}[verdict]
        counts[stored] += 1
        _store(
            conn, listing_id, search_id, stored, "; ".join(reasons[:3]), facts, stage
        )

    conn.commit()
    return counts


def summary(conn, search_id):
    rows = conn.execute(
        "SELECT verdict, COUNT(*) FROM listing_fit WHERE search_id = ? GROUP BY verdict",
        (search_id,),
    ).fetchall()
    return {verdict: count for verdict, count in rows}
