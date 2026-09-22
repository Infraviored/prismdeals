# Was das Backend weiß, und was davon wirklich läuft

*Stand 2026-09-23, gemessen an der Live-Datenbank (nur lesend, `mode=ro`).
Jede Zahl unten ist gezählt, nicht geschätzt. Wer sie aktualisiert: nachzählen.*

Dieses Dokument beschreibt den **Ist-Zustand**. Wohin es gehen soll, steht in
[`produktkern.md`](produktkern.md).

---

## Die kurze Fassung

- **Anzeigen einsammeln funktioniert.** Titel und Beschreibung sind zu
  mindestens 99 % da, Fotos bei 85 %, Merkmale von der Detailseite bei 82 %.
- **Bewertet wird fast nichts.** 50 von 1498 Anzeigen haben ein Urteil (3 %),
  alle aus einer einzigen Kampagne (Corsair-RAM), alle ohne Modellaufruf.
- **Die Modellstufen sind gebaut, aber nicht angeschlossen.** Kein Knopf ruft
  sie auf, der Zeitplan steht auf `interval: 0`, Dossiers werden weder erzeugt
  noch gelesen, und eine Fotostufe gibt es nicht.
- **30 von 32 Suchen haben kein Playbook**, weil es nur aus der Kategorie in
  der Such-URL abgeleitet wird und Familien- und Routensuchen keine Kategorie
  tragen (`k0`).
- **Über den Verkäufer wissen wir nichts.** Kein Name, nicht privat oder
  gewerblich, kein „Aktiv seit". Die Detailseite hätte es.

---

## 1. Was pro Anzeige gespeichert ist

Tabelle `listings`, 1498 Zeilen. „Belegt" heißt: nicht leer, nicht `[]`/`{}`.

| Feld | belegt | Herkunft | Anmerkung |
|---|---|---|---|
| Titel | 1485 | Ergebniskarte | |
| Kurzbeschreibung | 1485 | Ergebniskarte | mit „…" abgeschnitten |
| Preis (Text) | 1477 | Ergebniskarte | 415 mit „VB" |
| `price_eur` | 1477 | aus dem Preistext | |
| Ort | 1248 | Ergebniskarte | ein String „PLZ Ort", 250 leer |
| Beschreibung | 1498 | Detailseite | Ø 596 Zeichen; **169 gleich der Kurzbeschreibung**, also nie wirklich geholt |
| `details` (Merkmale) | 1224 | Detailseite | siehe unten |
| Fotos | 1267 | Detailseite, Karte | Median 6, höchstens 21; 46 nur das Kartenbild |
| `full_info_obtained` | 1498 = 1 | | **falsch**: steht auch auf 227 Zeilen ohne Merkmale und ohne Fotos |
| `last_seen_at` | 298 | neuere Pfade | |
| `delisted_at` | 0 | | Erkennung existiert (`scraper.py`), hat noch nie gegriffen |
| KI-Bewertung alt (`extracted_facts`, `niceness_score`) | 26 | `agent_worker.py` | |

**Merkmale aus der Detailseite** (`details`, Schlüssel und Anzahl):
Zustand 1033, Marke 944, Typ 844, Farbe 725, Betriebssystem 694,
Bildschirmgröße 588, RAM 582, Speicher 544, Prozessor 527, Erscheinungsjahr 394,
Modell 209, Art 195, Material 84.

Der **Zustand** ist das wertvollste davon und wird von keiner Stufe benutzt:
Sehr gut 515, Gut 326, In Ordnung 88, **Defekt 74**, Neu 30, fehlt 465.

### Was Kleinanzeigen zeigt und wir wegwerfen

| Angabe | Wo | Wert für die Jagd |
|---|---|---|
| **Verkäufer**: Name, privat/gewerblich, „Aktiv seit", Plaketten | Detailseite, `#viewad-contact` | Vertrauen, Händler ausfiltern, zwei Kits vom selben Verkäufer erkennen |
| **Versand möglich / nur Abholung** | Detailseite | entscheidet, ob der Umweg überhaupt nötig ist |
| **Einstelldatum** | Karte und Detailseite | Alter einer Anzeige ohne eigenen Verlauf; alte Anzeigen sind verhandelbar |
| Anzahl Fotos | Karte | Vorsortierung ohne Detailabruf |
| Bundesland und Ort getrennt | Karte | heute zu einem String verklebt |
| Aufrufzähler | Detailseite | Nachfrage |

Der Detail-Parser liest nur `#viewad-details`. Das Repository hat **keine
gespeicherte Detailseite als Testvorlage**; die Liste oben beruht auf dem
bekannten Aufbau der Seite und muss beim Einbau an einer echten Seite geprüft
werden.

---

## 2. Was pro Suche, Kampagne, Route gespeichert ist

| | Anzahl | Anmerkung |
|---|---|---|
| Kampagnen | 5 | Laptops, Kleiderschrank, Matratze, Drucker, Corsair |
| Suchen | 32 | 2 verwaiste Testsuchen zeigen auf eine Kampagne, die es nicht gibt |
| Suchfamilien | 3 | Drucker (13 Modellbegriffe, **0 Treffer**), Laptops, Matratze |
| Routensuchen | 3 | Landsberg → Konstanz zweimal, eine Testroute |
| Anforderungen (`knowledge_sets`) | 4 | **nur eine gefüllt** (Corsair). Expertenwissen, Marktnotiz, Referenzbeschreibungen: überall leer |
| Treffer (`listing_search_hits`) | 1615 | 89 Anzeigen von zwei Suchen gefunden, 14 von drei |
| Koordinaten | 242 Anzeigen | nur bei Routensuchen, PLZ-Mittelpunkt aus Offline-Tabelle |
| Umweg in Minuten | 133 | OSRM |
| Preisverlauf | 4 Zeilen, 2 Anzeigen | Erfassung läuft erst seit Kurzem |

| Kampagne | Anzeigen | Playbook | Anforderungen |
|---|---|---|---|
| Laptops | 1140 | `electronics/laptops` (Suche deaktiviert) | leer |
| Kleiderschrank | 74 | keins | leer |
| Matratze | 219 | keins | leer |
| Drucker | 0 | keins | leer |
| Corsair Vengeance 32GB | 50 | `computing/memory` | **gefüllt** |

---

## 3. Wie eine Anzeige bewertet wird

| # | Stufe | Code | Modell | läuft? |
|---|---|---|---|---|
| 0 | Einsammeln, Beschreibung holen | `main.py`, `scraper.py` | nein | **ja, aber nur von Hand.** `data/schedule_config.json`: `interval: 0` |
| 1 | Titel-Sieb | `fit.judge_search` → `text_facts` | nein, reguläre Ausdrücke | **ja**, Knopf „Bewerten" → `POST /api/campaigns/:id/judge` |
| 2 | Beschreibungs-Sieb | dieselbe Funktion über Titel + Text | nein | **ja**, derselbe Knopf |
| 3 | Foto | nur im Docstring von `fit.py` | — | **gibt es nicht.** `vision_weight` steht in jedem Playbook und wird nirgends gelesen |
| 4 | Faktenblatt per Modell | `pipeline.py` → `extraction.py` | ja, nur Text | **nicht erreichbar.** Nur über `main.py --mode process`; die Frontend-Knöpfe dafür (`useScraperControl.ts`) sind exportiert und nirgends eingebaut |
| 5 | Modell erkennen → Dossier | `identity.py`, `dossiers.py` | — | **tot.** `main.py:659` ruft `pipeline.run` ohne `dossier_lookup`; Dossiers erzeugt niemand; Tabelle leer |
| 6 | Alte KI-Bewertung | `agent_worker.py` | ja | läuft nur nach einem Chat-Abgleich |
| 7 | Schnäppchen | `backend/db/reference_price.js` | nein | **ja**, bei jeder Abfrage |
| 8 | Umweg | `route_pipeline.py` | nein | ja, nach jedem Einsammeln |

### Das Urteil (Stufen 1–2)

`text_facts.contradicts` vergleicht jedes Feld mit der Anforderung (`min`,
`max`, `match`, `preferred`, `excluded`). Ein ausdrücklicher Widerspruch → `no`.
Alles bekannt und passend → `fit`. Sonst `unclear`. Die Logik ist für jede
Kategorie gleich; kategoriespezifisch ist nur, **welche Felder und Muster** das
Playbook mitbringt.

Was Stille bedeutet, steht im Playbook (`absent_means`, z. B. „kein Defekt
erwähnt → kein Defekt"). Eine ausdrückliche Angabe schlägt immer die Annahme.

### Die Punktzahl (`niceness_score`, Stufe 4/6)

`scoring.py` vergibt Punkte je Feld nach Wichtigkeit und mischt sechs **feste,
kategorieblinde** Modellnoten bei (Vertrauenswürdigkeit, Transparenz, …).
**Der Preis kommt darin nicht vor.** Ein verletztes Pflichtfeld setzt auf 0.

### Das Schnäppchen (Stufe 7)

Referenz ist der **Median je Suche** über alle Anzeigen, die diese Suche je
gefunden hat. Schnäppchen = im günstigsten 5 %-Quantil **und** ≤ 70 % des
Medians **und** mindestens 15 € darunter, bei mindestens 4 Anzeigen. Wurde eine
Anzeige von mehreren Suchen gefunden, zählt das beste Urteil.

Der Median ist blind für Zustand, Urteil, Laufleistung und Baujahr: Defekte
Geräte und Zubehör ziehen ihn nach unten.

---

## 4. Playbooks

Ein Playbook ist ein Python-Dict in `scraper/playbooks.py`: eine Kategorie, ihre
Kleinanzeigen-Codes, und eine Liste von Feldern. Jedes Feld hat Typ
(`boolean|number|enum|tier|text`), deutsche Beschriftung, Anweisung an das
Modell, optional Einheit, Optionen, Muster für die freien Stufen und
`absent_means`.

| Playbook | Code | Felder mit Mustern (freie Stufen) |
|---|---|---|
| `electronics/laptops` v2 | c278 | 3: Marke, RAM, Defekt |
| `vehicles/cars` | c216 | 0 |
| `vehicles/motorcycles` | c305 | 0 |
| `electronics/phones` | c173 | 0 |
| `computing/memory` | c225 | 7 von 13 |

**Zuordnung:** `playbook_for_url` sucht `cNNN` in der **Such**-URL. Die
Anzeigen-URL trüge die Kategorie auch (`…-278-9616`), wird aber nicht gelesen.
Familien und Routen suchen über `k0` (alle Kategorien), deshalb bekommen sie
kein Playbook.

Die Felder `dossier_relevant`, `vision_weight` und `geo_constraint` deuten an,
dass ein Playbook einmal sagen sollte, **wie** seine Kategorie zu beurteilen ist.
Keins davon wird gelesen.

---

## 5. Bekannte Fehler, die dieses Dokument gefunden hat

| | Wo | Folge |
|---|---|---|
| `full_info_obtained = 1` auch ohne Detaildaten | `scraper.py` | 227 Anzeigen gelten als vollständig und werden nie nachgeholt |
| 169 Beschreibungen = Kurzbeschreibung | Detailabruf | Die Beschreibungsstufe urteilt über einen abgeschnittenen Text |
| Drucker-Familie: 13 Suchen, 0 Treffer | Suchbegriffe oder URL | Die Kampagne ist seit ihrer Anlage leer, und keine Oberfläche sagt das |
| Zwei Suchen zeigen auf Kampagne 2, die nicht existiert | Testreste | verwaiste Daten |
| Fotostufe im Docstring beschrieben, nicht gebaut | `fit.py:8` | Dokumentation verspricht, was es nicht gibt |
