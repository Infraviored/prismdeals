# Eine Suche, vier Arten zu urteilen

*Plan, 2026-09-23. Der Ist-Zustand, auf dem er aufbaut, steht in
[`backend-bestand.md`](backend-bestand.md).*

---

## Das Problem

Heute kennt das System genau eine Art zu urteilen: **Stimmen die Angaben mit
meinen Anforderungen überein?** Für Arbeitsspeicher ist das richtig. Zwei
Riegel, 16 GB, DDR4, 3200 MHz, CL16: Jede Anzeige sagt es oder sagt es nicht,
und reguläre Ausdrücke entscheiden 34 von 50 Fällen ohne einen einzigen
Modellaufruf.

Für fast alles andere ist es die falsche Frage:

- **Ein Laptop** hat keine richtige Antwort, nur eine bessere. Die Marke ist
  egal; es zählt, wie viel Rechenleistung man für den Euro bekommt. Eine Liste
  von Mindestanforderungen verwirft das gute Gerät für 50 € mehr und behält
  das schlechte, das knapp drüber liegt.
- **Ein Motorrad** passt fast immer auf die Anforderungen (Modell, Baujahr,
  Kilometer). Die eigentliche Frage ist, ob **dieses** Exemplar die bekannten
  Schwächen **seines** Modells hat: Steuerkette bei der einen, Regler-Gleichrichter
  bei der anderen, Rahmenrisse bei der dritten. Das weiß man nicht aus der
  Anzeige, sondern über das Modell.
- **Ein Kleiderschrank** wird nach Geschmack und Maß gekauft. Die KI hat dazu
  nichts Sinnvolles zu sagen, kostet aber pro Anzeige Geld. Hier hilft sie nur,
  wenn sie **aus dem Weg geht**.

Der Code ahnt das schon: Playbooks tragen `vision_weight`, `dossier_relevant`,
`geo_constraint`. Gelesen wird keins davon. Es gibt Dossiers mit geprüften
Quellen und Verfallsdaten je Behauptung, aber niemand erzeugt oder liest sie.

## Die Entscheidung

**Jedes Playbook erklärt seine Urteilsart.** Es gibt genau vier. Die
Urteilsart bestimmt, welche Stufen laufen, was die Referenz für „günstig" ist,
und was die rechte Spalte der Oberfläche zeigt.

| Urteilsart | Frage | Beispiele | KI wofür |
|---|---|---|---|
| **Spezifikation** | Stimmt es genau? | RAM, Druckermodell, Ersatzteil, Objektiv | nur für das, was Muster nicht klären: unklare Fälle, Teilenummer auf dem Foto |
| **Preis-Leistung** | Wie viel bekomme ich pro Euro? | Laptop, Grafikkarte, PC, Monitor, Handy | Hardware aus dem Text lesen, wenn Muster versagen; **nicht** für die Wertung |
| **Modellprüfung** | Hat dieses Exemplar die Schwächen seines Modells? | Motorrad, Auto, E-Bike, Kamera, Kaffeevollautomat | Modell recherchieren (einmal pro Modell), Anzeige gegen die Checkliste lesen |
| **Geschmack** | Gefällt es mir, passt es rein? | Kleiderschrank, Sofa, Matratze, Kleidung | **gar nicht**, höchstens Maße aus dem Text lesen |

Eine Kategorie ohne Playbook wird wie **Geschmack** behandelt: einsammeln,
Preis, Umweg, Fotos, keine Kosten. Das ist heute der Fall für 30 von 32 Suchen,
nur dass die Oberfläche es verschweigt.

---

## Die vier Arten im Einzelnen

### Spezifikation — was heute schon geht, fertig machen

Stufen: Titel → Beschreibung → **Foto** → Modell nur für `unclear`.

- Fotostufe bauen. Das Corsair-Playbook sagt selbst, wozu: Die Teilenummer
  `CMW32GX4M2E3200C16` auf dem Aufkleber enthält jede Angabe, die der Text
  verschweigt. Alle fünf unklaren Corsair-Angebote scheitern an „CL nicht
  angegeben"; ob der Aufkleber auf ihren Fotos lesbar ist, ist der erste
  Test der Fotostufe.
- Teilenummern entschlüsseln: Wo das Schema eines Herstellers regelhaft ist,
  ist das eine Funktion, kein Modellaufruf.
- Der Median für das Schnäppchen nur über **passende** Angebote. Heute ziehen
  Vierer-Kits und defekte Riegel ihn herunter.

### Preis-Leistung — neu

Stufen: Titel → Beschreibung (Hardware lesen) → **Leistungswert** → Wertung.

- **Leistungswert aus belegter Recherche, nicht aus dem Gedächtnis eines
  Modells.** CPU- und GPU-Modell → Leistungswert mit Quelle, beschafft über die
  Recherche-Brücke aus [`plan-wissen.md`](plan-wissen.md), und zwar nur für die
  Prozessoren, die im Markt der Jagd tatsächlich vorkommen. Heute rät das
  Modell eine „CPU-Stufe 1–5". Das ist genau die Stelle, an der eine KI
  überzeugt klingt und falsch liegt.
- **Gewertet wird Leistung pro Euro**, und die Referenz ist eine Kurve, kein
  Median: Preis gegen Leistungswert über alle Angebote der Suche. Schnäppchen
  ist, was weit unter der Kurve liegt, egal von welcher Marke.
- Harte Grenzen gibt es weiter (mindestens 16 GB, kein Defekt, höchstens 14
  Zoll), aber sie filtern, sie werten nicht.
- Das Laptop-Playbook bekommt ein GPU-Feld und Muster für CPU-Modelle. Die
  Merkmale der Detailseite liefern `Prozessor` (527×), `RAM` (582×),
  `Speicher` (544×) bereits strukturiert — heute ungenutzt.

Rechte Spalte der Oberfläche: die Kurve, der Fund als Punkt darunter.

### Modellprüfung — die Teile existieren, anschließen

Stufen: Titel → **Modell erkennen** → Dossier (einmal pro Modell, geprüft) →
Beschreibung + Fotos **gegen die Checkliste des Modells** → Fragen an den
Verkäufer.

- **Dossier erzeugen.** Ein Rechercheauftrag pro Modell: bekannte Schwächen,
  Rückrufe, Wartungsintervalle, übliche Preise nach Baujahr und Laufleistung.
  `dossiers.py` hat Speicher, Quellenprüfung (jede Behauptung braucht eine
  erreichbare URL) und Verfall je Behauptungsart schon. Es fehlt nur der
  Erzeuger. **Ein Mensch gibt ein Dossier frei**, bevor es urteilt
  (`approved`-Spalte existiert).
- **Checkliste statt Urteil.** Pro Schwäche: Die Anzeige belegt sie ist
  behoben / sagt nichts / zeigt ein Warnzeichen. Aus „sagt nichts" wird eine
  **Frage an den Verkäufer**: „Wurde die Steuerkette schon gemacht?" Das ist
  der eigentliche Nutzen, und kein anderes Portal liefert ihn.
- **Referenzpreis je Modell, Baujahr und Kilometer**, nicht je Suche. Eine
  Suche „Motorrad bis 4000 €" mischt sonst 125er und 1000er.
- Anschlüsse: `main.py:659` übergibt `dossier_lookup`, `effective_fields`
  wird aufgerufen, und die Modellstufe bekommt einen Knopf. Heute ist keine
  davon erreichbar.

Rechte Spalte: Die Checkliste des Modells, je Punkt belegt / offen / Warnung,
und die offenen Punkte als kopierbare Nachricht an den Verkäufer.

### Geschmack — die KI geht aus dem Weg

Stufen: Titel → harte Filter (Maße aus Text, Preis, Umweg) → fertig.

- Kein Modellaufruf. Die Anforderungen heißen hier „Maße und Grenzen":
  Breite höchstens 120 cm, Umweg höchstens 20 Minuten.
- Die Oberfläche wird bildlastig: große Fotos, Raster statt Liste. Das war
  Entwurf B — für diese Urteilsart war er richtig.
- Schnäppchen nach Median bleibt, aber gekennzeichnet als grob: Ein
  Kleiderschrank für 40 € ist nicht dasselbe Ding wie einer für 400 €.

---

## Was alle vier brauchen

1. **Die Kategorie aus der Anzeige, nicht aus der Suche.** Die Anzeigen-URL
   trägt sie (`…/3517306856-225-8308` → c225). Damit bekommen Familien- und
   Routensuchen ein Playbook. Mischt eine Suche Kategorien, urteilt jede
   Anzeige nach ihrer eigenen.
2. **Die Detailseite ganz lesen.** Verkäufer (privat/gewerblich, aktiv seit),
   Versand oder nur Abholung, Einstelldatum. Versand ändert, ob der Umweg
   überhaupt zählt; das Einstelldatum sagt, wie verhandelbar eine Anzeige ist.
   Vorher eine echte Detailseite als Testvorlage speichern — es gibt keine.
3. **`full_info_obtained` reparieren.** 227 Anzeigen gelten als vollständig
   ohne ein einziges Merkmal.
4. **Die Modellstufe erreichbar machen**, mit Kostenanzeige vor dem Start:
   „23 unklare Angebote, etwa 0,04 €".
5. **Der Zustand der Detailseite ins Urteil.** 74 Anzeigen sagen dort „Defekt",
   ausgewertet wird es nicht.

## Reihenfolge

| | Paket | warum zuerst |
|---|---|---|
| 1 | Kategorie aus der Anzeige + Urteilsart im Playbook + Geschmack als Rückfall | schaltet 30 Suchen von „nichts" auf „ehrlich nichts, aber sichtbar" |
| 2 | Detailseite ganz lesen (Verkäufer, Versand, Datum, Zustand) | billig, jede Urteilsart profitiert |
| 3 | Preis-Leistung für Laptops | die größte Kampagne (1140 Anzeigen) hat heute kein Urteil |
| 4 | Fotostufe für Spezifikation | macht die unklaren RAM-Fälle entscheidbar |
| 5 | Modellprüfung mit Dossiers für Motorräder | am meisten Wert, am meisten Arbeit; braucht Freigabe durch einen Menschen |

Jedes Paket liefert sofort aus und ist ohne die folgenden benutzbar.
