"""The one model client: an OpenAI-compatible endpoint from config.py.

base_url stays None for OpenAI itself; pointing it at a compatible gateway
(OpenRouter) is enough to switch providers. graph/llm.py and compare.py ask
through this module.
"""

import logging
import os

from openai import OpenAI

from config import API_KEY, LLM_MODEL

try:
    from config import API_BASE_URL
except ImportError:
    # Older config.py files predate the configurable endpoint.
    API_BASE_URL = None

logger = logging.getLogger(__name__)

openai_key = os.environ.get("OPENAI_API_KEY") or API_KEY
openai_base_url = os.environ.get("OPENAI_BASE_URL") or API_BASE_URL
client = OpenAI(api_key=openai_key, base_url=openai_base_url or None)


def _is_openai_reasoning_model(model=LLM_MODEL):
    """OpenAI's reasoning models reject `temperature` and rename the token cap."""
    return "gpt-5" in model or model.startswith("o1") or model.startswith("o3")


def get_response_text(response):
    """Returns the assistant text, tolerating an empty completion.

    Reasoning models (e.g. deepseek-v4-flash) spend part of the token budget on
    internal reasoning and return `content: None` when the cap is hit before any
    visible text is produced. Callers used to dereference `.strip()` on that None
    and die with an AttributeError, so normalise it to an empty string here and
    let the existing validation/retry path handle it.
    """
    choice = response.choices[0]
    content = choice.message.content
    if not content:
        logger.warning(
            "Model returned empty content (finish_reason=%s). "
            "This usually means max_tokens was exhausted by reasoning tokens.",
            getattr(choice, "finish_reason", "unknown"),
        )
        return ""
    return content.strip()


def _reasoning_setting():
    """How much the model should think, from config, defaulting to not at all.

    Extraction is reading rather than thinking, and reasoning tokens count
    against max_tokens -- so a reasoning model with a sane cap returns an empty
    completion with finish_reason=length, having spent the whole budget before
    writing a word. Measured on one listing: 31 s with reasoning, 0.8 s without,
    same JSON either way.
    """
    try:
        from config import LLM_REASONING
    except ImportError:
        return False
    return LLM_REASONING


def build_llm_kwargs(messages, max_tokens=None, temperature=0.0):
    """Builds chat-completion kwargs matching the configured model's dialect.

    Reasoning models take `max_completion_tokens` and no temperature; every other
    model (including those served via OpenRouter) takes `max_tokens`.
    """
    if max_tokens is None:
        try:
            from config import LLM_MAX_TOKENS

            max_tokens = LLM_MAX_TOKENS
        except ImportError:
            max_tokens = 1500

    kwargs = {"model": LLM_MODEL, "messages": messages}
    if _is_openai_reasoning_model():
        kwargs["max_completion_tokens"] = max_tokens
    else:
        kwargs["max_tokens"] = max_tokens
        kwargs["temperature"] = temperature

    reasoning = _reasoning_setting()
    if reasoning is False:
        kwargs["extra_body"] = {"reasoning": {"enabled": False}}
    elif reasoning:
        kwargs["extra_body"] = {"reasoning": {"effort": str(reasoning)}}
    return kwargs
