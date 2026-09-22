API_KEY = "YOUR_API_KEY"

# LLM provider endpoint. Any OpenAI-compatible chat-completions endpoint works.
# Leave as None to use OpenAI directly, or point at a gateway, e.g.
#   "https://openrouter.ai/api/v1"
API_BASE_URL = None

# Scraping settings
MAX_LISTINGS_PER_PAGE = 50
DELAY_BETWEEN_PAGES = 2
DELAY_BETWEEN_LISTINGS = 2

# LLM settings
#
# Extraction is reading, not thinking: the model copies facts out of a listing.
# Measured on one memory listing, same model, same prompt:
#
#   deepseek-v4-flash, 32000 tokens                31.0 s   1747 out
#   deepseek-v4.1-flash:nitro, 3000                 6.9 s   1893 out
#   deepseek-v4.1-flash:nitro, reasoning off        0.8 s    311 out
#   deepseek-v4.1-flash without :nitro            133.5 s
#
# So two settings carry almost all of it. `:nitro` asks OpenRouter for the
# fastest provider of a model rather than the cheapest, and turning reasoning
# off stops the model spending its budget thinking about a copying task. Fifty
# listings go from over twenty-five minutes to under a minute.
LLM_MODEL = "deepseek/deepseek-v4.1-flash:nitro"

# Reasoning tokens count against max_tokens, so a reasoning model with a small
# cap returns nothing at all -- an empty completion with finish_reason=length.
# Off is right for extraction. Set to "low" or "medium" for work that genuinely
# needs the model to weigh something.
LLM_REASONING = False

# Enough for a full fact sheet and no more. With reasoning off, extraction
# answers in 300-600 tokens.
LLM_MAX_TOKENS = 1500

PRINT_PROMPT = False

PAGES_TO_SCRAPE = 2
