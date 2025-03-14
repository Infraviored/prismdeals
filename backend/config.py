import os
from backend.config_loader import get_openai_config

# Get OpenAI configuration
openai_config = get_openai_config()

# Use API key from config or environment variable
API_KEY = openai_config.get("api_key") or os.environ.get("OPENAI_API_KEY", "")

# Scraping settings
MAX_LISTINGS_PER_PAGE = 50
DELAY_BETWEEN_PAGES = 2
DELAY_BETWEEN_LISTINGS = 2

# LLM settings
LLM_MODEL = openai_config.get("model", "gpt-4o-mini")
PRINT_PROMPT = False

PAGES_TO_SCRAPE = 2