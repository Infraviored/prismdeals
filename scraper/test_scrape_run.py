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
    monkeypatch.setattr(scraper, "fetch", lambda url: Page())
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
