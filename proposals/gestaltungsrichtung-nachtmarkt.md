# Nachtmarkt — eine Gestaltungsrichtung

*Zweites Dokument zu `oberflaeche-was-fehlt.md`. Dort steht, was fehlt. Hier
steht, wie es aussehen könnte.*

*Anlass: „auch der style selbst ist boring af. sieht aus wie billig af template
scheisse."*

*Feste Vorgabe des Eigentümers: **Dunkelgrün und Koralle bleiben.** Alles andere
ist frei. Ein Vorschlag, kein Beschluss. Nichts davon ist gebaut.*

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
| `2×16 GB · DDR4-3200 · CL16` | Mittelpunkt-Kette — genau das Muster, an dem man erzeugte Oberflächen erkennt |
| Abstufungen des Grundtons | `#011F1F` → `#012828` → `#013333` |

Die letzte Zeile ist die wichtigste und die am wenigsten offensichtliche.

**Die drei Grüntöne liegen so dicht beieinander, dass man sie nicht
unterscheiden kann.** Zwischen Grund, Erhebung und Überfahren liegen jeweils
rund neun Helligkeitsprozent in einem Bereich, in dem das Auge auf einem Schirm
kaum etwas sieht. Deshalb wirkt alles flach — es *ist* alles gleich. Und weil
die Fläche keine Tiefe hergab, wurde für jede Kante `weiß bei 8 %` genommen.
Weiß gehört aber nicht zu dieser Palette: es bleicht sie aus und macht aus einem
Farbklima ein Graufilter mit grünem Anstrich.

Dazu kommt ein Materialproblem: **das kalte Dunkelgrün arbeitet gegen die
Fotos.** Die Bilder hier sind Handyaufnahmen von Gebrauchtware auf Teppichen und
Bettdecken — warm, braun, schlecht beleuchtet. Auf kaltem Dunkelgrün sehen sie
schmutzig aus, und genau deshalb sind sie bei 72 px gelandet: wir haben sie
kleingemacht, weil sie dort nicht funktionieren.

---

## Die Entscheidung

**Das Dunkel bleibt — aber das Licht kommt aus den Gegenständen.**

Ein Nachtmarkt: die Halle ist dunkel, über jedem Tisch hängt eine Lampe, und was
leuchtet, ist die Ware. Nicht die Wand.

Zwei Konsequenzen:

1. **Das Foto bekommt sein eigenes Licht.** Jede Aufnahme sitzt auf einer warmen
   Unterlage, wie ein Abzug auf einem Tisch. Damit hört sie auf, ein dunkles
   Loch in einer dunklen Fläche zu sein, und wird wieder ein Gegenstand. Das ist
   keine Verzierung, sondern die Reparatur des eigentlichen Fehlers.
2. **Die Zahl wird laut.** Heute ist alles gleich gewichtet: 88-px-Zeile,
   14-px-Titel, 12-px-Untertitel. Künftig ist der Preis fast unhöflich groß, und
   alles andere tritt zurück. Die Spalte der Preise **ist** die Gestaltung.

Und darunter liegt die unspektakuläre Arbeit, ohne die beides nichts nützt: die
Palette bekommt endlich einen Umfang.

---

## Farbe

Zwei Werte sind gesetzt. Der Rest ist ihre Verwandtschaft.

| Name | Wert | Rolle |
|---|---|---|
| `nacht` | `#011F1F` | **fest.** Der Grund |
| `glut` | `#E87967` | **fest.** Ausschließlich das Preissignal |
| `grube` | `#00100F` | Vertiefung: Eingabefelder, die Fläche hinter der Liste |
| `tisch` | `#06322C` | Erhebung: Leiste, Blatt, Dialog — **sichtbar** heller, nicht 9 % |
| `kante` | `#0E4A40` | Trennlinien. Aus der Palette, nicht aus Weiß |
| `lampe` | `#E4D6BE` | Die warme Unterlage unter Fotos. Der einzige helle Ton |
| `kalk` | `#F2F5F4` | Schrift |
| `asche` | `#8FA6A1` | Beiwerk: Ort, Alter, Urteil |
| `moos` | `#4E8C6A` | „auf Route", 0 Minuten Umweg |
| `messing` | `#C9A227` | Alt, lange nicht gesehen |

Drei Dinge daran sind die eigentliche Arbeit:

**`kante` ersetzt `rgba(255,255,255,.08)` an allen 33 Stellen.** Eine Linie in
der Farbfamilie trennt, ohne die Fläche zu entfärben. Das ist ein einziges
Token und die sichtbarste Einzeländerung im ganzen Vorschlag.

**`grube` und `tisch` spreizen den Grund wirklich auf.** Man muss sehen können,
ob etwas unter oder über der Fläche liegt. Heute kann man es nicht.

**`moos` und `messing` gehören zur Familie.** `#10B981` ist eine Web-Farbe aus
einem Framework; sie hat mit diesem Grün nichts zu tun und leuchtet aus jedem
Bildschirmfoto heraus wie ein Aufkleber. `#EF4444` fliegt ganz raus — Fehler
werden über Text gelöst, nicht über eine zehnte Farbe.

**`glut` feuert einmal unter fünfzig Zeilen.** Heute kommt der Ton außerdem bei
Rahmen (`--color-border-brand`) vor. Das muss weg: eine Farbe, eine Bedeutung.

---

## Schrift

Zwei Familien, klar unterscheidbar, je eine Aufgabe.

**Fira Sans** für alles Gelesene.
Von Spiekermanns Studio für Mozilla entworfen, humanistisch, deutsch in der
Anmutung, ausgezeichnet in kleinen Graden und auf dunklem Grund. Sie hat
Charakter (das `a`, das `g`) und ist emphatisch **nicht** Inter. Wir brauchen
keine Neutralität, wir brauchen Lesbarkeit bei 12 px und eine Stimme.

**Archivo Expanded** ausschließlich für Zahlen.
Breit und schwer, mit echten Tabellenziffern. Ein Preis will breit sein wie eine
auf ein Brett gemalte Zahl, nicht schmal und technisch. Sie erscheint nur bei
Preisen, Entfernungen und Minuten — nie im Fließtext. Dadurch ist sie kein
Titelfont, sondern ein Signal: **wo diese Schrift steht, steht eine Zahl, auf
die es ankommt.**

Auf dunklem Grund blüht schwere Schrift auf. Deshalb Gewicht 600 statt 700 und
etwas Laufweite; das ist beim Bauen am Bildschirm zu prüfen, nicht am Papier.

```
Preis              34 / 38 px   Archivo Expanded 600, tabular
Titel              15 px        Fira Sans 500
Ort, Alter         12 px        Fira Sans 400, asche
Urteilszeile       12 px        Fira Sans 400
Zahl in der Leiste 20 px        Archivo Expanded 600
```

Drei Verbote, weil es die verbreitetsten Verräter sind:
- keine gesperrten Versalien als Beschriftung über Inhalten
- keine Mittelpunkt-Ketten `A · B · C`
- keine Monospace für kleine Datenwerte

---

## Raster

### Telefon

Die Zeile ist ein beleuchteter Gegenstand mit einem Preis daneben. Das Foto
sitzt auf `lampe`, bündig an der linken Kante, ohne Rahmen. Der Preis rechts in
einer **festen** Spalte, damit die Ziffern untereinander eine senkrechte Linie
bilden — und damit der Merken-Knopf aufhört zu wandern.

```
┌───────────────────────────────────────────┐
│ ←  Corsair Vengeance 32GB           ⚙     │  Name klein
│    50 gefunden · 7 passen · 1 Fund        │  Zustand groß
├───────────────────────────────────────────┤
│ ░░░░░░░░  Corsair Vengeance RGB PRO       │  ░ = lampe, warm
│ ░ FOTO ░  32GB (2×16GB)                   │
│ ░░░░░░░░  Waldshut · 84 km · gestern      │     100 €   ← glut
│           2×16 GB  DDR4-3200  CL16        │  40 unter Markt
├───────────────────────────────────────────┤  ← kante, nicht weiß
│ ░░░░░░░░  Corsair Vengeance LPX 32 GB     │
│ ░ FOTO ░  DDR4-3200 CL16                  │
│ ░░░░░░░░  München · 12 km · vor 2 Std     │     140 €
├───────────────────────────────────────────┤
│  38 ausgeschlossen: 23× vier Riegel,      │  ← die Zeile, die heute fehlt
│  8× DDR3, 4× defekt          anzeigen     │
└───────────────────────────────────────────┘
```

Das Foto wächst von 72 auf 96 px und verliert seinen dunklen Rahmen. Ort und
Alter stehen wieder da, wo sie hingehören.

### Desktop

Die zweite Spalte, die der Eigentümer vorgeschlagen hat. Links die Liste, breit
genug zum Lesen; rechts der Markt, fest stehend.

```
┌──────────────────────────────────┬─────────────────────────┐
│ ←  Corsair Vengeance 32GB    ⚙   │                         │
│    50 · 7 passen · 1 Fund        │   DER MARKT             │
├──────────────────────────────────┤                         │
│ ░░░░  Corsair RGB PRO    100 €   │    ▁▂▅█▇▅▃▂▁            │
│ ░░░░  Waldshut · 84 km  40 unter │    20      145     150  │
├──────────────────────────────────┤    Median 145 €         │
│ ░░░░  LPX 32 GB          140 €   │    ▲ dieser: 100        │
│ ░░░░  München · 12 km            │                         │
├──────────────────────────────────┤   WAS DU WILLST         │
│ ░░░░  LPX (2×16)         150 €   │    2 Module      ✓ 7    │
│ ░░░░  Berlin · 390 km            │    DDR4          ✓ 45   │
├──────────────────────────────────┤    ab 3200 MHz   ✓ 31   │
│ 38 ausgeschlossen      anzeigen  │    CL bis 16     ✓ 12   │
└──────────────────────────────────┴─────────────────────────┘
```

Die rechte Spalte ist keine Dekoration: jede Anforderung zeigt, **wie viele sie
überleben**. Man zieht „ab 3200 MHz" auf 3000 und sieht die Liste links
springen. Das ist die Stelle, an der das Produkt aufhört, ein Filter zu sein,
und anfängt, ein Werkzeug zu sein.

Ausrichtung: Text linksbündig, Zahlen rechtsbündig in fester Spaltenbreite.
Zentriert wird nur der leere Zustand.

---

## Das eine kühne Element

**Die Preisspalte.**

Alles andere ist ruhig: dunkles Grün, kleine humanistische Schrift, Linien in
der Farbfamilie, keine Schatten, kein Radius außer am Bild. Und rechts läuft
eine Kolonne aus breiten Ziffern in `kalk` nach unten, 34 px hoch, exakt
untereinander. Diese Kolonne ist das Bild der Seite.

Einmal unter fünfzig Zeilen wechselt eine Zahl auf `glut` und bekommt darunter
eine zweite, kleine Zeile: `40 unter Markt`. Das ist der gesamte Einsatz von
Signalfarbe auf dem Bildschirm. Weil es selten ist, bedeutet es etwas.

Das ist zugleich die Antwort auf den Befund aus Dokument 1: wo nichts groß ist,
ist nichts wichtig.

---

## Bewegung

Genau eine Stelle. Wenn während einer laufenden Ernte eine neue Anzeige
eintrifft, schiebt sie sich von oben in die Liste und setzt sich kurz. Sonst
bewegt sich nichts: kein Einblenden beim Scrollen, keine Übergänge auf Kacheln,
kein Schweben beim Überfahren.

`prefers-reduced-motion` schaltet auch das ab.

---

## Sprache

Die Oberfläche redet heute in drei Registern gleichzeitig: `Evaluate`, `Fits`,
`Deals only`, dazu ein englischer KI-Satz über einer deutschen Anzeige.

- Eine Sprache je Bildschirm, und zwar die des Verkäufers: deutsch.
- Ein Bedienelement heißt, was es tut, und überall gleich: `Prüfen` → Ergebnis
  `geprüft`.
- Filter heißen nach ihrem Ergebnis, nicht nach ihrer Funktion: `Passend 7`
  statt `Fits`.
- Leere Zustände sind eine Aufforderung: „Noch nichts in 30 km. 100 km hätte
  6." statt „Keine Treffer".
- Kein `→` hinter Knopftexten.

---

## Die Klischeefrage, ehrlich beantwortet

Ein fast schwarzer Grund mit einer warmen Signalfarbe ist die zweithäufigste
erzeugte Gestaltung überhaupt. Genau dort stehen wir, und der Eigentümer will
dort bleiben — die Vorgabe gewinnt.

Dann muss die Unterscheidung aus dem kommen, was frei ist. Konkret aus fünf
Dingen:

1. Der Grundton bekommt **fünf** Stufen statt drei, mit sichtbarem Abstand.
2. Linien kommen aus der Palette, nicht aus Weiß. (33 Stellen.)
3. Ein **warmer heller Ton** taucht auf — aber nur unter Fotografien. Das ist
   das Element, das es sonst nirgends gibt, und es entsteht aus dem Material.
4. Zwei Schriften mit je einer Aufgabe, keine davon Inter.
5. Eine einzige typografische Geste, die laut ist, und ringsum Disziplin.

Ausdrücklich nicht: das Kachelset (gleiche Ecken an allem, weicher grauer
Schatten, Verlaufsflächen als Schmuck), Glasoptik, Leuchteffekte hinter Kacheln,
gesperrte Versalien als Beschriftung.

---

## Zwei Varianten innerhalb der Vorgabe

**„Warmes Dunkel".** Der Grund driftet über die Stufen hinweg leicht ins
Bräunliche (`#011F1F` → `#0A2420` statt ins Blaugrüne). Die Fotos brauchen dann
weniger Unterlage, weil die Fläche selbst wärmer ist. Weniger Kontrast, ruhiger,
weniger auffällig.

**„Lampe überall".** Nicht nur Fotos, sondern jede Erhebung — Blatt, Leiste,
Eingabefeld — sitzt auf dem warmen Ton. Das wäre ein deutlich größerer Bruch mit
heute und ein hübsches Bild (heller Tisch in dunkler Halle), aber es kostet die
Ruhe der Liste und dreht das Verhältnis von hell zu dunkel fast um.

---

## Nächster Schritt

Eine Gestaltungsrichtung lässt sich nicht aus einer Tabelle mit Hex-Werten
beurteilen. Der sinnvolle nächste Schritt ist ein **Musterbogen**: eine einzelne
Seite mit der echten Corsair-Liste, in dieser Palette und dieser Schrift, in
beiden Breiten — zum Ansehen, nicht zum Einbauen.
