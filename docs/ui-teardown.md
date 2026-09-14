# Schonungslose UI-Analyse: Warum die Oberfläche so schlecht ist

**Status:** Analyse / Befundbericht  
**Referenz-Zustand:** Kampagne 6 („Drucker"), Suchfamilie „S/W-Laser mit Duplex-ADF", 13 Modellbegriffe, 13 aktive Suchen in `searches`, 0 Anzeigen (Treffer in 30 km um Landsberg = 0).

---

## 1. Das eine Strukturproblem, das die meisten Symptome erklärt

Das vernichtende Urteil des Eigentümers entsteht nicht durch eine Kette zufälliger CSS-Flüchtigkeitsfehler. Es ist das direkte Resultat einer **fundamentalen Fehlkonstruktion der Informationsarchitektur**:

> **Die Verwechslung von Begriffsachse („Was suche ich?") und Raumachse („Wo suche ich?") im Frontend.**

### Was die Domäne verlangt (Das Kreuzprodukt)
Im Architekturplan (`docs/plan-search-families.md:97-113`) ist das mathematische Modell präzise definiert:
```
Begriffe (Suchfamilie)  ×  Orte (Standort oder Route)  =  Suchen (URLs)
10 Modelle              ×  6 Kreise                    =  60 Suchen
```
Eine Kampagne besitzt immer eine **Begriffsdimension** (1 Modell vs. n Modelle einer Familie) und eine **Geometriedimension** (1 Standort-Kreis vs. n Kreise entlang einer Route). Beide Achsen sind orthogonal.

### Was das Frontend daraus gemacht hat (Die falsche Dreiteilung)
Im Frontend (`frontend/src/App.tsx:1765-1789`) wurde diese orthogonale Matrix zu einem **flachen, disjunkten Radio-Menü mit drei Optionen** verkrüppelt:
1. `point` („Standort-Suche")
2. `route` („Route / Korridor")
3. `family` („Suchfamilie")

```
                 [ Standort ]   [ Route ]   [ Suchfamilie ]
                      │             │              │
Geometrie:         1 Ort       Viele Orte      (unklar!)
Begriffe:         1 Begriff     1 Begriff     Viele Begriffe
```

Das führt zu drei katastrophalen Architekturfolgen:
1. **Vergewaltigung der Ansichten (`App.tsx:1432` und `1991`):** Das Frontend unterscheidet nur zwei Anzeige-Welten: Entweder den alten Anzeigen-Feed (`DashboardView`) oder die Korridor-Ansicht (`RouteResultsView`). Weil eine Suchfamilie mehrere Suchen erzeugt, presste man sie mit der Abfrage `(campaign.route_id || campaign.family_id)` gewaltsam in die **Korridor-Ansicht** (`RouteResultsView`). Eine Suchfamilie an einem festen Standort erbt dadurch das gesamte Vokabular und Verhalten einer Fahrtstrecke (Umweg-Spalten, Korridor-Texte, Strecken-Karten).
2. **Die Einbahnstraßen-Zustandsfalle (`App.tsx:1762`):** Die Umschaltung zwischen den Modi existiert ausschließlich, solange eine Kampagne noch gar keine Suchen hat (`activeSearches.length === 0`). Sobald eine Familie oder Route angelegt ist, sind Zeilen in `searches` vorhanden (`activeSearches.length = 13`). Der gesamte Konfigurationsbereich verschwindet für immer aus dem DOM.
3. **Zirkel-Routing im Editor (`App.tsx:1991`):** Wenn der Nutzer die Einstellungen einer Familie aufrufen will (`view === 'edit'`), prüft Zeile 1991 erneut `(route_id || family_id) && !showAiWizard` und rendert *wieder* die `RouteResultsView` statt des Formulars. Die Anwendung ist in einer Endlosschleife gefangen.

---

## 2. Die sieben Punkte im Detail (mit Beweis und Fundstelle)

### Punkt 1: Phantom-Behauptung „Korridor geplant" bei reiner Standort-Suche
* **Fundstelle:** `frontend/src/App.tsx:1432`, `frontend/src/components/RouteResultsView.tsx:647-649, 666`, `frontend/src/i18n/translations.ts:693, 695` (DE) / `304, 306` (EN).
* **Beweisbild:** Screenshot `logs/ui-shots/04-dashboard-campaign-6.png` bzw. `logs/ui-shots/03-campaign-6.png`.
  - Headline im Zentrum: **„Corridor planned — ready to search"** („Korridor geplant — bereit für die Suche").
  - Subtitel darunter: *„13 models configured. Start scraping to find listings."*
  - Haupt-Aktionsbutton: **„Search corridor now"** („Korridor jetzt durchsuchen").
  - Icon darüber: Navigationskompass (`Navigation`).
* **Welcher Zustand wird falsch gelesen:**
  In `RouteResultsView.tsx:622` wird ausschließlich `!hasListings` (`counts.total === 0`) abgefragt. Das leere Layout nimmt daraufhin starr an, dass es sich um einen Korridor handelt. Zwar hat der Entwickler für den Subtitel eine Weiche eingebaut (`familyTerms.length > 0 && route.circles.length === 0 ? t('searchFamily.emptyExplanation') : ...`), aber Headline, Icon und der primäre Call-to-Action-Button blieben hart verdrahtet auf Korridor-Texte. Obwohl für Kampagne 6 weder ein Eintrag in `route_searches` existiert noch `route.circles` vorhanden sind (`route.circles.length === 0`), behauptet die Oberfläche ein Korridor sei geplant.
* **Behebung:**
  In `RouteResultsView.tsx:647-668` Headline, Icon und Action-Button abhängig von `route.circles.length > 0` vs. `familyTerms.length > 0` rendern (z. B. Headline „Suchfamilie eingerichtet", Button „Suche jetzt starten").

---

### Punkt 2: Fehlende Wahl „Standort" vs. „Route" und fehlende Änderbarkeit
* **Fundstelle:** `frontend/src/App.tsx:1762-1789`, `App.tsx:102`, `backend/server.js:413`.
* **Beweis:**
  - Im UI-Code (`App.tsx:1767-1769`) existiert die Moduswahl nur als exklusives Dreier-Set:
    ```tsx
    {[ { key: 'point', label: t('common.searchModePoint') },
       { key: 'route', label: t('common.searchModeRoute') },
       { key: 'family', label: t('common.searchModeFamily') } ]}
    ```
  - Sobald der Nutzer speichert, werden 13 Suchen erzeugt (`activeSearches.length === 13`).
  - Zeile 1762: `{activeSearches.length === 0 ? (` schaltet permanent ab. Der gesamte Konfigurationsblock existiert nicht mehr.
* **Warum die vorhandene Struktur den Nutzer zwingt:**
  1. Das Frontend modelliert Ort und Begriff nicht als zwei getrennte Parameter, sondern als drei gegensätzliche Kampagnenarten. Man kann entweder eine Route anlegen ODER eine Familie anlegen.
  2. Es gibt im UI nach dem Erstellen keinen Button „Route hinzufügen" oder „Auf Route umstellen".
  3. Im Backend (`server.js:413`) liest `SELECT ... FROM route_searches r WHERE r.campaign_id = c.id ORDER BY r.id DESC LIMIT 1` nur eine einzige Route aus; es existiert kein Migrations- oder Umschaltendpunkt für bestehende Kampagnen.
* **Behebung:**
  Geometrie (Standort vs. Route) als konfigurierbares Kampagnenattribut auskoppeln; in den Kampagneneinstellungen einen dauerhaften Umschalter zwischen 1 Standort-Kreis und Routen-Korridor bereitstellen.

---

### Punkt 3: Nicht ausgerichtete Schrift in „Fetch Listings" und „Family Settings"
* **Fundstelle:** `frontend/src/components/RouteResultsView.tsx:479, 504, 517, 529`, `frontend/src/components/ui/Button.tsx:30, 48-52, 63`, `frontend/src/index.css:42, 81-87`.
* **Beweisbild:** Screenshot `logs/ui-shots/04-dashboard-c6-de-mobile.png` (Telefon) und `button_metrics.json`.
  - Auf Mobilgeräten (390px) bricht der Text in zwei Zeilen um:
    ```
    [Lupe]      Fetch       [Regler]     Family
               listings                 settings
    ```
  - Das Icon ist vertikal gegen den zweizeiligen Textblock zentriert (hängt auf der Trennlinie zwischen den Zeilen).
  - Zeile 1 ist durch `text-center` unruhig flatternd über Zeile 2 zentriert.
* **Konkrete Ursache in CSS- und Klassenstruktur:**
  1. **Verbotenes Umbrechen erzwungen:** In `Button.tsx:49` ist `whitespace-nowrap` Standard. In `RouteResultsView.tsx:479, 517` wird jedoch `className="... whitespace-normal text-center leading-tight"` übergeben. Tailwind-Merge ersetzt `nowrap` durch `normal`. Sobald die Breite minimal unterschritten wird (Grid-Spalte 170px auf Mobilgeräten), bricht der Text zweizeilig um.
  2. **Fehlende Baseline-Ausrichtung bei Flex-Icons:** Durch `flex items-center justify-center` zentriert der Flexbox-Algorithmus das SVG-Icon gegen die *Gesamthöhe* des zweizeiligen Textblocks (`18.75px` Line-Height), statt an der ersten Textzeile auszurichten.
  3. **Box-Model-Verengung durch `--spacing: 0.28rem` (Desktop):** In `index.css:42` wurde `--spacing: 0.28rem` definiert. `py-2.5` erzeugt `11.2px` oben und unten. Bei `min-h-[44px]` und 2px Border bleibt ein Content-Bereich von exakt `19.6px`. Das SVG hat durch `w-4 h-4` (`4 * 0.28rem`) eine Höhe von `17.91px`, der Text mit `leading-tight` hat `18.75px`. In WebKit/Blink führt diese 1px-Resttoleranz zu einem optischen Versatz der Schriftgrundlinie gegenüber dem Icon.
  4. **Fehlende Font-Vererbung auf Buttons:** In `index.css` setzt `body { font-family: var(--font-body); }` Inter als Standardschrift. Da HTML-Buttons Schrifteigenschaften standardmäßig nicht erben und Tailwind v4 in dieser Konfiguration kein `font-family: inherit` auf `button` erzwingt, rendern Buttons mit Browser-Default-Schriften (`system-ui`), deren X-Height von `Inter` abweicht.
* **Behebung:**
  In `RouteResultsView.tsx` die Klassen `whitespace-normal text-center leading-tight` entfernen (`whitespace-nowrap` beibehalten); in `index.css` `button { font-family: inherit; }` ergänzen.

---

### Punkt 4: „Evaluate These with AI" sichtbar trotz null Anzeigen
* **Fundstelle:** `frontend/src/components/RouteResultsView.tsx:524-533`.
* **Beweisbild:** Screenshot `logs/ui-shots/04-dashboard-campaign-6.png`.
  - Knopf `btn-evaluate-ai` („Evaluate these with AI →") steht voll aktiv in der Aktionsleiste direkt neben „Fetch listings", obwohl darunter riesig steht: *„No listings found yet"* und *„0 listings"*.
* **Wann er sichtbar ist vs. wann er es sein sollte:**
  - **Heute:** Er ist statisch im JSX eingebunden, ohne jede Bedingung. Weder `counts.total > 0`, noch `hasListings`, noch `unprocessedCount > 0` wird abgefragt.
  - **Soll:** Der Button darf nur gerendert werden (oder aktiv sein), wenn tatsächlich unevaluierte Treffer vorliegen (`counts.total > 0 && listings.some(l => !l.llm_processed)`). Bei null Anzeigen ist er irreführend und öffnet einen Konfigurations-Wizard für Daten, die gar nicht existieren.
* **Behebung:**
  Button in `RouteResultsView.tsx:524` mit `{hasListings && unprocessedCount > 0 && (...)}` bedingt einblenden.

---

### Punkt 5: Suchbegriffe der Familie lassen sich nirgends bearbeiten
* **Fundstelle:** `frontend/src/App.tsx:1475-1478`, `App.tsx:1762`, `App.tsx:1991-2014`.
* **Beweis:**
  - In `backend/server.js:1894` existiert der voll funktionsfähige Endpunkt `PUT /api/search-families/:id`.
  - In `frontend/src/components/SearchFamilyEditor.tsx:178-185` existiert die Speicherlogik für `PUT /api/search-families/:id`.
  - Aber in `App.tsx:1762` steht:
    ```tsx
    {activeSearches.length === 0 ? (
      searchTargetMode === 'family' ? (
        <SearchFamilyEditor ... />
      ) : (...)
    ) : (...)
    ```
  - Da Kampagne 6 bereits 13 Begriffe hat, ist `activeSearches.length === 13`.
  - Der Editor `SearchFamilyEditor` wird NIEMALS gerendert.
  - Selbst wenn die Bedingung wahr wäre: `App.tsx:1791-1804` übergibt weder `familyId` noch `initialTerms` noch `initialName` an `SearchFamilyEditor`!
* **Warum kommt der Nutzer nicht dorthin:**
  Der Einstiegspunkt existiert optisch („Family settings"), ist aber durch die Weiche `activeSearches.length === 0` im Code unerreichbar verbarrikadiert.
* **Behebung:**
  In `App.tsx` einen expliziten View-State oder Modal-State für `editingFamilyId` einführen, der `SearchFamilyEditor` mit `familyId={currentFamily.id}` und `initialTerms={currentFamily.terms}` lädt, unabhängig von `activeSearches.length`.

---

### Punkt 6: Einstellungen tun nichts („Da passiert einfach gar nichts")
* **Fundstelle:** `frontend/src/components/RouteResultsView.tsx:516`, `frontend/src/App.tsx:1475-1478`.
* **Beweis:**
  - `button_metrics.json`: Klick auf `btn-edit-family` führt zu URL `#edit?campaignId=6`.
  - Screenshot vor Klick: `04-dashboard-campaign-6.png`.
  - Screenshot nach Klick: `05-after-click-family-settings.png`.
  - Die beiden Screenshots sind bis auf den Breadcrumb-Text identisch.
* **Was passiert technisch beim Klick:**
  1. `onClick={onEditFamily}` wird ausgelöst.
  2. `onEditFamily` führt aus: `setSearchTargetMode('family'); navigate('edit', currentCampaignId, null);`.
  3. Der Hash-Router schaltet auf `view = 'edit'`.
  4. In `App.tsx` läuft die Render-Funktion von `view === 'edit'` an.
  5. Zeile 1762: `activeSearches.length === 0` ist `false`.
  6. Zeile 1991 greift: `((campaign.route_id || campaign.family_id) && !showAiWizard)`. Da `family_id = 1`, evaluiert dies zu `true`!
  7. Zeile 1994 rendert: `<RouteResultsView ... />`!
  8. Es wird kein HTTP-Aufruf abgesetzt. Es öffnet sich kein Dialog. Die Komponente mountet sich einfach selbst neu und zeigt exakt denselben Bildschirm. Für das menschliche Auge passiert schlichtweg überhaupt nichts.
* **Behebung:**
  `onEditFamily` so verdrahten, dass es einen Modus aktiviert, der `SearchFamilyEditor` anzeigt, statt in den Zirkelverweis von `RouteResultsView` zu laufen.

---

### Punkt 7: Das Zahnrad führt auf eine fast identische Seite
* **Fundstelle:** `frontend/src/App.tsx:1445-1456` (Dashboard) vs. `frontend/src/App.tsx:1991-2014` (Edit).
* **Beweisbild:**
  - Ansicht 1 (Dashboard): `logs/ui-shots/04-dashboard-campaign-6.png` (`/#dashboard?campaignId=6`)
  - Ansicht 2 (Edit): `logs/ui-shots/06-after-click-dashboard-gear.png` (`/#edit?campaignId=6`)
* **Welche zwei Ansichten sind das und warum sehen sie gleich aus:**
  - **Ansicht 1** ist das **Campaign Dashboard** (`view === 'dashboard'`).
  - **Ansicht 2** ist der **Campaign Targets & Guidelines Editor** (`view === 'edit'`).
  - **Warum sie gleich aussehen:**
    In `App.tsx:1459` rendert das Dashboard für Kampagnen mit `route_id || family_id` die Komponente `<RouteResultsView>`.
    In `App.tsx:1994` rendert der Editor für dieselben Kampagnen **haargenau dieselbe Komponente `<RouteResultsView>`**!
    Der einzige Unterschied zwischen den beiden 1440×900-Screenshots ist die oberste Navigationszeile:
    - Im Dashboard: `← Back to Searches | [Zahnrad]`
    - Im Editor: `← Back to Dashboard | Drucker Settings [Stift] | Targets & Guidelines`
    95% der Pixel (Karten, Knöpfe, Status, Empty-State) sind bit-identisch. Wer im Dashboard auf das Zahnrad klickt, landet auf einer Seite, die exakt dasselbe anzeigt.
* **Behebung:**
  In `view === 'edit'` für Suchfamilien und Korridore ein echtes Konfigurationspanel rendern (Begriffsliste, Radius, Standort, Auswertungsregeln), statt das Ergebnis-Dashboard ein zweites Mal anzuzeigen.

---

## 3. Weitere schonungslose Befunde (Über die sieben Punkte hinaus)

### A. Fehler (Bugs & Verdrahtungsbrüche)
1. **Vergessene Props bei `SearchFamilyEditor` (`App.tsx:1791-1804`):**
   Selbst im leeren Neuzustand wird `SearchFamilyEditor` ohne `familyId`, `initialTerms` oder `initialName` aufgerufen. Die Komponente ist für Edits vorbereitet, wird vom Container aber wie ein reines Einweg-Anlageformular behandelt.
2. **`GET /api/campaigns` liefert kein `family_id` (`backend/server.js:411-416`):**
   Das Backend selektiert `c.*` und per Subquery `route_id`. `family_id` fehlt komplett in der SQL-Abfrage. Das Frontend muss in `App.tsx:287-302` über einen separaten `useEffect` für jede Kampagne einzeln `GET /api/search-families?campaign_id=...` nachladen. Bis dieser Call antwortet, flackert die UI unvorhersehbar zwischen verschiedenen View-Zuständen hin und her.
3. **Hardcodierte automotive Felder in Prompts & Filtern (`PROPOSALS.md:D-5`):**
   In einer Drucker- oder Matratzen-Kampagne extrahiert `listingTransformer.ts:30` weiterhin `Kilometerstand` und `GuidelinesWizard.tsx:46` schlägt `maxMileage` vor.

### B. Lücken (Fehlende Basisfunktionen)
1. **Unsichtbare Suchbegriffe im Leergang:**
   Wenn 0 Anzeigen vorhanden sind, meldet die Karte zwar „13 models configured". Es gibt aber im gesamten Bildschirm keinen Ort, an dem der Nutzer nachsehen kann, *welche* 13 Modelle das sind! Die Modell-Filter-Chips (`SearchFamilyFilterBar`, Zeile 678) werden erst gerendert, wenn `counts.total > 0` ist.
2. **Keine Rückmeldung oder Abbruchmöglichkeit beim Crawl:**
   Klickt der Nutzer auf „Fetch listings", rotiert lediglich ein 16px-Icon im Button. Es gibt in `RouteResultsView` keinen Fortschrittsbalken, keine Anzeige, wie viele der 13 Suchen bereits abgearbeitet wurden, und keinen Abbruch-Knopf.
3. **Kein Weg zurück zur Modus-Wahl:**
   Hat ein Nutzer versehentlich „Standort" gewählt, gibt es keinen Button „Auf Route umstellen", ohne die Kampagne komplett zu löschen und neu anzulegen.

### C. Systemische Strukturprobleme (Informationsarchitektur)
1. **Die Monolith-Falle `App.tsx` (2.135 Zeilen):**
   Alle Seiten, Modale, Lade-Effekte und Sub-Router liegen in einer einzigen Datei mit über 35 `useState`-Hooks. Dadurch entstehen Wechselwirkungen, die kein menschlicher Entwickler und kein LLM mehr überblickt (z. B. dass `searchTargetMode` in Zeile 1476 gesetzt, in Zeile 1991 aber ignoriert wird).
2. **Terminologie-Chaos:**
   Dieselbe Entität heißt an verschiedenen Stellen unterschiedlich:
   - Im Dashboard-Breadcrumb: `← Back to Searches`
   - Im Edit-Breadcrumb: `← Back to Campaigns`
   - In der Überschrift: `Targets & Guidelines`
   - Im Button: `Family settings` vs. `Corridor settings`
   - Im Code: `searches`, `targets`, `campaigns`, `families`.

---

## 4. Was gut ist (ohne Beschönigung)

Trotz des desolaten Frontend-Zustands gibt es ein solides Fundament, auf dem aufgebaut werden kann:

1. **Das relationale Datenbank-Design (`db/schema.sql`):**
   Die Tabellen `search_families`, `search_family_terms`, `search_family_searches` und `listing_search_hits` sind durchdacht und tragfähig. Die n:m-Beziehung zwischen Anzeigen und Suchen (`listing_search_hits`) löst das jahrelange Problem des First-Hit-Wins sauber.
2. **Die URL-Grammatik (`scraper/search_url.py`):**
   Das Parsen, Ersetzen und Einfügen von Suchbegriffen und Standort-Schwänzen in Kleinanzeigen-URLs funktioniert zuverlässig und ist durch Unittests abgesichert.
3. **Das Berechnungsmodell für Kreuzprodukte (`scraper/family_store.py`):**
   Die Vorschau- und Speicher-Logik im Python- und Node-Backend (`/api/search-families/preview`) kalkuliert Suchen, Wiederverwendungen und Laufzeiten präzise.
4. **Visuelle Identität & Typografie-Tokens (`frontend/src/index.css`):**
   Die Dark-Teal- und Coral-Farbpalette (`#011F1F`, `#E87967`) sowie die definierte Schriftgrößen-Skala wirken modern, edel und eigenständig, wenn sie nicht durch überschriebene Tailwind-Klassen deformiert werden.
5. **Visuelle Testinfrastruktur (`scripts/ui_shots.py`):**
   Das Werkzeug zur automatisierten Erstellung von Screenshots auf einer temporären Datenbank-Kopie ist Gold wert und liefert den visuellen Feedback-Loop, der dem Projekt bisher gefehlt hat.
