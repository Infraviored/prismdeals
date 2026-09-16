# Die Oberfläche neu: ein Jagdwerkzeug, kein Steuerpult

*Zielort nach Freigabe: `docs/plan-new-surface.md`. Ersetzt den Abschnitt
„Die Oberfläche wird ersetzt, nicht erweitert" in `docs/plan-shopping-surface.md`,
der die Regeln richtig hatte, aber keine Gestaltung.*

---

## Kontext

Heute wurde die Oberfläche dreimal umgebaut und sah danach genauso aus wie vorher.
Der Grund steht in meinem eigenen Auftrag an den ersten Agenten: *„Keine
Neugestaltung. Kein neues Aussehen, keine neuen Farben, keine neuen Texte."* Das
war für eine Code-Zerlegung richtig, und ich habe nie einen Gestaltungsschritt
hinterhergeschickt. Also wurde sortiert, nicht entworfen.

`docs/ui-journey.md` hält den Ist-Zustand fest: 26 Bildschirme, 49 Bilder, in zwei
Breiten, mit Zählungen. Die Zahlen sind der Befund:

| | |
|---|---|
| Inhalt beginnt im Median | **y=382** (Telefon), y=347 (Rechner) |
| Schlimmster Fall | y=490 — mehr als die halbe Bildschirmhöhe |
| Ergebnisbildschirme | **zwei**, mit verschiedenen Wörtern für denselben Knopf |
| Anzeigen auf einmal gerendert | **1070**, 203 220 px hoch, 15 072 Wörter |
| Familien-Editor | **42 Knöpfe, 51 Wörter** |
| Trefferzahl in der Überschrift | folgt dem Filter **nicht** |
| Eine Adresse eintippen | startet **von selbst** einen Abruf |

Das sind nicht zwanzig Fehler. Es ist einer, zwanzigmal sichtbar: **Niemand hat je
entschieden, wofür ein Bildschirm da ist.** Jeder zeigt alles, was über sein
Objekt bekannt ist. So sieht eine Bedienkonsole für einen Scraper aus, an die
später Einkaufsfunktionen geschraubt wurden.

---

## Die Entscheidung, aus der alles folgt

**Die Einheit dieses Produkts ist nicht „eine Suche". Es ist ein Ding, zu dem du
fahren und das du kaufen könntest.**

Alles unten ist die Folge dieses einen Satzes.

### Was das Produkt eigentlich ist

Jemand fährt ohnehin irgendwohin — Landsberg nach Konstanz — und will unterwegs
günstig etwas Gebrauchtes mitnehmen. Die entscheidende Größe ist nicht die
Entfernung, sondern der **Umweg in Minuten**. Das Material sind deutsche
Kleinanzeigen: Verkäuferfotos auf Betten und Teppichen, „VB" hinter dem Preis,
Titel in Großbuchstaben. Das Gefühl ist **Jagd**, nicht Katalog.

Eine Jagdliste ist dicht, schnell, überfliegbar, und die zwei Zahlen, die alles
entscheiden, stehen immer an derselben Stelle.

---

## Die Gestaltung

### Die eine kühne Sache

**Die Zeile ist ein Preisschild neben einem Foto.**

Der Preis ist der Held: groß, in der Überschriftenschrift, rechtsbündig, mit
Tabellenziffern, damit die Spalte untereinander flu. Der Umweg steht direkt
darunter, leise. Titel, Ort und Alter sind Beiwerk.

Das dreht die heutige Rangordnung um: dort steht der Umweg in Signalfarbe und der
Preis klein und blass darunter.

### Die Signalfarbe bekommt genau eine Bedeutung

`--color-brand-accent` (#E87967) wird heute für den Umweg, die „New"-Plakette,
Knöpfe, Überschriften und Symbole benutzt. Wenn eine Farbe alles bedeutet,
bedeutet sie nichts.

**Ab jetzt heißt Koralle genau eins: dieser Fund ist deine Aufmerksamkeit wert.**
Also der Preisabstand zur Referenz, wenn er die Schwelle reißt — und sonst
nirgends. Kein Knopf, keine Plakette, keine Überschrift.

Das ist zugleich die Brücke zur Strategie aus `docs/plan-shopping-surface.md`:
Stöbern zeigt keine Koralle, Beobachten schon.

### Palette

Die Identität bleibt — dunkles Teal und Koralle sind eigenständig und nicht die
Allerweltspalette. **Neu verteilt**, nicht ersetzt:

| Rolle | Wert | Verwendung |
|---|---|---|
| Grund | `#011F1F` | die ganze Fläche, auch hinter der Liste |
| Erhebung | `#012828` | **nur** echte Erhebung: Leiste, Blatt, Dialog |
| Linie | `rgba(255,255,255,.08)` | Zeilentrenner statt Rahmen |
| Schrift | `#F2F5F4` / `#9FB3B0` | Titel / Beiwerk |
| **Akzent** | `#E87967` | **nur** das Preissignal |
| Auf Route | `#10B981` | „on route", 0 Minuten Umweg |
| Alt | *(neu)* `#D9A441` | „seit 12 Tagen nicht gesehen" |
| Weg | `#8A9694` | durchgestrichen, ausgegraut |

Neu ist nur der Alterston; für Frische gab es bisher keinen.

### Schrift

Outfit und Inter bleiben. Zwei Änderungen, beide messbar:

- **Tabellenziffern** für Preis und Umweg (`font-variant-numeric: tabular-nums`).
  In einer Preisliste dürfen die Spalten nicht wackeln.
- **Zeilenhöhe in Listenzeilen auf 1.3** statt 1.5. Die heutige Skala ist für
  Fließtext gemacht; eine Liste ist kein Fließtext.

### Dichte

`--spacing: 0.28rem` liegt zwölf Prozent über Tailwinds Vorgabe und bläht jeden
Abstand, jedes Polster und jede Lücke im ganzen Projekt auf. **Auf 0.25rem.** Das
ist eine Zeile und wirkt auf jedem Bildschirm.

### Raster

```
┌─────────────────────────────────────────┐
│ ←  Matratze          [30 km] [≤100 €] ⇅ │  Leiste, 48px, klebt oben
├─────────────────────────────────────────┤
│ ▓▓▓▓  Federkern-Matratze Ikea      90 € │  Zeile, 88px
│ ▓▓▓▓  Landsberg · vor 2 Std     on route│  Trenner statt Rahmen
├─────────────────────────────────────────┤
│ ▓▓▓▓  Novilla Matratzentopper      55 € │
│ ▓▓▓▓  Sigmarszell · gestern         +4m │
└─────────────────────────────────────────┘
```

- **Eine klebende Leiste**, 48 px: Zurück, Name, und die Steuerung als Pillen.
  Immer dieselbe Stelle, auf jedem Bildschirm.
- **Kein Rahmen um eine Zeile.** Eine Haarlinie trennt. Eine Liste ist eine
  Liste, kein Stapel von Objekten.
- **Zeile 88 px**: Vorschaubild 72 px quadratisch links, Titel höchstens zwei
  Zeilen, darunter Ort und Alter; rechts Preis groß, Umweg klein.
- **Die Karte ist eine Umschaltung**, randlos, nicht eine permanente
  Bildschirmhälfte. Heute nimmt sie auf dem Rechner die halbe Breite, und kaufen
  kann man aus ihr nichts.

---

## Die Bildschirme — sechs statt sechsundzwanzig

Jeder mit **einem** Satz, wofür er da ist. Was diesem Satz nicht dient, kommt
nicht darauf.

| # | Bildschirm | Wofür er da ist |
|---|---|---|
| 1 | **Suchen** | Welche Jagden laufen, und was ist neu dazugekommen |
| 2 | **Funde** | Was kann ich kaufen, wie teuer, wie weit weg — *das ist die Anwendung* |
| 3 | **Fund** | Lohnt sich diese eine Fahrt |
| 4 | **Einrichten** | Was, wo, wie weit, bis wie viel |
| 5 | **Karte** | Wo liegen die Funde — Umschaltung von 2, kein eigener Ort |
| 6 | **App** | Was für alle Suchen gilt |

### 1 — Suchen

Zeilen, keine Karten mit Bild und drei Plaketten. Je Zeile: Name, wie viele Funde,
der jüngste Fund als Miniatur, wann zuletzt gesucht. Eine Zeile, ein Ziel.

Der Untertitel „Search Profile" verschwindet — er stand heute unter jeder Karte,
unabhängig davon, was die Suche ist.

### 2 — Funde

Die Anwendung. Leiste plus Liste, sonst nichts.

- Die Zahl in der Leiste ist die Zahl der **gezeigten** Zeilen und schrumpft beim
  Filtern. Heute sagt die Überschrift „107", auch wenn der Filter auf null
  gefiltert hat.
- **Blättern.** Fünfzig Zeilen, dann nachladen. 1070 auf einmal sind kein
  Ergebnis, sondern ein Dokument.
- **Leer ist kein Bericht.** Eine Zeile — „Keine Treffer in 30 km" — und darunter
  die Umkreis-Pillen mit gemessenen Zahlen: `30 km · 0` `100 km · 6`
  `200 km · 28`. Antippen wendet an. Kein Absatz über die Funktionstüchtigkeit
  der Suche, keine „Checked Models", keine Karte, die um Erlaubnis fragt.
- **Einer** dieser Bildschirme. Der zweite stirbt; eine Route fügt eine
  Umweg-Spalte und die Kartenumschaltung hinzu, mehr nicht.

### 3 — Fund

Ein Blatt über der Liste, keine eigene Seite: Bilder groß, Preis mit Abstand zur
Referenz, Umweg, Beschreibung, und ein Knopf, der die Anzeige bei Kleinanzeigen
öffnet. Wenn eine KI-Bewertung vorliegt, **eine Zeile** davon — nicht sechs
Dimensionen mit Absätzen.

Die Begründungen stehen heute auf Deutsch unter englischen Überschriften. Eine
Sprache je Bildschirm.

### 4 — Einrichten

Was · Wo · Wie weit · Bis wie viel. Vier Felder, ein Speichern. Die Modellliste
gehört hierher, nicht auf den Ergebnisbildschirm.

Die rohe Adresse verschwindet. `scraper/search_url.py` setzt Begriff, Ort, Radius
und seit heute auch die Preisspanne zusammen; der Ortsdienst ist offen und seit
der Korridorarbeit in Gebrauch. Eine offene **Such**-API gibt es nicht (401,
gemessen), und wir brauchen keine.

**Tippen ist Tippen.** Die heutige Automatik — 600 ms nach der letzten Taste legt
die Anwendung ein Richtlinien-Set an, legt das Ziel an und startet einen Abruf —
wird ersatzlos entfernt.

### 5 — Karte, 6 — App

Karte: randlos, dieselbe Leiste, Antippen einer Häufung filtert die Liste.
App: Sprache, Zeitplan, Kleinanzeigen-Verbindung. Der rote Balken „Not
Connected" verschwindet aus jeder Kopfleiste und wohnt hier.

---

## Was die Daten hergeben — und was nicht

Gemessen an der Live-Datenbank, 1266 Anzeigen. Eine Zeile darf nur zeigen, was
wirklich da ist.

| Feld | belegt | Folge für den Entwurf |
|---|---|---|
| Preis (`price_eur`) | 1247 | trägt die Zeile ✓ |
| Bild | 1218, im Median **6** je Anzeige | Vorschaubild ✓, Blättern im Fund ✓ |
| Ort | 1068 | **198 ohne Ort** — die Zeile muss das aushalten |
| Umweg | siehe unten | **die Mehrheit hat keinen** |
| Alter | `last_seen_at`: **0 von 1266** | siehe unten |
| KI-Urteil | **10 von 1266** | heute praktisch nie sichtbar |

**Das Alter ist noch nicht da.** `last_seen_at` und `delisted_at` existieren als
Spalten, aber nichts schreibt sie — sie füllen sich erst mit dem nächsten
Ernte-Durchlauf. Was es gibt, ist `listing_search_hits.first_seen_at`, vollständig
für alle 1266, **aber der Endpunkt gibt es nicht heraus**. Also: die Zeile zeigt
„seit wann bekannt" aus `first_seen_at`, und der Endpunkt muss es mitliefern. Das
ist eine benannte kleine Backend-Änderung, keine erfundene.

**Der Umweg ist die Ausnahme, nicht die Regel.** Für den Matratzen-Korridor: 37
von 107 Anzeigen haben einen Umweg, **66 sind „zu weit weg"**, 4 ohne
Koordinaten. Die Liste ist umwegsortiert, also steht oben das Brauchbare und
unten der Rest. Der Entwurf muss das ernst nehmen: der Platz unter dem Preis ist
bei zwei Dritteln der Zeilen leer. Entweder trägt er dann etwas anderes
(Entfernung), oder „zu weit weg" wird gar nicht erst in dieselbe Liste geschüttet
— das ist beim Bau zu entscheiden und im Bildschirmfoto zu zeigen.

### Zwei Endpunkte, ein Bildschirm — was daraus folgt

Der Familien-Endpunkt liefert `price_eur`, `matched_terms`, `status` und die
Frische-Spalten. Der Routen-Endpunkt liefert **keines davon** — er hat einen
engeren Satz. Ein einziger Ergebnisbildschirm kann nicht auf zwei verschiedenen
Formen sitzen. Also: **der Routen-Endpunkt wird auf dieselbe Form gebracht**, oder
beide Fälle laufen über den Familien-Endpunkt. Zu entscheiden, bevor P2 beginnt.

### Blättern und Filtern schließen sich heute aus

Der Familien-Endpunkt kann `limit`/`offset` — aber nur, wenn `limit` mitgegeben
wird, und der Client gibt es nie mit. Der Routen-Endpunkt kann es gar nicht.
Sortiert wird serverseitig fest; **gefiltert und umsortiert wird komplett im
Browser**, über den vollen Satz.

Daraus folgt zwingend: **fünfzig Zeilen zu blättern und gleichzeitig im Browser zu
filtern ist Unsinn** — man filtert dann fünfzig statt tausend. Filtern, Sortieren
und Blättern gehören in einer Hand, und das ist der Server. Das ist die einzige
Backend-Arbeit, die dieser Plan wirklich verlangt, und ohne sie ist das
Blättern-Ziel nicht erreichbar.

---

## Wie es gebaut wird

### Die Lehre aus heute

Drei Agenten haben heute sauber gearbeitet und trotzdem dieselbe Oberfläche
abgeliefert, weil meine Aufträge **Struktur** beschrieben und nicht **Aussehen**.
Jedes Paket unten trägt deshalb drei Dinge, die vorher gefehlt haben:

1. **Ein Bild oder ein ASCII-Raster** des Ziels. Kein „aufgeräumter".
2. **Pixelziele**, die man messen kann.
3. **Eine Pflicht zum Hinsehen**: Bildschirmfotos bei 390 und 1440, und die
   gemessenen Zahlen in der Zusammenfassung. Wer nur baut und nicht misst, ist
   nicht fertig.

### Die Pakete, in Reihenfolge

**P1 — Token und Bausteine.** Zuerst, weil alles andere daraus besteht.
`--spacing` auf 0.25rem, Tabellenziffern, die neu verteilte Palette, der
Alterston. Dazu **fünf** Bausteine und keinen sechsten: `Bar` (die klebende
Leiste), `Row` (die Listenzeile), `Pill` (die Steuerung), `Sheet` (das Blatt über
der Liste), `EmptyLine` (eine Zeile plus Handlungen). Danach gilt: **kein neuer
Bildschirm darf `Card` benutzen.** Alte Bildschirme laufen unverändert weiter.

**P1b — Filtern, Sortieren und Blättern an den Server.** Klein, aber P2 hängt
daran. Der Familien-Endpunkt bekommt `limit`/`offset` verbindlich, dazu Filter
(Begriff, Umweg, Suchtext) und Sortierung als Parameter; der Routen-Endpunkt wird
auf dieselbe Form gebracht; `first_seen_at` kommt mit. Ohne das ist das
Blättern-Ziel nicht erreichbar, und ein Bildschirm kann nicht auf zwei Formen
sitzen. Einziges Paket, das Backend anfasst.

**P2 — Funde.** Der Bildschirm, der zählt. Ersetzt beide heutigen
Ergebnisbildschirme auf einmal, denn zwei können nicht beide „die Liste" sein.
Enthält: Leiste mit lebender Zahl, Zeilen mit Preis als Held, Blättern bei 50,
Leerzustand als eine Zeile plus Umkreis-Pillen. Das ist das größte Paket und läuft
allein.

**P3 — Suchen.** Zeilen statt Karten. Klein, hängt nur an P1.

**P4 — Einrichten.** Vier Felder, ein Speichern, Modellliste hierher. Und die
Automatik ersatzlos raus, die beim Tippen einen Abruf startet. Der
Zusammensteller aus `feat/surface-composer` ist die Vorlage — seine Mechanik
stimmt bereits, nur der Bildschirm nicht.

**P5 — Fund und Karte.** Blatt über der Liste, Karte randlos als Umschaltung.

**P6 — App und Aufräumen.** Globale Einstellungen, der „Not Connected"-Balken
zieht dorthin, und alles, was jetzt unerreichbar ist, wird **gelöscht** statt
liegen gelassen. In diesem Projekt liegen bereits zwei solche Leichen
(`CriteriaTuner.tsx`, und `pipeline.py` wird gebaut aber nie erreicht) — eine
dritte kommt nicht dazu.

P3 bis P5 können parallel laufen, sobald P1 steht. P2 läuft allein, weil es die
meisten Dateien anfasst.

### Was ausdrücklich nicht in diesem Plan steht

- **Der KI-Assistent** (drei Kopier-Schritte). Sein Einstiegspunkt zieht um, aber
  ihn zu ersetzen ist Phase 5 in `docs/plan-shopping-surface.md` — eine
  Produktfrage, keine Gestaltungsfrage.
- **Backend und Scraper.** Unberührt. Diese Oberfläche wird gegen die
  vorhandenen Endpunkte gebaut; wo einer fehlt, wird er benannt und nicht
  nebenbei erfunden.
- **Mehrbenutzerbetrieb.** Wie besprochen zuletzt.

### Das Risiko, und wie es begrenzt wird

Ein „wir ersetzen alles" landet oft nie. Deshalb ersetzt **jedes Paket seinen
Vorgänger sofort** — es gibt keinen Schalter, keine zwei Oberflächen
nebeneinander, keinen Zweig, der wochenlang neben `main` lebt. Nach jedem Paket
ist die Anwendung benutzbar und wird ausgeliefert. Wenn nach P2 Schluss wäre,
hätte das Produkt trotzdem den Bildschirm gewonnen, auf den es ankommt.

---

## Abnahme — Zahlen, keine Meinungen

Gegen `docs/ui-journey.md` gemessen, mit demselben Werkzeug.

| | heute | Ziel |
|---|---|---|
| Inhalt beginnt (Telefon, Median) | 382 px | **≤ 220 px** |
| Inhalt beginnt (schlimmster Fall) | 490 px | **≤ 280 px** |
| Knöpfe auf dem Ergebnisbildschirm | 13–14 | **≤ 6** |
| Wörter Fließtext je Bildschirm (außer Fund) | bis 61 | **≤ 25** |
| Zeilen auf einmal | 1070 | **≤ 50, dann blättern** |
| Ergebnisbildschirme | 2 | **1** |
| Seiten breiter als ihr Fenster | 4 | **0** |
| Zahl in der Überschrift = gezeigte Zeilen | nein | **ja** |
| Abrufe ohne Knopfdruck | 1 | **0** |

Dazu die zehn Beobachtungen des Eigentümers aus
`docs/plan-shopping-surface.md` und die zwanzig aus `docs/ui-journey.md` — jede
einzeln nachweisbar erledigt oder begründet offen.

### Die Prüfung, die keine Zahl ist

Nach jedem Paket: `./venv/bin/python scripts/ui_shots.py --width 390` und
`--width 1440`, die Bilder **ansehen**, und dieselbe Messung laufen lassen, die
`docs/ui-journey.md` erzeugt hat. Die neuen Zahlen kommen in die Zusammenfassung,
neben die alten. Wer baut und nicht misst, ist nicht fertig.

Und eine Frage, die man nicht messen kann und die am Ende jedes Pakets steht:
**Sieht dieser Bildschirm aus wie etwas, auf dem man etwas kauft?** Wenn die
ehrliche Antwort nein ist, ist das Paket nicht fertig, egal was die Zahlen sagen.

### Regeln, die weiter gelten

- Niemals in `data/scraper.db` schreiben; lesen über `mode=ro`, schreiben nur
  gegen eine Kopie über `PRISMDEALS_DB`. Vor Migrationen ein `VACUUM INTO`.
- Niemals `backend/db_setup.js --recreate`.
- Texte über `translations.ts`, **de und en**.
- `buildlock` für `pytest` und schwere `npm`-Läufe.
- Jeder neue Test einmal gegen absichtlich kaputt gemachten Code, bevor er
  behalten wird.
- Keine Datei über 400 Zeilen.
- Ausliefern: **Backend zuerst, dann Frontend.** Umgekehrt entstand heute ein
  gespaltener Live-Zustand, in dem das Frontend Endpunkte rief, die es nicht gab.
