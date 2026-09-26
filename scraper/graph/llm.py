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


# A backslash JSON does not know ("\d" in a regex reader): meant literally.
_LONE_BACKSLASH = re.compile(r'\\(?![\\"/bfnrtu])')


def parse_json(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "").strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    text = _LONE_BACKSLASH.sub(r"\\\\", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        found = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
        try:
            return json.loads(found.group(0) if found else text)
        except json.JSONDecodeError as exc:
            logger.warning("Model answer is no JSON (%s): %s", exc, text[-600:])
            raise NoJSON("Die KI-Antwort war kein JSON.") from exc
