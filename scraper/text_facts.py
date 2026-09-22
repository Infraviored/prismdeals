"""What a listing's own words already state.

Between a search and a model call there is a step worth taking: read what the
seller wrote. Titles on Kleinanzeigen are dense with exactly the facts that
decide a purchase -- "32GB DDR4 (2x16) Corsair Vengeance 3200 MHz CL16" states
five of them -- and a model asked about that title would return the same five
at a thousand times the cost.

So each playbook says how its fields appear in text, and this reads them out.
The requirements then decide: a stated value that misses is a rejection, an
absent one is a question for the next stage.

The patterns live with the playbook rather than here, because "how does this
show up in a title" is knowledge about memory or about cars, not about text.
"""

import logging
import re

logger = logging.getLogger(__name__)


def read_stated(playbook, text):
    """Only what the text actually says, with nothing assumed.

    Separate from `read` because the two are different kinds of evidence, and
    treating them alike cost a real verdict: a title with no mention of a fault
    is read as "no fault", and passed on as settled that assumption then turned
    "Ein Riegel defekt" in the description into a mere doubt instead of a
    rejection. An assumption must never outrank a statement.
    """
    facts = {}
    if not text:
        return facts

    for field in playbook.get("fields", []):
        patterns = field.get("text_patterns")
        if not patterns:
            continue
        for pattern, convert in patterns:
            match = re.search(pattern, text, re.I)
            if not match:
                continue
            try:
                value = convert(match)
            except (ValueError, IndexError, TypeError):
                continue
            if value is not None:
                facts[field["id"]] = value
                break
    return facts


def read(playbook, text):
    """Facts the text states outright, as {field_id: value}.

    Only what is written. A title that does not mention the latency yields no
    latency, which is different from yielding a wrong one.
    """
    facts = read_stated(playbook, text)

    # Some facts are only ever written down when they are true. Nobody labels a
    # desktop module "DIMM" and nobody advertises that their memory works, so
    # for those fields silence is the answer rather than a question. Requiring
    # them to be stated left every clean title unclear, which would have sent
    # all fifty offers to the model.
    for field in playbook.get("fields", []):
        if "absent_means" in field and field["id"] not in facts:
            facts[field["id"]] = field["absent_means"]

    return facts


def contradicts(wants, value):
    """Whether a stated value definitely fails a requirement.

    Deliberately narrow: a title is evidence of what it says, not of what it
    leaves out. `present` is left to the stages that look properly.
    """
    if value is None:
        return False
    if "match" in wants and isinstance(value, bool):
        return value is not bool(wants["match"])
    if "min" in wants and isinstance(value, (int, float)) and value < wants["min"]:
        return True
    if "max" in wants and isinstance(value, (int, float)) and value > wants["max"]:
        return True
    if (
        "preferred" in wants
        and isinstance(value, str)
        and value not in wants["preferred"]
    ):
        return True
    if "excluded" in wants and isinstance(value, str) and value in wants["excluded"]:
        return True
    return False


# Nobody buying memory says "stickCount is 4". The playbook already names every
# field in the buyer's own language, and the requirement already says what was
# wanted, so a rejection can read like a reason to walk away rather than like a
# stack trace.


def _field(playbook, field_id):
    for field in (playbook or {}).get("fields", []):
        if field["id"] == field_id:
            return field
    return {}


def _show(field, value):
    if isinstance(value, bool):
        return "ja" if value else "nein"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, str):
        # Only a field with a fixed set of options is a token worth
        # re-spelling: "ddr4" is DDR4, "sodimm" is SODIMM. Free text is the
        # seller's own words, and shouting "THINKPAD T14S GEN 2" back at the
        # buyer is not a correction, it is a defect.
        if field.get("type") != "enum":
            return value
        # A token carrying a digit is a spelling: ddr4 is DDR4. An ordinary
        # word is a word -- "Zustand DEFEKT" shouts at the buyer for no reason.
        return value.upper() if any(c.isdigit() for c in value) else value.capitalize()
    unit = field.get("unit")
    return f"{value} {unit}" if unit else f"{value}"


def _wanted(field, wants):
    if "match" in wants:
        return "ja" if wants["match"] else "nein"
    low, high = wants.get("min"), wants.get("max")
    if low is not None and high is not None:
        return _show(field, low) if low == high else f"{low}-{_show(field, high)}"
    if low is not None:
        return f"mind. {_show(field, low)}"
    if high is not None:
        return f"höchstens {_show(field, high)}"
    if wants.get("preferred"):
        return " oder ".join(_show(field, v) for v in wants["preferred"])
    if wants.get("excluded"):
        return "nicht " + " oder ".join(_show(field, v) for v in wants["excluded"])
    return "anders"


def say_miss(playbook, field_id, wants, value):
    """Why this one is out, in the words the buyer set it in."""
    field = _field(playbook, field_id)
    label = field.get("label") or field_id
    # A yes/no field names a thing, not a quantity: "Defekt ja statt nein" is
    # two words longer and less clear than "Defekt".
    if isinstance(value, bool):
        return label if value else f"kein {label}"
    # An excluded value was named outright, so repeating it as "X statt nicht X"
    # says the same word twice and explains nothing.
    if wants.get("excluded") and not wants.get("preferred"):
        return f"{label} {_show(field, value)} — ausgeschlossen"
    return f"{label} {_show(field, value)} statt {_wanted(field, wants)}"


def say_fact(playbook, field_id, value):
    """What was checked and found, for a listing that passes."""
    field = _field(playbook, field_id)
    label = field.get("label") or field_id
    if isinstance(value, bool):
        return label if value else f"kein {label}"
    return f"{label} {_show(field, value)}"


def judge_facts(intent_fields, facts, playbook=None):
    """Verdict on facts that are the evidence, not a prior.

    Distinct from judging text against something already settled: there, a
    contradiction is a doubt, because the earlier stage may have been reading
    the seller's mainboard rather than the memory. Here the facts came from a
    model that read the whole listing, so a miss is a miss.
    """
    reasons = []
    for field in intent_fields:
        value = facts.get(field.get("id"))
        if value is None:
            continue
        wants = field.get("buyer_wants") or {}
        if contradicts(wants, value):
            return "reject", facts, [say_miss(playbook, field["id"], wants, value)]
        reasons.append(say_fact(playbook, field["id"], value))

    missing = [f["id"] for f in intent_fields if f["id"] not in facts]
    if missing:
        return "unclear", facts, reasons
    return "candidate", facts, reasons


def judge(playbook, intent_fields, text, settled=None):
    """Verdict on one piece of text against the buyer's requirements.

    Returns (verdict, stated, reasons):
      'reject'    -- something it states fails a requirement
      'candidate' -- every requirement is met by what it states
      'unclear'   -- nothing contradicts, but not everything is answered

    `settled` carries what an earlier stage established, so a contradiction of
    something already settled is reported as a doubt rather than a verdict --
    "mein Testsystem kann nur 2666MHz" is the seller's mainboard, not the
    memory, and it appeared under a title that plainly said 3200.
    """
    stated = read(playbook, text)
    settled = dict(settled or {})
    reasons = []
    doubts = []

    for field in intent_fields:
        fid = field.get("id")
        wants = field.get("buyer_wants") or {}
        value = stated.get(fid)
        if value is None:
            continue
        if contradicts(wants, value):
            if fid in settled:
                field = _field(playbook, fid)
                doubts.append(
                    f"{field.get('label') or fid} {_show(field, value)}? "
                    f"Der Titel sagte {_show(field, settled[fid])}"
                )
                continue
            return "reject", stated, [say_miss(playbook, fid, wants, value)]
        reasons.append(say_fact(playbook, fid, value))

    known = {**settled, **stated}
    missing = [f["id"] for f in intent_fields if f["id"] not in known]
    if missing or doubts:
        return "unclear", known, reasons + doubts
    return "candidate", known, reasons
