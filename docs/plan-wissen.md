# Wissen, das mitwächst

*Plan, 2026-09-23. Baut auf [`plan-generische-suche.md`](plan-generische-suche.md)
(vier Urteilsarten) und [`backend-bestand.md`](backend-bestand.md) (was heute
läuft) auf.*

---

## Die Frage

Soll prismdeals eine Wissensdatenbank haben, die mit jeder Jagd klüger wird?
Oder ist das sinnlos, weil in der Tiefe („Yamaha R1 RN19") so viel Wissen
steckt, dass man nie fertig wird?

## Die Antwort in drei Sätzen

1. **Ja, aber nur für Wissen, das stabil ist und wiederverwendet wird.**
   Welche Schwächen eine Baureihe hat, ändert sich über Jahre nicht. Was sie
   heute kostet, ändert sich jede Woche.
2. **Den Markt recherchieren wir nie. Den beobachten wir.** Unsere eigenen
   Anzeigen sind die bessere Preisquelle als jede Recherche-KI: aktuell,
   deutsch, regional, und sie kosten nichts.
3. **Die Tiefe bestimmt der Inhalt, nicht eine Taxonomie.** Ein Knoten
   bekommt nur dann Kinder, wenn sich das Wissen darunter wirklich
   unterscheidet, und nur dort, wo jemand jagt.

---

## Durchdacht: Wann lohnt sich gespeichertes Wissen?

Gespeichertes Wissen ist so viel wert, wie es **wiederverwendet** wird, mal wie
lange es **stimmt**, geteilt durch was es **kostet**, es neu zu beschaffen.

| Ebene | Beispiel | Wiederverwendung | hält | Quelle |
|---|---|---|---|---|
| Kategorie | Motorrad | jede Motorradjagd | Jahre | einmal recherchiert |
| Klasse | Supersportler | viele | Jahre | einmal recherchiert |
| Modell | Yamaha R1 | jede R1-Jagd | Jahre | Recherche |
| Generation | R1 RN19 (2007–08) | seltener | Jahre | Recherche |
| Einzelnes Exemplar | die Anzeige in Waldshut | **nie** | Tage | die Anzeige selbst |
| **Preise** | was eine RN19 heute kostet | jede Jagd | **Wochen** | **unsere Beobachtung** |

Daraus folgt:

- **Die Kategorieebene lohnt sich immer.** Kette, Reifenalter (DOT-Nummer),
  Bremsen, TÜV, Sturzspuren: Das gilt für jedes Motorrad, hält ewig und wird
  bei jeder Jagd gebraucht.
- **Die Tiefe lohnt sich genau dort, wo gejagt wird.** Eine RN19-Seite wird
  vielleicht nur ein einziges Mal gebraucht. Dann hat sie sich trotzdem
  gelohnt, denn ohne sie wäre diese eine Jagd blind gewesen. Die Datenbank
  behält sie nur umsonst dazu.
- **Die Sorge „in der Tiefe liegt unendlich viel" ist berechtigt, betrifft
  aber nur einen Knoten, der ohne Anlass angelegt wird.** Wer Knoten vorab für
  jede Generation jedes Modells anlegt, wird nie fertig. Wer sie anlegt, wenn
  eine Jagd sie braucht, hat nie zu viel.
- **Preise speichern wir nicht als Wissen.** Sie sind in einer Woche falsch.
  Und die Recherche-KI kennt vor allem US-Foren und Neupreise. Was eine RN19
  in Bayern kostet, sagen uns die Anzeigen, die wir ohnehin einsammeln.

### Wann ein Baum sinnlos ist

| Urteilsart | Baumtiefe |
|---|---|
| Geschmack (Kleiderschrank) | nur die Kategorie, und die ist fast leer. Maße, Material, Transport |
| Spezifikation (RAM) | Kategorie plus je Hersteller das Schema der Teilenummern |
| Preis-Leistung (Laptop) | Kategorie plus die Leistungswerte der CPUs und GPUs, **die im Markt vorkommen**. Keine vollständige Benchmarkliste |
| Modellprüfung (Motorrad) | tief: Kategorie → Klasse → Modell → Generation, wo nötig |

---

## Der Baum

Die Pfade gibt es schon: `dossiers.identity_key` baut Schlüssel wie
`bmw/3er/e90/320d/n47`. Das ist bereits ein Baum. Es fehlt nur, dass Wissen
**nach unten erbt**.

```
motorrad                          Kette, Reifenalter, TÜV, Sturzspuren, Papiere
└── motorrad/supersport           Rennstreckeneinsatz, Umbauten, Versicherung
    └── motorrad/supersport/yamaha-r1
        ├── …/yamaha-r1/rn19      Schwächen dieser Generation
        └── …/yamaha-r1/rn22      eigene Schwächen, erbt den Rest
```

Wer eine RN19 bewertet, bekommt alles auf dem Weg nach oben: RN19, R1,
Supersport, Motorrad. Jede Aussage hängt an dem höchsten Knoten, für den sie
stimmt. Die Kette gehört zu `motorrad`, nicht zu jeder Generation.

**Wo sich ein Knoten teilt, sagt die Recherche selbst.** Der Rechercheauftrag
fragt ausdrücklich: *„Unterscheiden sich Generationen oder Baujahre in ihren
Schwächen wesentlich? Wenn ja, wo verläuft die Grenze und woran erkennt man
sie in einer Anzeige?"* Die Antwort legt die Kinder an. Sagt sie „nein, die
R1 von 2015 bis 2019 ist einheitlich", gibt es keine Unterknoten.

**Woran man einen Knoten erkennt, ist selbst Wissen.** Ein Verkäufer schreibt
„R1 2008, Top Zustand", nicht „RN19". Die Recherche liefert die
Erkennungsmerkmale (Baujahre, Fahrgestellnummer, Optik), und damit ordnet die
Bewertung eine Anzeige ihrem Knoten zu. Im Zweifel ordnet sie **höher** ein,
also R1 statt RN19. Das schreibt `identity.py` schon als Regel vor:
lieber zu grob als falsch.

### Eine Aussage

Die Tabelle `dossiers` hat das Wichtigste schon: Quelle, Datum, Art, Verfall je
Art, Freigabe. Es kommen der Knoten und der Prüfweg dazu.

| Feld | Beispiel |
|---|---|
| Knoten | `motorrad/supersport/yamaha-r1/rn19` |
| Art | Schwäche, Prüfweg, Erkennungsmerkmal, Wartung, Werttreiber, Warnzeichen |
| Aussage | was stimmt |
| Prüfweg | aus dem Text / aus dem Foto / nur durch Nachfrage / nur vor Ort |
| Gewicht | Kleinigkeit, teuer, Ausschlussgrund |
| Quellen | mindestens eine erreichbare URL, sonst verworfen |
| Datum, Verfall | wie heute je Art |
| freigegeben | ein Mensch hat die Aussage gesehen |

### Wie es klüger wird

Auf zwei Wegen, und nur einer davon kostet etwas.

1. **Recherche**, einmal pro Knoten, wenn eine Jagd ihn braucht. Das kostet den
   Nutzer ein Kopieren und ein Einfügen.
2. **Beobachtung**, ständig und umsonst:
   - Preise je Knoten aus allen Anzeigen, die ihm zugeordnet sind. Mit der Zeit
     entsteht daraus ein Preisbild nach Baujahr, Laufleistung und Zustand.
   - Welche Prüfpunkte Verkäufer von sich aus beantworten und welche man
     erfragen muss. Das bestimmt, welche Fragen die Bewertung vorschlägt.
   - Wie lange Anzeigen je Knoten stehen. Das ist ein Maß dafür, wie viel
     Verhandlungsspielraum es gibt.

---

## Der Ablauf: die Recherche-Brücke

Wir betreiben vorerst **keinen eigenen Recherche-Agenten**. Der Nutzer hat eine
Recherche-KI mit Websuche (ChatGPT, Gemini, Perplexity, Claude). Wir sorgen
dafür, dass er genau einmal kopiert und einmal einfügt.

```
Jagd anlegen ──► Anzeigen sammeln ──► Marktbild
                                         │
             vorhandenes Wissen im Baum ─┤
                                         ▼
                            kleines Modell schreibt
                   ┌─────────────────────┴─────────────────────┐
         „Was zu wissen ist"                        Rechercheauftrag
          (5–10 Zeilen, sichtbar)                  (lang, zum Kopieren)
                                                           │
                                          Nutzer: Recherche-KI mit Websuche
                                                           │
                                               Antwort einfügen
                                                           ▼
                             kleines Modell ordnet in den Baum ein,
                             wir prüfen die Quellen-URLs, Nutzer gibt frei
                                                           │
                                                           ▼
                                        Bewertung in Stapeln
```

### Schritt 1 — Das Marktbild

Sobald eine Jagd mindestens zehn Anzeigen hat:

- **Zehn Anzeigen, gestreut über den Preis**, nicht zufällig. Eine je Zehntel
  der Preisverteilung, damit billige Unfallmaschinen und teure Sammlerstücke
  beide darin vorkommen. Je Anzeige: Titel, Preis, Ort, die Merkmale der
  Detailseite (Baujahr, Kilometer, Zustand) und die ersten 400 Zeichen der
  Beschreibung.
- **Die Zahlen**: Anzahl, Median, Quartile, wie viele unter dem Budget des
  Nutzers liegen.

Das Marktbild hat zwei Aufgaben. Die Recherche-KI weiß damit, **welche
Varianten tatsächlich angeboten werden**, und recherchiert nicht die ganze
Modellgeschichte. Und das kleine Modell sieht, **was in Anzeigen üblicherweise
fehlt**. Das sind die Punkte, zu denen es Fragen an den Verkäufer braucht.

### Schritt 2 — Das kleine Modell schreibt den Auftrag

Eingabe: die Absicht des Nutzers („Yamaha R1, bis 9000 €, Landstraße, kein
Rennstreckeneinsatz"), das Marktbild, die Urteilsart und **was im Baum schon
steht**. Was schon bekannt ist, wird nicht noch einmal gefragt. Ausgabe:

- **„Was zu wissen ist"**, kurz, für den Nutzer sichtbar. So sieht er, wofür er
  recherchieren lässt.
- **Der Rechercheauftrag**, lang, zum Kopieren.

### Schritt 3 — Kopieren, recherchieren, einfügen

Im Einrichten-Blatt steht ein Abschnitt **Wissen**:

> Für diese Jagd fehlt uns Wissen über die Yamaha R1.
> **[Rechercheauftrag kopieren]**
> Füge ihn in eine KI mit Websuche ein und die Antwort hier:
> [ Antwort einfügen … ]

Mehr nicht. Kein Konto, keine Schnittstelle, kein Schlüssel.

### Schritt 4 — Einordnen und freigeben

Das kleine Modell zerlegt die Antwort in Aussagen und hängt jede an ihren
Knoten. Legt die Antwort Generationen an, entstehen Kinder. Dann prüfen **wir**
die Quellen: Jede URL muss erreichbar sein, sonst fällt die Aussage weg
(`dossiers.validate_claim` tut das schon). Der Nutzer sieht die Liste und gibt
frei. Erst freigegebene Aussagen urteilen.

### Schritt 5 — Bewertung in Stapeln

Nicht Anzeige für Anzeige, sondern **acht bis zwölf je Aufruf**, gemischt, mit
dem Wissen des Knotens und dem Marktbild vorneweg.

Warum Stapel:

- Das Wissen und das Marktbild sind der teure Teil des Aufrufs. Im Stapel
  zahlt man sie einmal statt zwölfmal.
- Das Modell sieht Vergleiche („diese hat 12 000 km weniger zum selben Preis").
  Beim Einzelurteil fehlt ihm genau das.

Was dagegen spricht, und wie wir es abfangen:

| Gefahr | Gegenmittel |
|---|---|
| Die Reihenfolge färbt das Urteil | Stapel zufällig mischen; eine Stichprobe in anderem Stapel wiederholen und die Abweichung messen |
| Eine Anzeige verwechselt Fakten mit einer anderen | feste Ausgabe je Anzeige-ID, Belegzitat je Fakt (wie `fact_sheets` es schon verlangt) |
| Nur relativ, kein absoluter Maßstab | Marktzahlen des Knotens in jedem Stapel mitgeben |

Ausgabe je Anzeige:

- Zuordnung zum Knoten, im Zweifel höher
- je Prüfpunkt: belegt behoben / nicht erwähnt / Warnzeichen, mit Zitat
- Preis gegen den Markt des Knotens, mit Baujahr und Kilometern bereinigt,
  sobald genug Anzeigen dafür da sind
- die offenen Punkte als Nachricht an den Verkäufer, zum Kopieren

---

## Die Form der Recherche-Antwort

Nicht streng, aber **immer dieselben Überschriften**. Die Überschriften sind
es, die das Einordnen zuverlässig machen, nicht ein JSON-Schema, an dem jede
Recherche-KI anders scheitert.

```
## Einordnung
Welche Varianten gibt es; unterscheiden sie sich wesentlich?
Wenn ja: Grenze und Erkennungsmerkmale in einer Anzeige.

## Bekannte Schwächen
Je Schwäche: was, welche Varianten, wie man sie prüft (Text, Foto,
Nachfrage, vor Ort), wie teuer die Behebung, Quelle.

## Wartung und Verschleiß
Was ist wann fällig, was kostet es, woran sieht man, dass es gemacht wurde.

## Warnzeichen in Anzeigen
Formulierungen, Fotos, Umbauten, die aufhorchen lassen sollten.

## Werttreiber
Was macht ein Exemplar mehr oder weniger wert (keine Preise, nur Richtungen).

## Fragen an den Verkäufer
Die fünf bis zehn Fragen, die man vor der Fahrt gestellt haben sollte.

## Quellen
Jede Aussage oben verweist hierher. Ohne Quelle wird eine Aussage verworfen.
```

**Preise stehen absichtlich nicht darin.** Die kommen aus dem Markt.

---

## Beispiele: „Was zu wissen ist"

So sieht der kurze, sichtbare Teil aus, den das kleine Modell schreibt. Es
sind Fragen, keine Antworten. Die Antworten liefert die Recherche.

**1 — Yamaha R1, bis 9000 € (Modellprüfung)**
> Im Markt: 23 Angebote von 2004 bis 2019; unter 9000 € fast nur 2007–2012.
> - Unterscheiden sich die Generationen dieser Jahre in ihren Schwächen, und wie
>   erkennt man sie ohne Typenbezeichnung?
> - Welche Schwächen haben diese Generationen, und welche sieht man auf Fotos?
> - Woran erkennt man Rennstreckeneinsatz und Sturzschäden?
> - Was ist bei 30 000 bis 50 000 km fällig, und was kostet es?
> - Welche Umbauten mindern den Wert, welche sind egal?

**2 — Laptop bis 600 €, fürs Studium (Preis-Leistung)**
> Im Markt: 140 Angebote, 38 verschiedene Prozessoren.
> - Wie schneiden diese 38 Prozessoren im Verhältnis ab (eine Zahl je Modell,
>   mit Quelle)?
> - Welche Baureihen haben bekannte Schwächen (Scharniere, Akkus, Displays)?
> - Ab welchem Alter lohnt sich ein Akkutausch nicht mehr?

**3 — Corsair Vengeance 32 GB DDR4 (Spezifikation)**
> Im Markt: 50 Angebote; bei 5 fehlt die Latenz.
> - Wie ist die Teilenummer aufgebaut (Kapazität, Riegel, Takt, Latenz)?
> - Gibt es Revisionen mit gleichem Namen und anderen Chips?

**4 — Kleiderschrank, höchstens 120 cm breit (Geschmack)**
> Hier gibt es nichts zu recherchieren, was eine Recherche lohnt.
> - Bekannte Systemmöbel (z. B. PAX) lassen sich zerlegen und wieder
>   aufbauen; Spanplattenschränke oft nicht. Ob das zutrifft, klärt die
>   Beschreibung, nicht eine Recherche.

**5 — Jura-Kaffeevollautomat bis 300 € (Modellprüfung, flach)**
> Im Markt: 31 Angebote, 9 Modelle.
> - Welche Bauteile verschleißen typischerweise (Brüheinheit, Pumpe, Mahlwerk),
>   und wie teuer ist ihr Tausch?
> - Welche Angaben verrät der Zähler der Bezüge, und wie fragt man danach?
> - Welche Modelle teilen sich Bauteile, sodass ein Knoten für alle reicht?

Beispiel 4 ist Absicht: **Das kleine Modell darf sagen, dass Recherche sich
nicht lohnt.** Dann entsteht kein Auftrag, und die Jagd läuft ohne Modellkosten.

---

## Der Rechercheauftrag, ein Beispiel

Er darf lang sein, denn der Nutzer liest ihn nicht, er kopiert ihn nur.
Gekürzt:

```
Du recherchierst für einen Privatkäufer in Deutschland, der eine gebrauchte
Yamaha R1 kaufen will. Budget bis 9000 €, Einsatz Landstraße, kein
Rennstreckeneinsatz geplant. Nutze die Websuche. Belege jede Aussage mit einer
Quelle (Link), bevorzugt Fachpresse, Werkstatthandbücher, Rückrufdatenbanken
(KBA, NHTSA) und große Fahrerforen. Aussagen ohne Quelle lass weg.

So sieht der Markt aus, den er gerade vor sich hat (10 von 23 Angeboten,
über den Preis gestreut):

  1. R1 RN19 2008, 34 000 km, 7200 €, "Scheckheft, neue Reifen" …
  2. R1 2004, 61 000 km, 4300 €, "Kette neu, kleiner Umfaller" …
  …
  Median 7800 €, 15 von 23 unter seinem Budget.

Was wir schon wissen und nicht noch einmal brauchen:
  - allgemeine Motorrad-Prüfpunkte (Kette, Reifenalter, Bremsen, TÜV)

Was wir brauchen:
  1. Einordnung: Welche Generationen kommen in diesem Markt vor, und
     unterscheiden sie sich in ihren Schwächen wesentlich? Woran erkennt man
     die Generation in einer Anzeige ohne Typenbezeichnung?
  2. Bekannte Schwächen je Generation …
  3. …

Antworte genau mit diesen Überschriften:
  ## Einordnung
  ## Bekannte Schwächen
  ## Wartung und Verschleiß
  ## Warnzeichen in Anzeigen
  ## Werttreiber
  ## Fragen an den Verkäufer
  ## Quellen
Nenne keine Preise; die kennen wir aus dem Markt.
```

---

## Im Code

| | gibt es | fehlt |
|---|---|---|
| Pfadschlüssel | `dossiers.identity_key` | Erben entlang des Pfads |
| Aussagen mit Quelle, Art, Verfall, Freigabe | Tabelle `dossiers`, `validate_claim` | Prüfweg, Gewicht; die Zeile ist heute ein ganzes Dossier, künftig eine Aussage |
| Zuordnung Anzeige → Knoten | `identity.py` für Autos, Motorräder, Laptops, Handys | Erkennungsmerkmale aus der Recherche; Zuordnung in der Stapelbewertung |
| Marktbild | Preise je Suche (`reference_price.js`) | Stichprobe über den Preis; Preise je Knoten |
| Rechercheauftrag schreiben | Rechercheprompt in `dossiers.py` (für einen eigenen Agenten gedacht) | kleines Modell, das ihn aus Absicht, Markt und vorhandenem Wissen baut |
| Kopieren / Einfügen | — | Abschnitt „Wissen" im Einrichten-Blatt, zwei Endpunkte |
| Stapelbewertung | Faktenblätter mit Belegzitat (`fact_sheets`) | Stapel, Prüfpunkte, Fragen an den Verkäufer |

## Reihenfolge

| | Paket | liefert |
|---|---|---|
| 1 | Marktbild + „Was zu wissen ist" + Rechercheauftrag zum Kopieren | der Nutzer kann recherchieren lassen, auch wenn wir die Antwort noch nicht verarbeiten |
| 2 | Antwort einfügen, einordnen, Quellen prüfen, freigeben | der Baum beginnt zu wachsen |
| 3 | Stapelbewertung mit Wissen und Markt | Urteile mit Prüfpunkten und Fragen an den Verkäufer |
| 4 | Preise je Knoten aus der Beobachtung | Marktkalibrierung ohne Recherche |
| später | eigener Recherche-Agent mit Websuche; Wissen zwischen Nutzern teilen | erst, wenn Freigabe und Quellenprüfung sich bewährt haben. Von Nutzern eingefügte Recherche ist fremder Text und wird vor dem Teilen geprüft |

Paket 1 hat den besten Wert pro Aufwand: Es hilft sofort, auch wenn danach
nichts mehr gebaut wird.
