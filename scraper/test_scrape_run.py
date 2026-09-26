"""What a run hands back to its caller.

main.py reads the file, not the return value. So whatever the run means the
caller to import has to be in the file -- known listings included, because
"known" means known to the database, not known to this search.
"""

import json

import scraper


PAGE = """
<ul id="srchrslt-adtable">
  <article data-adid="111" data-href="/s-anzeige/111">
    <h2><a>Corsair Vengeance LPX 32GB</a></h2>
    <p class="aditem-main--middle--price-shipping--price">120 &euro; VB</p>
  </article>
  <article data-adid="222" data-href="/s-anzeige/222">
    <h2><a>Corsair Vengeance LPX 16GB</a></h2>
    <p class="aditem-main--middle--price-shipping--price">60 &euro;</p>
  </article>
</ul>
"""


class Page:
    status_code = 200
    text = PAGE


def run(tmp_path, monkeypatch, known):
    monkeypatch.setattr(scraper, "PAGES_TO_SCRAPE", 1)
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_PAGES", 0)
    monkeypatch.setattr(scraper, "fetch", lambda url, caller=None, timeout=10: Page())
    monkeypatch.setattr(scraper, "_stored_listing_ids", lambda: set(known))
    monkeypatch.setattr(scraper, "_refresh_known", lambda listings: None)

    out = tmp_path / "scraped.json"
    returned = scraper.scrape_listings_requests(
        ["https://www.kleinanzeigen.de/s-corsair/k0"], str(out)
    )
    return returned, json.loads(out.read_text(encoding="utf-8"))


def test_a_known_listing_still_reaches_the_caller(tmp_path, monkeypatch):
    """The whole point of the known branch: it belongs to *this* search too.

    Writing only the new ones while returning both is why a listing another
    search had found first never got a listing_search_hits row and stayed
    invisible in the search that had just found it.
    """
    returned, written = run(tmp_path, monkeypatch, known={"111"})

    assert [item["id"] for item in written] == ["111", "222"]
    assert [item["id"] for item in returned] == ["111", "222"]


def test_the_file_and_the_return_value_say_the_same_thing(tmp_path, monkeypatch):
    returned, written = run(tmp_path, monkeypatch, known=set())

    assert written == returned


def test_a_run_that_finds_nothing_new_still_reports_what_it_saw(tmp_path, monkeypatch):
    returned, written = run(tmp_path, monkeypatch, known={"111", "222"})

    assert [item["id"] for item in written] == ["111", "222"]


def test_a_refused_run_says_so_instead_of_reporting_an_empty_search(
    tmp_path, monkeypatch
):
    """A 429 is our problem; a search with no results is the buyer's.

    Reporting the first as the second is how a rate-limited run finished
    "successfully" with nothing in it and the buyer believed the search was
    empty.
    """
    import pytest

    class Refused:
        status_code = 429
        text = ""

    monkeypatch.setattr(scraper, "PAGES_TO_SCRAPE", 1)
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_PAGES", 0)
    monkeypatch.setattr(scraper, "RETRY_WAITS", ())
    monkeypatch.setattr(
        scraper, "fetch", lambda url, caller=None, timeout=10: Refused()
    )
    monkeypatch.setattr(scraper, "_stored_listing_ids", lambda: set())

    with pytest.raises(scraper.ScrapeRefused):
        scraper.scrape_listings_requests(
            ["https://www.kleinanzeigen.de/s-corsair/k0"],
            str(tmp_path / "scraped.json"),
        )


def test_it_retries_a_refusal_before_giving_up(tmp_path, monkeypatch):
    answers = []

    class Refused:
        status_code = 429
        text = ""

    def flaky(url, caller=None, timeout=10):
        answers.append(url)
        return Refused() if len(answers) < 3 else Page()

    monkeypatch.setattr(scraper, "PAGES_TO_SCRAPE", 1)
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_PAGES", 0)
    monkeypatch.setattr(scraper, "RETRY_WAITS", (0, 0, 0))
    monkeypatch.setattr(scraper, "fetch", flaky)
    monkeypatch.setattr(scraper, "_stored_listing_ids", lambda: set())
    monkeypatch.setattr(scraper, "_refresh_known", lambda listings: None)

    returned = scraper.scrape_listings_requests(
        ["https://www.kleinanzeigen.de/s-corsair/k0"], str(tmp_path / "scraped.json")
    )

    assert len(answers) == 3, "it waited and asked again rather than giving up"
    assert [item["id"] for item in returned] == ["111", "222"]


def test_a_page_that_repeats_the_last_one_ends_the_search(tmp_path, monkeypatch):
    """Past its last page the site shows that page again: fetching more is waste."""
    fetched = []
    monkeypatch.setattr(scraper, "DELAY_BETWEEN_PAGES", 0)
    monkeypatch.setattr(
        scraper,
        "fetch",
        lambda url, caller=None, timeout=10: fetched.append(url) or Page(),
    )
    monkeypatch.setattr(scraper, "_stored_listing_ids", lambda: set())
    monkeypatch.setattr(scraper, "_refresh_known", lambda listings: None)
    scraper.scrape_listings_requests(
        ["https://www.kleinanzeigen.de/s-corsair/k0"], str(tmp_path / "o.json"), pages=6
    )
    assert len(fetched) == 2
