# Papier und Preis — eine Gestaltungsrichtung

*Zweites Dokument zu `oberflaeche-was-fehlt.md`. Dort steht, was fehlt. Hier
steht, wie es aussehen könnte.*

*Anlass: „auch der style selbst ist boring af. sieht aus wie billig af template
scheisse."*

*Ein Vorschlag, kein Beschluss. Nichts davon ist gebaut.*

---

## Warum es nach Vorlage aussieht — nachgezählt

Das ist kein Geschmacksurteil. Die heutige Gestaltung besteht überwiegend aus
Voreinstellungen, die jeder benutzt:

| Befund | Zahl |
|---|---|
| `#10B981` — das ist Tailwinds `emerald-500`, unverändert | 26 Stellen |
| `#EF4444` — Tailwinds `red-500`, unverändert | 1 Stelle |
| `rgba(255,255,255,.08)` als **einziges** Strukturmittel | 33 Stellen |
| `Inter` + `Outfit` | die verbreitetste Schriftpaarung im Netz |
| `#E87967` | liegt zwei Schritte neben `#D97757`, der Farbe, die man in KI-erzeugten Seiten erkennt |
| `2×16 GB · DDR4-3200 · CL16` | Mittelpunkt-Kette — genau das Muster, an dem man erzeugte Oberflächen erkennt |

Dazu: ein Radius für alles, ein Gewicht für alles, ein fast schwarzer Grund mit
einem warmen Akzent. Das ist nicht *falsch*. Es ist nur **von der Stange**, und
zwar auf jeder einzelnen Achse gleichzeitig.

Der tiefere Fehler: **das dunkle Teal arbeitet gegen das Material.** Die Bilder
in diesem Produkt sind Handyfotos von Gebrauchtware auf Teppichen und
Bettdecken — warm, braun, schlecht beleuchtet. Auf kaltem Dunkelgrün sehen sie
schmutzig aus. Deshalb haben wir sie auf 72 px verkleinert und weggeräumt, statt
sie tragen zu lassen.

---

## Die Entscheidung

**Das Material dieses Produkts ist ein fotografierter Gegenstand mit einem Preis
daneben. Also wird die Oberfläche eine Preisliste mit Bildern — kein Dashboard.**

Zwei Umkehrungen folgen daraus:

1. **Der Grund wird hell und warm.** Kartonfarben statt Nachtblau. Dunkle, warme
   Fotos liegen darauf wie Gegenstände auf einem Tisch, nicht wie Löcher in
   einer Wand.
2. **Die Zahl wird laut.** Heute ist alles gleich gewichtet: 88-px-Zeile,
   14-px-Titel, 12-px-Untertitel. Künftig ist der Preis fast unhöflich groß, und
   alles andere tritt zurück. Die Spalte der Preise **ist** die Gestaltung.

---

## Farbe

Sechs Werte. Warm, papierig, eine einzige Signalfarbe.

| Name | Wert | Rolle |
|---|---|---|
| `papier` | `#E9E3D7` | Der Grund. Graupappe, nicht Creme — kühler und grauer als der Standard-Cremeton, damit es nicht nach Boutique aussieht |
| `karton` | `#D8D0BE` | Erhebung: Preisschild, Blatt, Leiste |
| `tinte` | `#1A1814` | Schrift. Ein **brauner** Schwarzton, nie reines Schwarz und nie getöntes Anthrazit |
| `blei` | `#6C6558` | Beiwerk, Ort, Alter |
| `stempel` | `#B4331E` | **Nur** das Preissignal. Ein gedrucktes Zinnober, wie ein Gummistempel — kein Terrakotta |
| `moos` | `#3F6B4A` | „auf Route", 0 Minuten Umweg |

Was daran nicht Standard ist: die Signalfarbe ist ein *Druckfarbenton*, kein
Web-Rot und kein Tailwind-Rot. Und es gibt nur eine. Frische, Alter, Status —
alles andere wird über **Schriftgewicht und Position** gelöst, nicht über eine
weitere Farbe. Heute haben wir fünf Statusfarben; vier davon tragen nichts.

**Dunkelmodus** ist die Umkehrung, nicht eine zweite Palette: `tinte` wird zum
Grund, `papier` zur Schrift, `stempel` bleibt. Das ist die Logik eines
Negativs — dieselbe Identität, nicht ein zweites Design.

---

## Schrift

Zwei Familien, klar unterscheidbar, beide mit einer Aufgabe.

**Fira Sans** für alles Gelesene.
Von Spiekermanns Studio für Mozilla entworfen, humanistisch, deutsch in der
Anmutung, ausgezeichnet in kleinen Graden. Sie hat Charakter (das `a`, das `g`)
und ist emphatisch **nicht** Inter. Wir brauchen keine Neutralität; wir brauchen
Lesbarkeit bei 12 px und eine Stimme.

**Archivo Expanded** für Zahlen.
Breit und schwer, mit echten Tabellenziffern. Ein Preis will breit sein wie eine
auf ein Brett gemalte Zahl auf einem Markt, nicht schmal und technisch. Sie
erscheint **ausschließlich** bei Preisen, Entfernungen und Minuten — nie im
Fließtext. Dadurch ist sie kein Titelfont, sondern ein Signal: wo diese Schrift
steht, steht eine Zahl, auf die es ankommt.

Größen (Ausschnitt, in der Liste):

```
Preis              34 / 38 px   Archivo Expanded 700, tabular
Titel              15 px        Fira Sans 500
Ort · Alter        12 px        Fira Sans 400, blei
Urteilszeile       12 px        Fira Sans 400
Leiste, Zahl       20 px        Archivo Expanded 600
```

Drei Verbote, weil es die verbreitetsten Verräter sind:
- keine gesperrten Versalien als Beschriftung über Inhalten
- keine Mittelpunkt-Ketten `A · B · C`
- keine Monospace für kleine Datenwerte

---

## Raster

### Telefon

Die Zeile ist ein Gegenstand mit einem Schild daran. Das Foto sitzt bündig an
der linken Kante — kein Rahmen, kein Radius, keine Lücke. Der Preis rechts, in
einer **festen** Spalte, damit die Ziffern untereinander eine senkrechte Linie
bilden.

```
┌───────────────────────────────────────────┐
│ ←  Corsair Vengeance 32GB          ⚙      │  Leiste: Name klein
│    50 gefunden · 7 passen · 1 Fund        │  Zustand groß darunter
├───────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓  Corsair Vengeance RGB PRO        │
│▓▓ FOTO ▓  32GB (2×16GB)                   │
│▓▓▓▓▓▓▓▓  Waldshut · 84 km · gestern       │      100 €   ← stempel
│          2×16 GB  DDR4-3200  CL16          │   40 unter Markt
├───────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓  Corsair Vengeance LPX 32 GB      │
│▓▓ FOTO ▓  DDR4-3200 CL16                   │
│▓▓▓▓▓▓▓▓  München · 12 km · vor 2 Std      │      140 €
├───────────────────────────────────────────┤
│  38 ausgeschlossen: 23× vier Riegel,      │  ← die Zeile, die heute fehlt
│  8× DDR3, 4× defekt          anzeigen     │
└───────────────────────────────────────────┘
```

Das Foto ist 96 px statt 72 und hat **keinen** dunklen Rahmen — auf hellem
Karton braucht es keinen. Ort und Alter stehen wieder da, wo sie hingehören.

### Desktop

Die zweite Spalte, die der Eigentümer vorgeschlagen hat. Links die Liste, breit
genug zum Lesen; rechts der Markt, fest stehend.

```
┌──────────────────────────────────┬─────────────────────────┐
│ ←  Corsair Vengeance 32GB    ⚙   │                         │
│    50 · 7 passen · 1 Fund        │   DER MARKT             │
├──────────────────────────────────┤                         │
│ ▓▓▓▓  Corsair RGB PRO    100 €   │    ▁▂▅█▇▅▃▂▁            │
│ ▓▓▓▓  Waldshut · 84 km  40 unter │    20      145     150  │
├──────────────────────────────────┤    Median 145 €         │
│ ▓▓▓▓  LPX 32 GB          140 €   │    ▲ dieser: 100        │
│ ▓▓▓▓  München · 12 km            │                         │
├──────────────────────────────────┤   WAS DU WILLST         │
│ ▓▓▓▓  LPX (2×16)         150 €   │    2 Module      ✓ 7    │
│ ▓▓▓▓  Berlin · 390 km            │    DDR4          ✓ 45   │
├──────────────────────────────────┤    ab 3200 MHz   ✓ 31   │
│ 38 ausgeschlossen      anzeigen  │    CL bis 16     ✓ 12   │
└──────────────────────────────────┴─────────────────────────┘
```

Die rechte Spalte ist keine Dekoration: jede Anforderung zeigt, **wie viele sie
überleben**. Man zieht „ab 3200 MHz" auf 3000 und sieht die Liste links
springen. Das ist die Stelle, an der das Produkt aufhört, ein Filter zu sein,
und anfängt, ein Werkzeug zu sein.

Ausrichtung: Text linksbündig, Zahlen rechtsbündig in fester Spaltenbreite.
Nichts ist zentriert außer dem leeren Zustand.

---

## Das eine kühne Element

**Die Preisspalte.**

Alles andere ist ruhig: warmes Papier, kleine humanistische Schrift, keine
Rahmen, keine Schatten, kein Radius außer am Preisschild. Und rechts läuft eine
Kolonne aus breiten, schweren Ziffern nach unten, 34 px hoch, mit
Tabellenziffern exakt untereinander. Diese Kolonne ist das Bild der Seite.

Einmal unter fünfzig Zeilen wechselt eine Zahl auf `stempel` und bekommt
darunter eine zweite, kleine Zeile: `40 unter Markt`. Das ist der ganze Einsatz
von Farbe auf dem Bildschirm. Weil es selten ist, bedeutet es etwas.

Das ist zugleich die Antwort auf den Befund aus Dokument 1: wo nichts groß ist,
ist nichts wichtig.

---

## Bewegung

Genau eine Stelle. Wenn während einer laufenden Ernte eine neue Anzeige
eintrifft, schiebt sie sich von oben in die Liste und setzt sich kurz — wie ein
Zettel, der an ein Brett geheftet wird. Sonst bewegt sich nichts: kein
Einblenden beim Scrollen, keine Übergänge auf Karten, kein Schweben beim
Überfahren.

`prefers-reduced-motion` schaltet auch das ab.

---

## Sprache

Die Oberfläche redet heute in drei Registern gleichzeitig: `Evaluate`, `Fits`,
`Deals only`, dazu ein englischer KI-Satz über einer deutschen Anzeige und
`stickCount is 4` als Ablehnungsgrund (letzteres ist inzwischen behoben).

- Eine Sprache je Bildschirm, und zwar die des Verkäufers: deutsch.
- Ein Bedienelement heißt, was es tut, und heißt überall gleich: `Prüfen` →
  Ergebnis `geprüft`.
- Filter heißen nach ihrem Ergebnis, nicht nach ihrer Funktion: `Passend 7`
  statt `Fits`.
- Leere Zustände sind eine Aufforderung, keine Meldung: „Noch nichts in 30 km.
  100 km hätte 6." statt „Keine Treffer".
- Kein `→` hinter Knopftexten.

---

## Was ich bewusst vermieden habe

Die Richtungen, in denen man bei so einem Auftrag automatisch landet, und warum
sie es nicht geworden sind:

**Creme + Serifendisplay + Terrakotta.** Die zurzeit häufigste erzeugte
Gestaltung überhaupt. Mein Grund ist grauer (`#E9E3D7` statt `#F4F1EA`), die
Displayschrift ist eine breite Grotesk statt einer Serifenschrift, und die
Signalfarbe ist ein Stempelzinnober, kein Ton-Rot. Trotzdem: das ist die
Richtung, in der dieser Entwurf am dichtesten an einem Klischee vorbeifährt, und
das sollte beim Bauen im Blick bleiben.

**Fast-Schwarz mit einem grellen Akzent.** Genau das haben wir heute. Es macht
warme Gebrauchtwarenfotos schmutzig.

**Das SaaS-Kachelset.** Gleiche Ecken an allem, weicher grauer Schatten unter
jeder Kachel, Verlaufsflächen als Schmuck. Hier: keine Kachel, kein Schatten,
ein einziger Radius und der nur am Preisschild.

**Die Zeitungsseite mit Haarlinien und Null-Radius.** Eine Preisliste rutscht
leicht dorthin. Was dagegen hält: die Fotos sind groß und tragen die Seite, und
Linien werden nur gesetzt, wo wirklich etwas getrennt wird — nicht als
Grundmuster.

---

## Zwei Gegenentwürfe, falls die Richtung nicht überzeugt

**„Nachtfahrt".** Bleibt dunkel, aber warm: ein braunes Schwarz wie ein
abgedunkelter Innenraum, Bernstein und ein blasses Grün wie in einem
Instrumentenbrett, Zahlen in einer Schrift mit Anzeigencharakter. Das Thema ist
die Fahrt zum Verkäufer, der Umweg in Minuten ist der Held. Für jemanden, der
eine dunkle Oberfläche will, ohne die heutige Beliebigkeit.

**„Aushang".** Der Zettel am Supermarkt-Brett: fotokopiertes Papier, leicht
schiefe Ausschnitte, Abrissstreifen. Ehrlich zum Material und ausgesprochen
eigenständig — aber schwer dicht und schwer schnell zu bekommen. Hohes Risiko.

---

## Nächster Schritt

Eine Gestaltungsrichtung lässt sich nicht aus einer Tabelle mit Hex-Werten
beurteilen. Der sinnvolle nächste Schritt ist ein **Musterbogen**: eine einzelne
Seite mit der echten Corsair-Liste, in dieser Palette und dieser Schrift, in
beiden Breiten — zum Ansehen, nicht zum Einbauen. Erst wenn die überzeugt, lohnt
sich der Umbau.
