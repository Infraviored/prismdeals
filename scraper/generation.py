"""Model generations: which build years a code like "RN19" stands for.

A buyer who writes "Yamaha R1 RN19" wants a 2007-2008 R1, and sellers rarely
write the code -- they write "R1 2008". So the code is turned into years once
(one small-model call per model and code, kept in model_generations) and each
offer's first registration is judged against them. A registration can trail
the build year, so one year of slack is allowed at the end.
"""

import datetime
import json
import logging
import re

logger = logging.getLogger(__name__)

_CODE = re.compile(r"^[A-Za-z]{1,3}\d{1,3}$")


def split_generation(model):
    """ "Yamaha R1 RN19" -> ("Yamaha R1", "RN19"); no code -> (model, None)."""
    words = str(model).split()
    if len(words) >= 3 and _CODE.match(words[-1]):
        return " ".join(words[:-1]), words[-1].upper()
    return str(model).strip(), None


def _ask_years(model, code):
    """One small-model call: {"from": 2007, "to": 2008} or None."""
    try:
        from agent_worker import build_llm_kwargs, client, get_response_text
    except Exception:  # noqa: BLE001 -- no model configured: no years
        return None
    prompt = (
        f"Welche Baujahre (Modelljahre) umfasst die Generation {code} der {model}?\n"
        "Antworte nur mit JSON in genau dieser Form, ohne weiteren Text:\n"
        '{"from": 2007, "to": 2008}\n'
        'Wenn du es nicht sicher weißt: {"from": null, "to": null}'
    )
    try:
        kwargs = build_llm_kwargs(
            [{"role": "user", "content": prompt}], max_tokens=60, temperature=0.0
        )
        text = get_response_text(client.chat.completions.create(**kwargs))
        found = re.search(r"\{[^}]*\}", text or "")
        data = json.loads(found.group(0)) if found else {}
    except Exception as exc:  # noqa: BLE001
        logger.info("Generation years for %s %s unavailable: %s", model, code, exc)
        return None
    low, high = data.get("from"), data.get("to")
    this_year = datetime.date.today().year
    if (
        isinstance(low, int)
        and isinstance(high, int)
        and 1950 <= low <= high <= this_year
    ):
        return low, high
    return None


def years_for(conn, model, code, ask=_ask_years):
    """(from, to) build years of a generation, cached; None when unknown."""
    row = conn.execute(
        "SELECT year_from, year_to FROM model_generations WHERE model = ? AND generation = ?",
        (model.lower(), code.upper()),
    ).fetchone()
    if row:
        return (row[0], row[1]) if row[0] else None
    years = ask(model, code)
    conn.execute(
        "INSERT OR REPLACE INTO model_generations (model, generation, year_from, year_to, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            model.lower(),
            code.upper(),
            years[0] if years else None,
            years[1] if years else None,
            datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        ),
    )
    return years


def registration_year(details):
    """The first-registration year from the listing's details, or None."""
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except ValueError:
            return None
    match = re.search(r"(19|20)\d{2}", str((details or {}).get("Erstzulassung", "")))
    return int(match.group(0)) if match else None


def judge_generation(title, details, code, years):
    """("no", reason) when the offer is another generation; ("open", reason)
    when nothing says which; (None, "") when it fits."""
    other = [
        w
        for w in re.findall(r"\b[a-z]{1,3}\d{1,3}\b", str(title).lower())
        if w != code.lower() and w[:2] == code.lower()[:2]
    ]
    if code.lower() in str(title).lower().split():
        return None, ""
    if other:
        return "no", f"{other[0].upper()} statt {code}"
    year = registration_year(details)
    if years and year:
        # One year of slack each way: the model's years are not always exact
        # (it gave SC57 as 2004-2005; it ran to 2007) and a bike can be
        # registered a year after it was built.
        if year < years[0] - 1 or year > years[1] + 1:
            return "no", f"Baujahr {year}, {code} ist {years[0]}–{years[1]}"
        return None, ""
    return "open", f"Generation {code} nicht bestätigt"
