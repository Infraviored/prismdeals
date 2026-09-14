# Plan: Suchfamilien — eine Suche über mehrere Modelle

## Die Aufgabe

Ein Käufer will einen S/W-Laserdrucker mit Duplex-ADF. Welcher es wird, ist ihm
egal — es kommen ungefähr ein Dutzend Modelle in Frage:

    Brother MFC-L2740DW          HP LaserJet Pro MFP M426fdw
    Brother MFC-L2750DW          HP LaserJet Pro MFP M427fdw
    Brother MFC-L5750DW          HP LaserJet Pro MFP M428fdw
    Canon i-SENSYS MF426dw       Kyocera ECOSYS M2640idw
    Canon i-SENSYS MF445dw       …

Heute ist das ein Dutzend getrennter Suchen, ein Dutzend Feeds, und die Arbeit,
sie im Kopf zusammenzuhalten. Das Produkt soll daraus **eine** Suche machen: eine
Liste, in der alle Modelle nebeneinander stehen und man sieht, welches Modell
einen Treffer erzeugt hat.

Das ist kein Sonderfall für Drucker. Es ist die Normalform jedes Kaufs, bei dem
das Bedürfnis konkreter ist als das Produkt.

**Diese Runde baut nur die Familie.** Bewertung, Scoring und KI bleiben
unangetastet — sie sind das nächste Thema, nicht dieses.

---

## Was schon da ist (verifiziert)

Bevor irgendetwas Neues entsteht: der Korridor hat dieses Problem bereits gelöst,
nur auf der anderen Achse.

| | |
|---|---|
| `db/schema.sql` | `searches.url` ist **UNIQUE**. Eine URL, eine Zeile. `enabled` ist der Aktiv/Passiv-Schalter. |
| `scraper/main.py:364-368` | Der Crawl liest `SELECT id, url FROM searches WHERE enabled = 1`. Mehr weiß er nicht. |
| `scraper/route_store.py` | Modulkommentar: *„Eine Routensuche ist keine neue Art von Suche. Sie ist eine Kaufabsicht, ausgedrückt als mehrere gewöhnliche Suchen — eine pro Kreis."* Genau das braucht die Familie, nur pro **Begriff** statt pro **Ort**. |
| `scraper/route_store.py:130-220` | `attach_circles` legt pro Kreis eine `searches`-Zeile an, benutzt eine vorhandene wieder, wenn die URL schon existiert, und **meldet Konflikte**, wenn die wiederbenutzte Zeile etwas anderes bedeutet (andere Wissensbasis, andere Kampagne, deaktiviert). |
| `scraper/route_search.py:80-97` | `with_location(url, location_id, radius_km)` schreibt den Schwanz `k0c278l6411r25` um. Der lesbare Pfad davor ist Dekoration. |
| `scraper/main.py:424` | `INSERT OR IGNORE INTO listings (… , search_id)` — **wer zuerst findet, gewinnt.** |

Die URL-Grammatik, abgelesen an den 16 echten Zeilen in `searches`:

    /s-<ort-slug>/[preis:a:b/]<suchbegriff-slug>/k0[c<kategorie>]l<ort>r<radius>
     └─ Dekoration ┘└ Filter ─┘└─ DAS hier ────┘└─── der Schwanz ────────────┘

`with_location` fasst den Schwanz an. Die Familie fasst das Segment davor an.
Das ist die ganze technische Neuheit.

---

## Die drei Stellen, an denen es heute bricht

Nicht „könnte brechen" — das sind die Punkte, an denen die vorhandene Struktur
eine Familie nicht tragen kann.

### 1. Ein Treffer kann nur einer Suche gehören

`listings.search_id` ist **ein** Fremdschlüssel, und der Import ist
`INSERT OR IGNORE` (`scraper/main.py:424`). Ein Brother MFC-L2740DW, der zuerst
über den Kreis „Landsberg" gefunden wird, behält diesen `search_id` für immer.
Wird dasselbe Gerät später über einen zweiten Begriff derselben Familie gefunden,
passiert nichts.

Beim Korridor fiel das nicht auf: alle Kreise meinen dasselbe Produkt, also ist
egal, welcher gewinnt. Bei einer Familie ist **genau das die Information**, die
der Nutzer sehen will — welches Modell das ist.

Die Beziehung Anzeige ↔ Suche muss n:m werden.

### 2. Das Kreuzprodukt

Eine Familie fächert auf Begriffen auf, ein Korridor auf Orten. Zusammen
multiplizieren sie sich:

    10 Modelle × 6 Kreise = 60 Suchen × PAGES_TO_SCRAPE Seiten

Bei `DELAY_BETWEEN_PAGES` zwischen den Seiten ist das kein Detail, sondern die
Laufzeit des Crawls. Der Nutzer muss diese Zahl **sehen, bevor er speichert** —
so wie die Korridor-Vorschau heute die Kreiszahl zeigt
(`POST /api/route-searches/preview`, `backend/server.js:619`).

### 3. Wem gehört eine geteilte `searches`-Zeile?

`searches.url` ist UNIQUE. Zwei Familien, die beide `hp-m426fdw` am selben Ort
suchen, teilen sich eine Zeile. Schaltet eine Familie auf passiv, darf die andere
nicht mit abgeschaltet werden.

`route_store` löst das halb: es *meldet* den Konflikt, aber `enabled` bleibt ein
freies Feld, das jeder überschreiben kann. Mit Familien wird das der Normalfall.

---

## Der Entwurf

### Eine Achse mehr, kein zweiter Mechanismus

Der Korridor macht aus einer Absicht viele Suchen, indem er **Orte** erzeugt. Die
Familie macht dasselbe mit **Begriffen**. Die richtige Antwort ist nicht ein
zweiter Fächer neben dem ersten, sondern ein gemeinsames Kreuzprodukt:

```
   Begriffe                 Orte                     searches
   ────────                 ────                     ────────
   MFC-L2740DW    ×     Landsberg r26       →    10 × 6 = 60 URLs
   MFC-L2750DW          Erkheim r29                     │
   M426fdw              Leutkirch r28                   ▼
   …                    …                          ein Feed
```

* Eine Familie **ohne** Route = Begriffe × [der Ort der Basis-URL] → n Suchen
* Eine Route **ohne** Familie = [der Begriff der Basis-URL] × Kreise → n Suchen  *(heute)*
* Beides = das volle Kreuzprodukt

Ein Codepfad, nicht zwei. Die heutige Route wird zum Sonderfall „eine Begriffs­zeile".

### Die URL-Grammatik bekommt ein eigenes Modul

`parse_tail`, `with_location` und das neue `with_query` gehören zusammen und
werden jetzt von zwei Features gebraucht. Sie ziehen aus `scraper/route_search.py`
nach **`scraper/search_url.py`**; `route_search.py` importiert sie von dort.
`test_route_search.py` bleibt grün — die Funktionen ändern sich nicht, nur ihr
Zuhause.

```python
def with_query(url, term):
    """Setzt den Suchbegriff einer Such-URL neu."""
```

**Die Regel, welches Segment der Begriff ist** (an den echten URLs abgelesen):
Das letzte Pfadsegment vor dem Schwanz — es sei denn, dieses Segment

* beginnt mit `s-` (dann ist es der Ort-Slug, und es gibt gar keinen Begriff), oder
* enthält `:` (dann ist es ein Filter wie `preis:10:100` oder `anbieter:privat`).

Trifft eine der beiden Bedingungen zu, wird der Begriff **eingefügt** statt
ersetzt — direkt vor dem Schwanz.

Die Normalisierung eines Modellnamens zum Slug: Kleinschreibung, Leerzeichen zu
`-`, Satzzeichen weg, Mehrfach-`-` zusammenziehen.
`"Brother MFC-L2740DW"` → `brother-mfc-l2740dw`. Gegenprobe an den vorhandenen
Zeilen: `matratze 140x200` → `matratze-140x200` ✓, `ikea brimnes kleiderschrank`
→ `ikea-brimnes-kleiderschrank` ✓.

> **Vor dem Bauen live gegenprüfen.** Drei Fälle, je eine Anfrage, **mindestens
> 1 Sekunde Abstand** (die Seite sperrt bei Volumen):
> 1. Begriff ersetzen: `…/matratze-140x200/k0l7091r26` → `…/brother-mfc-l2740dw/k0l7091r26`
> 2. Begriff einfügen, wo keiner war: `/s-notebooks/k0c278l6411`
> 3. Begriff hinter einem Preisfilter: `…/preis:10:100/kleiderschrank-ikea/k0l7091r31`
>
> Geprüft wird, dass die Trefferseite den neuen Begriff im Suchfeld anzeigt und
> plausible Treffer liefert. Wenn die Grammatik anders liegt als hier beschrieben:
> **die Messung gewinnt, nicht dieser Plan** — dann den Plan korrigieren und
> weiterbauen.

### Schema

Additiv, `IF NOT EXISTS`, nach den Regeln im Kopf von `db/schema.sql`. Keine
Fremdschlüssel auf den Verknüpfungstabellen — genau wie `route_search_circles`,
und aus demselben Grund: SQLite kann sie einer existierenden Tabelle nicht
nachträglich geben, und das Löschen läuft ohnehin explizit.

```sql
CREATE TABLE IF NOT EXISTS search_families (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    campaign_id      INTEGER,
    knowledge_set_id INTEGER,
    base_url         TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_family_terms (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    term      TEXT NOT NULL,   -- was in die URL geht
    label     TEXT,            -- was der Mensch liest
    enabled   INTEGER NOT NULL DEFAULT 1,
    position  INTEGER NOT NULL DEFAULT 0
);

-- Welche searches-Zeilen zu (Familie, Begriff) gehören. Die Zeile kann geteilt
-- sein: dieselbe URL kann mehreren Familien gehören.
CREATE TABLE IF NOT EXISTS search_family_searches (
    family_id INTEGER NOT NULL,
    term_id   INTEGER NOT NULL,
    search_id INTEGER NOT NULL,
    PRIMARY KEY (family_id, term_id, search_id)
);

-- Punkt 1: die n:m-Beziehung, die listings.search_id nicht sein kann.
CREATE TABLE IF NOT EXISTS listing_search_hits (
    listing_id    TEXT NOT NULL,
    search_id     INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    PRIMARY KEY (listing_id, search_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_search_hits_search
    ON listing_search_hits (search_id);
```

Und eine Spalte an einer bestehenden Tabelle, also per `ALTER` im unteren
Abschnitt der Datei:

```sql
ALTER TABLE route_searches ADD COLUMN family_id INTEGER;
```

`listings.search_id` **bleibt** und wird weiter gesetzt — „die Suche, die sie
zuerst gefunden hat". Alle bestehenden Abfragen funktionieren unverändert. Neu
ist nur, dass es daneben die vollständige Antwort gibt.

**Backfill** in einem einmaligen `scripts/backfill_listing_hits.py`, nicht in
`schema.sql`: die Datei läuft bei **jeder** Verbindung, und ein `INSERT … SELECT`
über die ganze `listings`-Tabelle bei jedem Verbindungsaufbau ist genau die Art
Kosten, die bei 500.000 Zeilen wehtut.

```sql
INSERT OR IGNORE INTO listing_search_hits (listing_id, search_id, first_seen_at)
SELECT id, search_id, COALESCE(last_description_changed_at, datetime('now'))
FROM listings WHERE search_id IS NOT NULL;
```

### Der Import schreibt beide

`scraper/main.py:421-437`: nach dem `INSERT OR IGNORE INTO listings` zusätzlich

```sql
INSERT OR IGNORE INTO listing_search_hits (listing_id, search_id, first_seen_at)
VALUES (?, ?, ?)
```

Das `OR IGNORE` ist hier richtig und bedeutet etwas anderes als oben: der
Erstfund-Zeitpunkt pro (Anzeige, Suche) wird nicht überschrieben.

### Aktiv/Passiv, ohne dass Familien sich gegenseitig abschalten

Eine Regel, überall dieselbe:

> Eine `searches`-Zeile ist **enabled**, wenn mindestens ein aktiver Eigentümer
> sie will. Eine Zeile **ohne** Eigentümer ist von Hand angelegt und wird nie
> automatisch umgeschaltet.

Eigentümer sind Zeilen in `search_family_searches` (über Familie + Begriff) und
in `route_search_circles`. Nach jedem Umschalten einer Familie oder eines
Begriffs wird `enabled` für die betroffenen `searches`-Zeilen neu berechnet —
nicht gesetzt. Eine Funktion, ein Ort:

```python
def recompute_enabled(conn, search_ids): ...
```

### `family_store.py`

Neu, direkt nach dem Vorbild von `route_store.py` — gleiche Aufteilung
(`save_*` / `attach_*`), gleiche Konfliktbehandlung, gleicher Modulkommentar-Stil,
der sagt *warum*:

* `save_family(conn, name, base_url, terms, …) -> (family_id, conflicts)`
* `attach_terms(conn, family_id, terms, circles=None) -> conflicts`
  — erzeugt das Kreuzprodukt; ohne `circles` ist es eine Liste mit einem Eintrag,
  nämlich dem Ort der Basis-URL
* `expand(base_url, terms, circles) -> [(term_id, url, label)]` — rein, ohne
  Datenbank, damit das Kreuzprodukt für die **Vorschau** berechnet werden kann,
  ohne etwas zu schreiben

`route_store.attach_circles` ruft für seine Kreise künftig dieselbe `expand` auf.
Hat die Route kein `family_id`, ist die Begriffsliste einelementig und das
Ergebnis ist bit-identisch zu heute — das ist die Abnahmebedingung für diesen
Umbau.

---

## Die HTTP-Schnittstelle (eingefroren)

Damit Backend und Frontend parallel gebaut werden können, steht der Vertrag hier
fest. Wer ihn ändern will, ändert erst diesen Abschnitt.

```
POST /api/search-families/preview
  → { base_url, terms: ["Brother MFC-L2740DW", …], route_search_id?: 12 }
  ← { terms: 10, circles: 6, searches: 60,
      new_searches: 47, reused_searches: 13,
      pages: 120, estimated_seconds: 240,
      urls: [{ term, label, url, exists: bool }, …],
      conflicts: [{ url, search_id, label, reasons: [...] }] }
  Schreibt nichts.

POST /api/search-families
  → { name, base_url, campaign_id?, knowledge_set_id?, route_search_id?,
      terms: [{ term, label? }, …] }
  ← { id, searches: 60, conflicts: [...] }

GET  /api/search-families?campaign_id=
  ← [{ id, name, enabled, terms: n, searches: n, listings: n }]

GET  /api/search-families/:id
  ← { id, name, base_url, enabled, route_search_id,
      terms: [{ id, term, label, enabled, listings: n }] }

PUT  /api/search-families/:id
  → { name?, enabled?, terms: [{ id?, term, label?, enabled }] }
  ← { id, searches: n, added: n, removed: n, conflicts: [...] }
  Ein Begriff, der verschwindet, löscht keine Anzeigen — seine searches-Zeilen
  verlieren nur diesen Eigentümer und werden per recompute_enabled neu bewertet.

DELETE /api/search-families/:id
  Löscht die Familie und ihre Eigentümerschaften, nie Anzeigen, nie geteilte
  searches-Zeilen, die noch jemand anderem gehören.

GET  /api/search-families/:id/listings?limit=&offset=
  ← { total, listings: [{ …listing, matched_terms: [{ id, label }] }] }
  Dedupliziert über listing_search_hits. matched_terms ist der Grund, aus dem
  dieses Feature existiert — nie weglassen, auch nicht, wenn es leer wäre.
```

---

## Frontend

**Familie anlegen.** Ein Textfeld für den Namen, ein Textbereich für die Modelle
— **eine Zeile pro Modell**. Der Nutzer kommt mit einer Liste aus einer Tabelle
oder einem Chat; Einfügen muss in einem Zug funktionieren und darf nicht
verlangen, zehnmal auf „+" zu klicken. Nach dem Einfügen werden die Zeilen zu
einzeln löschbaren Einträgen.

**Die Multiplikation vor dem Speichern zeigen.** Nicht als Warnung, sondern als
Tatsache:

    10 Modelle × 6 Kreise = 60 Suchen · 13 davon laufen schon · ca. 4 Minuten

Der Speichern-Knopf bleibt inaktiv, solange die Basis-URL fehlt oder kein Begriff
dasteht, und sagt daran, **warum** er inaktiv ist — dieselbe Regel, die der
Korridor-Planer schon befolgt.

**Die Liste.** Der vorhandene `RouteResultsView` ist der Ort: 76px-Zeilen,
Umweg-Spalte, `geo_status`-Behandlung. Neu ist eine Zeile darunter oder ein
Kürzel in der Zeile, das sagt, **über welches Modell** dieser Treffer kam. Ohne
das ist eine Familienliste nur eine längere Liste.

Filter nach Begriff: die Begriffe der Familie als Zeile von Schaltern über der
Liste, jeder mit seiner Trefferzahl. Alle an = alles.

Texte über `translations.ts`, **de und en**, sonst bricht `tsc -b`.

---

## Was diese Runde nicht macht

* **Bewertung.** Kein Scoring pro Familie, keine geteilte Wissensbasis über die
  Begriffe hinweg, keine KI. Das ist das nächste Thema.
* **Vorschlagen von Familienmitgliedern.** Der Nutzer bringt seine Liste mit.
* **Identity/Dossiers.** `scraper/identity.py` bleibt unberührt.
* **Mehrbenutzer.** Gruppe E in `PROPOSALS.md`, ausdrücklich zuletzt.

---

## Abnahme

```bash
# Die Route verhält sich exakt wie vorher, wenn keine Familie im Spiel ist
buildlock ./venv/bin/pytest scraper/ -q

# Neue Tests, die es geben muss:
#   search_url:   ersetzen / einfügen / hinter Filter / kaputte URL
#   family_store: Kreuzprodukt, Wiederverwendung, Konflikte,
#                 recompute_enabled mit zwei Eigentümern
#   listing_search_hits: zweiter Fund derselben Anzeige legt eine zweite
#                        Zeile an und lässt listings.search_id in Ruhe

cd frontend && npm run build && npm run lint && npm test
./venv/bin/python scripts/ui_shots.py --width 390
```

Ein Test, der nicht fehlschlägt, wenn man die Korrektur zurücknimmt, prüft
nichts. Jeden neuen Test **einmal gegen absichtlich kaputten Code laufen lassen**
und erst dann behalten.

---

## Harte Regeln für diese Arbeit

* **Niemals in `data/scraper.db` schreiben.** Das ist die Live-Datenbank; sie ist
  in diesem Projekt schon zweimal zerstört worden. Lesen nur mit
  `file:data/scraper.db?mode=ro`, Schreiben nur gegen eine Kopie über
  `PRISMDEALS_DB`.
* **Niemals `backend/db_setup.js --recreate`.**
* `pytest` und schwere `npm`-Läufe durch **`buildlock`**.
* Anfragen an kleinanzeigen.de: **höchstens eine pro Sekunde**, und nur die im
  Abschnitt zur URL-Grammatik genannten Gegenproben.
* Kein Schlüssel, kein Passwort, kein Inhalt von `scraper/config.py` in Logs,
  Commits, Dokumente oder Ausgaben.
* `db/schema.sql` nur **erweitern**: `IF NOT EXISTS`, neue Spalten per `ALTER`
  im unteren Abschnitt, nie in ein bestehendes `CREATE TABLE` hinein.
