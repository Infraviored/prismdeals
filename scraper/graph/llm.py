"""The one way the graph asks a model. No answer is an error, never a guess."""

import json
import logging
import re

logger = logging.getLogger(__name__)


class NoModel(RuntimeError):
    """The model could not be asked or gave no usable answer."""


def ask_json(prompt, max_tokens=2000):
    """The model's answer parsed as JSON; raises NoModel otherwise."""
    try:
        from agent_worker import build_llm_kwargs, client, get_response_text
    except Exception as exc:  # noqa: BLE001 -- no model configured
        raise NoModel(f"KI nicht erreichbar ({exc})") from exc
    try:
        kwargs = build_llm_kwargs(
            [{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.0,
        )
        text = get_response_text(client.chat.completions.create(**kwargs)) or ""
    except Exception as exc:  # noqa: BLE001
        raise NoModel(f"KI nicht erreichbar ({exc})") from exc
    return parse_json(text)


def parse_json(text):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(text or "").strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        found = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
        if not found:
            raise NoModel("Die KI-Antwort war kein JSON.") from None
        try:
            return json.loads(found.group(0))
        except json.JSONDecodeError as exc:
            raise NoModel("Die KI-Antwort war kein JSON.") from exc
