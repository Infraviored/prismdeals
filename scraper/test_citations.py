import citations

ANSWER = """## Fragen an den Verkäufer

3. „Gab es Stürze oder Rennstreckeneinsätze?" Quellen: https://www.adac.de/motorrad-gebrauchtkauf/, https://www.1000ps.de/modellnews-id-3008769-yamaha-yzf-r1-rn19.[1][18]
4. „Wurde die Lichtmaschine geprüft?" Quellen: [), [).[2][5]

**Honda SC57 – Lichtmaschine:** Besonders für 2004/05 sind fehlerhafte Wicklungen beschrieben. Quellen: [), [).[2][5]

Citations:
[1] Yamaha YZF-R1 RN19 (2007-2008) Gebrauchtberatung https://www.1000ps.de/modellnews-id-3008769-yamaha-yzf-r1-rn19-2007-2008-gebrauchtberatung
[2] Gebrauchte Honda Fireblade SC57 und SC59 - Motorrad https://www.motorradonline.de/ratgeber/gebrauchtberatung-honda-fireblade/
[5] Honda CBR1000RR Fireblade SC57: Gebrauchtberatung https://www.1000ps.de/modellnews-id-3006909-honda-cbr1000rr
[18] Motorrad-Gebrauchtkauf https://www.adac.de/motorrad-gebrauchtkauf/
"""


def test_footnotes_become_the_urls_they_stand_for():
    text = citations.resolve(ANSWER)
    assert "Citations" not in text
    assert "[1]" not in text and "[)" not in text
    line = next(x for x in text.splitlines() if "Lichtmaschine geprüft" in x)
    assert citations.urls_in(line) == [
        "https://www.motorradonline.de/ratgeber/gebrauchtberatung-honda-fireblade/",
        "https://www.1000ps.de/modellnews-id-3006909-honda-cbr1000rr",
    ]


def test_a_statement_keeps_no_debris():
    text = citations.resolve(ANSWER)
    line = next(x for x in text.splitlines() if "Honda SC57" in x)
    statement = citations.clean_statement(line)
    assert statement == (
        "Honda SC57 – Lichtmaschine: Besonders für 2004/05 sind fehlerhafte "
        "Wicklungen beschrieben."
    )


def test_a_url_loses_the_full_stop_glued_to_it():
    assert citations.urls_in("siehe https://example.org/a.") == [
        "https://example.org/a"
    ]


def test_a_classified_statement_is_clean_and_keeps_its_sources():
    from graph import knowledge

    claim = knowledge._clean(
        {
            "kind": "weakness",
            "statement": "**Lichtmaschine** schwach. Quellen: [), [).",
            "check_path": "ask",
            "weight": "costly",
            "sources": ["https://a.example/x"],
        }
    )
    assert claim["statement"] == "Lichtmaschine schwach."
    assert claim["sources"] == ["https://a.example/x"]
