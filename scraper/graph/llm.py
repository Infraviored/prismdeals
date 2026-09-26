"""The one way the graph asks a model. No answer is an error, never a guess."""

import json
import logging
import re

logger = logging.getLogger(__name__)


class NoModel(RuntimeError):
    """The model could not be asked or gave no usable answer."""


class NoJSON(NoModel):
    """The model answered, but not with JSON -- cut off by the token limit
    after a runaway regex, most often. Asking again can help; an outage not."""


def ask_json(prompt, max_tokens=2000):
    """The model's answer parsed as JSON; raises NoModel otherwise."""
    try:
        from llm_client import build_llm_kwargs, client, get_response_text
    except Exception as exc:  # noqa: BLE001 -- no model configured
        logger.warning("No model client: %s", exc)
        raise NoModel("KI nicht erreichbar.") from exc
    try:
        kwargs = build_llm_kwargs(
            [{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.0,
        )
        text = get_response_text(client.chat.completions.create(**kwargs)) or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("Model call failed: %s", exc)
        raise NoModel("KI nicht erreichbar.") from exc
    return parse_json(text)


# Escapes read in pairs: a backslash JSON does not know ("\d" in a regex
# reader) is meant literally; a valid one ("\\d") stays as it is.
_ESCAPE = re.compile(r"\\(.?)", re.DOTALL)


def _repaired(text):
    return _ESCAPE.sub(
        lambda m: m.group(0)
        if m.group(1) and m.group(1) in '\\"/bfnrtu'
        else "\\\\" + m.group(1),
        text,
    )


def parse_json(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "").strip())
    # Words around the JSON ("Hier ist das JSON:") are cut away first.
    found = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
    body = found.group(0) if found else text
    error = None
    for candidate in (body, _repaired(body)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            error = exc
    logger.warning("Model answer is no JSON (%s): %s", error, text[-600:])
    raise NoJSON("Die KI-Antwort war kein JSON.") from error
