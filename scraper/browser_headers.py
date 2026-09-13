"""Consolidated browser headers and modern User-Agent strings.

Three copies of a hardcoded Firefox 120 (November 2023) string previously existed
in scraper.py, route_search.py, and dossiers.py. A static UA that ages into
something implausible is a ban trigger against Akamai / Cloudflare bot protection.
"""

import random

# Modern plausible browser user-agents
USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:135.0) Gecko/20100101 Firefox/135.0",
]

DEFAULT_USER_AGENT = USER_AGENTS[0]


def get_user_agent(rotate=False):
    """Return a modern browser user agent."""
    if rotate:
        return random.choice(USER_AGENTS)
    return DEFAULT_USER_AGENT


def make_headers(accept=None, accept_language=None, user_agent=None, rotate_ua=False):
    """Generate headers with modern defaults."""
    ua = user_agent or get_user_agent(rotate=rotate_ua)
    headers = {
        "User-Agent": ua,
        "Accept": (
            accept
            or "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": accept_language or "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    return headers


# Pre-built standard header sets used across modules
DEFAULT_BROWSER_HEADERS = make_headers()
JSON_HEADERS = make_headers(
    accept="application/json,text/javascript,*/*;q=0.8",
    accept_language="de-DE,de;q=0.9,en;q=0.8",
)
DOSSIER_HEADERS = make_headers(
    accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    accept_language="de-DE,de;q=0.9,en;q=0.8",
)
