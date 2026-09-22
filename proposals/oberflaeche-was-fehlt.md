# Was der Oberfläche fehlt

*Ideensammlung, kein Bauplan. Entstanden am 2026-09-22, nachdem der Eigentümer
die fertige neue Oberfläche zum ersten Mal mit frischem Kopf angesehen hat:
„die seite sieht scheisse aus … ALLES daran ist falsch."*

*Gemessen am Stand von `71b5fd8` (PR #16, gemergt), nicht an Erinnerung. Die
Zahlen unten stammen aus einem eigenen Lauf gegen eine Kopie der Livedatenbank
und aus Bildschirmfotos bei 1920 px und 390 px.*

---

## Der Befund in einem Satz

Die Oberfläche erfüllt jede Zahl, die wir ihr gesetzt haben, und beantwortet
trotzdem nicht die Frage, für die es das Produkt gibt.

Die Abnahmetabelle in `docs/plan-new-surface.md` ist grün: Inhalt beginnt bei
48 px, sechs Bedienelemente, kein waagerechter Überlauf, eine Ergebnisliste
statt zweier. `scripts/audit_styles.py` meldet bei 1440 px null Befunde. Auf
demselben Bildschirm sagen sieben Zeilen hintereinander denselben Satz, fehlt
die Entfernung vollständig, und drei Viertel der Liste sind Anzeigen, die wir
selbst bereits abgelehnt haben.

**Jeder Bildschirm wurde gemessen, keiner wurde komponiert.** Die Frage, die am
Ende jedes Pakets stehen sollte — *sieht das aus wie etwas, auf dem man etwas
kauft?* — wurde nie ehrlich gestellt, weil die Zahlen stimmten.

---

## Gemessen

### Die Corsair-Suche (Kampagne 7), wie sie heute ausgeliefert wird

| | |
|---|---|
| Anzeigen | 50 |
| davon **abgelehnt** | **38** |
| passend | 7 |
| unklar | 5 |
| Ort in der Datenbank | 39 von 50 |
| Alter (`last_seen_at`) | 50 von 50 |
| Preisspanne | 20 – 150 € |
| mit Preisverlauf | 2 von 50 |

Ort und Alter sind vollständig genug vorhanden und erscheinen in **keiner**
Zeile der Liste.

### Warum „Passend" scheinbar nichts tut

Der Eigentümer: *„Wenn ich auf Fizz gehe, dann passiert überhaupt nichts."*

Der Filter arbeitet korrekt. Er ist nur unsichtbar: die Liste ist
passend-zuerst sortiert, also stehen die 12 interessanten Zeilen oben und die
38 abgelehnten darunter. Beim Filtern verschwinden 38 Zeilen **unterhalb des
Bildschirmrands** — im sichtbaren Bereich ändert sich nichts.

Das ist kein Anzeigefehler. Es ist die falsche Voreinstellung: 38 als Müll
erkannte Anzeigen gehören nicht standardmäßig in eine Liste, die „was soll ich
kaufen" beantwortet.

### Fläche und Ausrichtung bei 1920 px

| | |
|---|---|
| Fenster | 1920 px |
| Inhaltsspalte | 768 px bei x = 576 |
| Leisteninhalt | 768 px bei x = 576 (deckungsgleich) |
| **ungenutzt** | **1152 px, 60 %** |

Die Leiste sitzt seit `1a13bfd` auf derselben Breite wie die Liste — das ist in
Ordnung. Das Problem ist die Breite selbst: eine Telefonansicht in der Mitte
eines Schreibtischs.

### Nichts steht an einer festen Stelle

Der Merken-Knopf einer Zeile, gemessen über die sichtbaren Zeilen:

| Breite | x-Positionen |
|---|---|
| 1920 px | 1187, 1208, 1179 |
| 390 px | 347, 368, 339 |

Er hängt zwischen einem elastischen Titel und einem verschieden breiten Preis
und wandert mit. `docs/plan-new-surface.md` versprach: *„die zwei Zahlen, die
alles entscheiden, stehen immer an derselben Stelle."*

### Sieben identische Untertitel

`✓ 2×16 GB · DDR4-3200 · CL16`, siebenmal hintereinander. Die Zeile, die sagen
sollte, was geprüft wurde, sagt bei gleichartigen Treffern nichts.

Das Layout gibt dem, was bei allen **gleich** ist — dem Titel — rund 500 von
768 px. Dem, was **unterschiedlich** ist (Ort, Alter, Zustand, Verkäufer), gibt
es nichts.

---

## 1 — Der Kopf

Er zeigt den Suchbegriff, den man selbst eingetippt hat, und gibt ihm 360 von
768 px. Danach passen die sechs Bedienelemente nicht mehr hinein: bei 1920 ist
das letzte Symbol angeschnitten, bei 390 heißt der Titel „Corsair Vengeance …"
und zwei Knöpfe stehen außerhalb.

- Der Kopf zeigt den **Zustand der Jagd**, nicht ihren Namen:
  `50 gefunden · 7 passen · 1 Schnäppchen · zuletzt vor 2 Std`
- Zwei Ebenen statt einer: dünne Identitätszeile (zurück, Name, ⚙), darunter
  eine Werkzeugzeile, die beim Scrollen einklappt
- Der Name klein und gekürzt, die Zahlen groß
- Ein Frischestreifen: läuft gerade eine Ernte, wann war die letzte, wie viele
  sind seitdem neu

## 2 — Die Bedienelemente sagen nicht, was sie tun

Kein Tooltip, kein `title`, drei unbeschriftete Symbole (⇅ ⟳ ⚙). Nichts erklärt
den Unterschied zwischen „Fits" und „Deals only". „Evaluate", „Fits" und
„Deals only" sind drei verschiedene Wortarten.

- **Jeder Filter trägt seine Zahl**: `Alle 50 | Passend 7 | Unklar 5 | Abgelehnt 38`.
  Dann ist es kein Knopf mehr, sondern ein Zustand mit angekündigter Wirkung
- Segment-Umschalter statt Knopfsammlung — ein Zustand, vier Zahlen
- Hover zeigt die Zahl vorher; der aktive Zustand färbt deutlich statt um 9 %
  heller
- Der Zustand gehört in die URL: teilbar, zurück-navigierbar
- Jede Filteränderung braucht eine **Quittung**: die Zahl im Kopf zählt sichtbar
  von 50 auf 12

## 3 — „Filter ist leer", weil es nichts zu filtern gibt

Hinter dem Filter steht eine einzige Option. Ungenutzte Daten: Ort, Alter,
Preisspanne, Zustand, Versand.

- Preisspanne als Schieber **mit Histogramm** — Filter und Marktübersicht in
  einem Element
- Umkreis in km vom eigenen Ort
- „nur seit gestern neu", „nur noch nicht angeschaut", „nur mit Versand",
  „privat / gewerblich"
- Facetten mit Zahlen wie in einem Laden: jede Option sagt vorher, wie viel
  übrig bleibt
- **„Warum ausgeschlossen", aggregiert**:
  `23× vier Riegel · 8× DDR3 · 4× defekt · 3× SODIMM`
  Die wertvollste Zeile auf dem Bildschirm, und es gibt sie nicht

## 4 — Der abgeschnittene Rand

Die erste Zeile klebt an der Leiste, die letzte am Fensterrand.

- Abstand und ein sichtbarer Übergang zwischen erhobener Leiste und liegender
  Liste
- Unten ein Abschluss statt eines Schnitts: „50 von 50" oder die Nachladezeile
- Safe-Area auf dem Telefon beachten

## 5 — Desktop: die zweite Spalte

Der Vorschlag des Eigentümers: *„links die Liste und rechts KI-Analyse oder so
etwas. Metadaten über die gesamte Suche."* Was dort hineingehört, nach Wert
sortiert:

- **Der Markt**: Preis-Histogramm mit Median, Schnäppchen-Perzentil und einer
  Marke, wo die markierte Zeile liegt
- **Die Anforderungen, direkt bearbeitbar** — nicht hinter einem Blatt hinter
  einer Fehlermeldung. „mind. 3200 MHz" ändern, Liste links springt sofort um
- **Warum ausgeschlossen**, aggregiert (siehe 3)
- **Der markierte Fund**, statt eines Blatts, das die Liste verdeckt. ↑/↓
  blättert, rechts steht immer der aktuelle
- **Verlauf der Jagd**: wie viele neu seit gestern, wie der Median über die
  Wochen wandert
- Bei sehr breiten Fenstern drei Spalten: Filter | Liste | Fund
- Tastatur durchgehend: `j`/`k` blättern, Enter öffnet Kleinanzeigen, `s` merkt

## 6 — „Nichts daran ist schön"

Der Kern: **alles ist gleich gewichtet.** Alle Zeilen 88 px, alle Titel 14 px,
alle Untertitel 12 px, ein Akzent, der bei 1 von 50 feuert. Wo nichts groß ist,
ist nichts wichtig.

- Der beste Fund bekommt eine **eigene Form** — nicht dieselbe Zeile mit einer
  grünen Kritzelei von 48 × 16 px. Eine Karte über der Liste: großes Bild,
  Preis, Abstand zum Median, „öffnen"
- Preis in einer Display-Schrift mit echten Tabellenziffern, deutlich größer als
  alles andere; der Rest tritt zurück
- Bilder dürfen tragen. 72-px-Briefmarken in Dunkelbraun auf Dunkelgrün sind
  wertlos — auf Desktop 120 px, mit hellerem Grund hinter dunklen Fotos
- **Urteil als linke Kante** der Zeile (2 px farbig), nicht als 12-px-Häkchen im
  Fließtext
- Leerraum komponieren statt übrig lassen — die 576 px links sind heute Zufall
- Ein zweites Schriftgewicht für Zahlen; die ganze Jagd dreht sich um Zahlen
- Bewegung an genau einer Stelle: eine neu eintreffende Anzeige schiebt sich
  ein. Sonst nichts
- Ein Charakter, der zum Material passt: deutsche Kleinanzeigen sind
  Verkäuferfotos auf Teppichen, „VB", Großbuchstaben. Etwas Rauheit steht dem
  besser als SaaS-Glätte

## 7 — Was inhaltlich fehlt

- **Ort und Entfernung** — 39 von 50 haben ihn, keine Zeile zeigt ihn
- **Alter der Anzeige** — 50 von 50 haben es, keine Zeile zeigt es
- Abstand zum Median **an jeder Zeile**, nicht nur beim einen Schnäppchen
- Duplikate zusammenfassen: „(A1#)" und „(A2#)" sind derselbe Verkäufer mit
  zwei Anzeigen
- Verkäufertyp, Versand möglich
- „schon angeschaut" / „von mir abgelehnt" — ohne das kann man eine Liste nicht
  abarbeiten

## 8 — Was am Produkt fehlt, nicht am Bildschirm

- **Benachrichtigung, wenn etwas Passendes auftaucht.** Das ist der eigentliche
  Wert einer überwachten Suche, und es gibt sie nicht
- Notiz und Verhandlungsstand pro Fund — das Feld existiert längst in
  `kept_listings.note` und ist nirgends erreichbar
- „vergleiche diese drei"
- Eine Zusammenfassung über die ganze Suche, die etwas **behauptet**: „der Markt
  liegt bei 145 €, seit einer Woche −8 €, warte noch"

---

## Zwei Nebenbefunde aus derselben Sitzung

**Der Browser hält alte Fassungen.** Auf `index.html` liegt kein
`Cache-Control`. Zwei der Mängel, die der Eigentümer fotografiert hat — die
volle Leistenbreite und der mit „…" abgeschnittene KI-Satz — waren am selben
Abend bereits behoben und wurden trotzdem noch angezeigt. Ein Produkt, dessen
Auslieferung man nicht sehen kann, ist nicht ausgeliefert.

**Das Messwerkzeug kann den eigentlichen Fehler nicht sehen.**
`scripts/audit_styles.py` prüft abgeschnittenen Text, Koralle außerhalb des
Preises, zu kleine Schrift, waagerechten Überlauf. Es meldet null Befunde auf
einem Bildschirm, auf dem sieben Zeilen denselben Satz sagen. Solange die
Prüfung nur nach Defekten sucht und nie nach Bedeutungslosigkeit, bestätigt sie
jede langweilige Oberfläche.

---

## Nächster Schritt

Nichts hiervon ist beschlossen. Der sinnvolle nächste Schritt ist eine
Sortierung nach Wirkung pro Aufwand — was den Bildschirm am stärksten
verändert — und daraus ein Gestaltungsentwurf, der zuerst **gezeichnet** und
dann gebaut wird. Diesmal in dieser Reihenfolge.
