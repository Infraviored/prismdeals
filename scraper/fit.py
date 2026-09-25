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
import re
import sqlite3

import playbooks
import text_facts
from requirements_hash import requirements_hash as _compute_hash
import generation
import hunt_identity
import wishes

logger = logging.getLogger(__name__)

VERDICTS = ("fit", "unclear", "no")


def _term_ids(conn, search_id):
    """The family terms (models) this search runs for."""
    try:
        rows = conn.execute(
            "SELECT term_id FROM search_family_searches WHERE search_id = ?",
            (int(search_id),),
        ).fetchall()
    except sqlite3.OperationalError:  # a store without families
        return set()
    return {str(r[0]) for r in rows if r[0] is not None}


def scoped(conn, search_id, fields):
    """The requirements that apply to this search's model.

    A requirement with `applies_to` (term ids) is for those models only: "under
    5000 km" for the CBR must not reject an R1 with 13.000 km.
    """
    ids = _term_ids(conn, search_id)
    return [
        f
        for f in fields
        if not f.get("applies_to") or ids & {str(x) for x in f["applies_to"]}
    ]


def _details_text(details):
    """The detail page's attributes as lines ("Kilometerstand: 13.000 km")."""
    if not details:
        return ""
    try:
        data = json.loads(details) if isinstance(details, str) else details
    except ValueError:
        return ""
    if not isinstance(data, dict):
        return ""
    return "\n".join(f"{k}: {v}" for k, v in data.items() if v not in (None, ""))


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


def from_extracted(conn, listing_id, search_id, playbook, extracted, wanted, text=None):
    """Re-judges a listing from its fact sheet, once a model has read it.

    `extracted` is the fact sheet's shape -- {"criteria": {field: {"value":…}}}
    -- so it is flattened to the plain mapping the requirements compare against.

    `text` is the listing's own words. Pass them: what the seller wrote outranks
    what the model left blank. Without them, a model that answers
    hasFunctionalDefect with null hands the field to the playbook's
    absent_means, and "Display flackert stark, Bastlerware" becomes a green
    tick -- an assumption overruling a statement, which is the one thing the
    whole three-stage sieve exists to prevent.
    """
    types = {f["id"]: f.get("type") for f in playbook.get("fields", [])}
    criteria = (extracted or {}).get("criteria") or {}
    facts = {}
    for field_id, entry in criteria.items():
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value is None or value == "unknown":
            continue
        # The model answers an enum in the words of the listing; the playbook's
        # options are lowercase. Compared as written, "DDR4" never matched
        # "ddr4" and the requirement silently went unsatisfied.
        if isinstance(value, str):
            value = value.lower()
        typed = _typed(types.get(field_id), value)
        if typed is None:
            continue
        facts[field_id] = typed

    # What the listing states, before any assumption is allowed to fill a gap.
    stated = text_facts.read_stated(playbook, text) if text else {}
    facts.update(stated)

    # Absence still answers for the fields only ever written when true, so the
    # playbook's own rule applies -- but only where nothing was said.
    for field in playbook.get("fields", []):
        if "absent_means" in field and field["id"] not in facts:
            facts[field["id"]] = field["absent_means"]

    req_hash = _compute_hash(wanted)
    playbook_wanted, own = _split_wanted(playbook, scoped(conn, search_id, wanted))
    title, details = _title_and_details(conn, listing_id)
    checks = _listing_checks(
        conn,
        title,
        f"{title}\n{text or ''}\n{_details_text(details)}",
        details,
        hunt_identity.hunt_models(conn, search_id),
        own,
        {},
    )
    if checks["reject"]:
        reason, own_facts, _ = checks["reject"]
        _store(conn, listing_id, search_id, "no", reason, own_facts, "model", req_hash)
        return "no"

    verdict, known, reasons = text_facts.judge_facts(playbook_wanted, facts, playbook)
    stored = {"candidate": "fit", "reject": "no", "unclear": "unclear"}[verdict]
    stored, reasons = _open_for(stored, reasons, checks)
    _store(
        conn,
        listing_id,
        search_id,
        stored,
        "; ".join(reasons[:3]),
        {**known, **checks["own_facts"]},
        "model",
        req_hash,
    )
    return stored


# The prompt asks for yes/no/unknown on a boolean, and the model obliges. A
# string "yes" is not a Python True, so `contradicts` -- which only compares a
# boolean requirement against a boolean -- found no contradiction and a kit the
# model had just called defective was stored as a match.
_AS_TRUE = {"yes", "true", "ja", "1"}
_AS_FALSE = {"no", "false", "nein", "0"}


def _typed(field_type, value):
    """The model's answer in the type the playbook declared."""
    if field_type != "boolean" or isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value in _AS_TRUE:
            return True
        if value in _AS_FALSE:
            return False
        logger.warning("Unreadable boolean %r for a %s field", value, field_type)
        return None
    if isinstance(value, (int, float)):
        return bool(value)
    return value


def _store(
    conn, listing_id, search_id, verdict, reason, facts, stage, requirements_hash=None
):
    conn.execute(
        """INSERT INTO listing_fit
               (listing_id, search_id, verdict, reason, facts_json, stage, judged_at,
                requirements_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(listing_id, search_id) DO UPDATE SET
               verdict = excluded.verdict,
               reason = excluded.reason,
               facts_json = excluded.facts_json,
               stage = excluded.stage,
               judged_at = excluded.judged_at,
               requirements_hash = excluded.requirements_hash""",
        (
            str(listing_id),
            int(search_id),
            verdict,
            reason,
            json.dumps(facts, ensure_ascii=False),
            stage,
            datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            requirements_hash,
        ),
    )


def _own_words(fields, text):
    """Facts and a verdict for requirements written in the buyer's own words.

    A must denied in the text rejects, a must not mentioned leaves the offer
    open; a wish only becomes a fact for the score and never changes the
    verdict -- an unmentioned "ABS" must not turn a good offer "unclear".
    """
    facts, verdict, reasons = {}, None, []
    for field in fields:
        value = wishes.read_wish(field, text)
        if value is not None:
            facts[field["id"]] = value
        if field.get("importance") != "high" and not field.get("hard"):
            continue
        label = field.get("label") or field["id"]
        if value is False:
            return facts, "reject", [_denial(field, text, label)]
        if value is None:
            verdict = "unclear"
            reasons.append(f"{label} nicht angegeben")
    return facts, verdict, reasons


def _denial(field, text, label):
    """Why a must failed: "Kilometerstand 21.000 km, erlaubt bis 5.000"."""
    wants = field.get("buyer_wants") or {}
    if "min" in wants or "max" in wants:
        from probe_sieve import read_number, unit_of

        value = read_number(str(text).lower(), label)
        if value is not None:
            unit = unit_of(label) or ""
            name = (
                re.sub(rf"\s*\b{re.escape(unit)}\b\s*$", "", label, flags=re.I)
                if unit
                else label
            )

            def fmt(n):
                return (
                    f"{n:,.0f}".replace(",", ".") if float(n).is_integer() else str(n)
                )

            bound = (
                f"erlaubt bis {fmt(wants['max'])}"
                if "max" in wants
                else f"verlangt ab {fmt(wants['min'])}"
            )
            return f"{name} {fmt(value)} {unit}, {bound}".replace("  ", " ")
    return f"{label}: nein"


def _generation_check(conn, title, details, models, cache):
    """(verdict, reason) for the generation the matching model names, if any."""
    model = hunt_identity.matching_model(title, models) if models else None
    if not model:
        return None, ""
    base, code = generation.split_generation(model)
    if not code:
        return None, ""
    if (base, code) not in cache:
        cache[(base, code)] = generation.years_for(conn, base, code)
    return generation.judge_generation(title, details, code, cache[(base, code)])


def _listing_checks(conn, title, text, details, models, own, gen_cache):
    """What rules a listing out before any playbook field is read.

    Shared by the title/description judge and the model's fact sheet: the
    fact sheet only knows playbook fields, and re-judging from it alone turned
    "Suche Corsair …" and a wrong generation back into a fit.
    """
    # Somebody wanting one is not an offer.
    if hunt_identity.is_request(title):
        return {"reject": ("Gesuch, kein Angebot", {}, "title")}
    # In a model list the model is the first must: named in the title, or
    # the offer stays open ("Yamaha WR 125 R" came back for "yamaha r1").
    model_seen = not models or hunt_identity.names_a_model(title, models)
    # A generation named with the model ("R1 RN19") is a must too: its
    # build years against the offer's first registration.
    gen_verdict, gen_reason = _generation_check(conn, title, details, models, gen_cache)
    if gen_verdict == "no":
        return {"reject": (gen_reason, {}, "title")}
    own_facts, own_verdict, own_reasons = _own_words(own, text)
    if own_verdict == "reject":
        return {"reject": ("; ".join(own_reasons), own_facts, "description")}
    return {
        "reject": None,
        "model_seen": model_seen,
        "gen_verdict": gen_verdict,
        "gen_reason": gen_reason,
        "own_facts": own_facts,
        "own_verdict": own_verdict,
        "own_reasons": own_reasons,
    }


def _details_column(conn):
    """l.details, or NULL on older stores (and small test schemas)."""
    columns = {r[1] for r in conn.execute("PRAGMA table_info(listings)").fetchall()}
    return "details" if "details" in columns else "NULL"


def _title_and_details(conn, listing_id):
    row = conn.execute(
        f"SELECT title, {_details_column(conn)} FROM listings WHERE id = ?",
        (str(listing_id),),
    ).fetchone()
    return (row[0] or "", row[1]) if row else ("", None)


def _split_wanted(playbook, wanted):
    """(playbook fields, fields in the buyer's own words)."""
    known = {f.get("id") for f in (playbook or {}).get("fields", [])}
    own = [f for f in wanted if f.get("id") not in known and wishes.is_own(f)]
    return [f for f in wanted if f.get("id") in known], own


def _open_for(stored, reasons, checks):
    """A fit the checks leave open becomes unclear, with the reason first."""
    if stored != "fit":
        return stored, reasons
    if checks["own_verdict"] == "unclear":
        return "unclear", checks["own_reasons"] + list(reasons)
    if not checks["model_seen"]:
        return "unclear", ["Modell im Titel nicht erkennbar"] + list(reasons)
    if checks["gen_verdict"]:
        return "unclear", [checks["gen_reason"]] + list(reasons)
    return stored, reasons


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

    wanted = intent_for(conn, search_id)
    req_hash = _compute_hash(wanted)
    # The verdicts below are found through the knowledge set's hash. A set
    # written by a path that did not store it would hide them all.
    if req_hash:
        conn.execute(
            """UPDATE knowledge_sets SET requirements_hash = ?
                WHERE id = (SELECT knowledge_set_id FROM searches WHERE id = ?)
                  AND requirements_hash IS NOT ?""",
            (req_hash, int(search_id), req_hash),
        )
    # The hash is the whole set's -- verdicts are found through it -- but this
    # search is judged only by what applies to its model.
    all_wanted = wanted
    wanted = scoped(conn, search_id, wanted)
    models = hunt_identity.hunt_models(conn, search_id)
    # Nothing set at all is an error; requirements only for other models mean
    # this model's offers have nothing to fail, and are judged as fitting.
    if not all_wanted and not models:
        return {"error": "this search has no requirements to judge against"}
    # Fields the category's playbook knows are read with its patterns; the
    # buyer's own words ("ABS") are read as words (wishes.py).
    this_model = wanted
    wanted, own = _split_wanted(playbook, wanted)
    if playbook is None and not (own or models) and this_model:
        return {"error": "no playbook for this search's category"}

    # Every listing this search found, not only the ones it found first.
    # listings.search_id names the first finder and never changes, so a kit
    # another search had already seen was never judged against this search's
    # requirements -- and "fits only" then hid it, though it matched perfectly.
    # Older stores (and small test schemas) have no details column.
    details_col = _details_column(conn)
    details_col = "l.details" if details_col == "details" else "NULL"
    rows = conn.execute(
        f"""SELECT DISTINCT l.id, l.title, l.detailed_description, l.short_description, {details_col}
             FROM listings l
             LEFT JOIN listing_search_hits h ON h.listing_id = l.id
            WHERE l.search_id = ? OR h.search_id = ?""",
        (search_id, search_id),
    ).fetchall()

    counts = {v: 0 for v in VERDICTS}
    gen_cache = {}
    for row in rows:
        listing_id, title, detailed, short, details = row

        checks = _listing_checks(
            conn,
            title,
            f"{title}\n{detailed or short or ''}\n{_details_text(details)}",
            details,
            models,
            own,
            gen_cache,
        )
        if checks["reject"]:
            reason, facts, stage = checks["reject"]
            counts["no"] += 1
            _store(conn, listing_id, search_id, "no", reason, facts, stage, req_hash)
            continue
        own_facts = checks["own_facts"]
        if not wanted:
            stored, reasons = _open_for("fit", [], checks)
            counts[stored] += 1
            _store(
                conn,
                listing_id,
                search_id,
                stored,
                "; ".join(reasons[:3]),
                own_facts,
                "title",
                req_hash,
            )
            continue

        verdict, facts, reasons = text_facts.judge(playbook, wanted, title)
        # Only what the title stated is carried forward as settled. What was
        # assumed from its silence must not shield a later statement: a title
        # that mentions no fault is not evidence there is none.
        stated = text_facts.read_stated(playbook, title)
        stage = "title"

        # The description is read whenever there is one, not only when the
        # title left a question. A title that lists every specification reads
        # as a match -- nobody advertises a fault in the headline -- and
        # "Ein Riegel defekt, Bastlerware" in the body would never have been
        # seen. Free text we already hold is never a reason to stop looking.
        if verdict != "reject" and use_descriptions:
            description = detailed or short
            if description:
                verdict, facts, reasons = text_facts.judge(
                    playbook, wanted, f"{title}\n{description}", settled=stated
                )
                stage = "description"

        stored = {"candidate": "fit", "reject": "no", "unclear": "unclear"}[verdict]
        facts = {**facts, **own_facts}
        stored, reasons = _open_for(stored, reasons, checks)
        counts[stored] += 1
        _store(
            conn,
            listing_id,
            search_id,
            stored,
            "; ".join(reasons[:3]),
            facts,
            stage,
            req_hash,
        )

    conn.commit()
    return counts
