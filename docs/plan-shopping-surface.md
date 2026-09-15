# Vom Suchwerkzeug zur Einkaufsoberfläche

*Zielort für dieses Dokument nach Freigabe: `docs/plan-shopping-surface.md`.*

---

## Kontext

Die Suchfamilien sind live. Der Eigentümer hat die Oberfläche zum ersten Mal
benutzt und sie „extrem schlecht und so weit weg von Produktion" genannt. Die
sieben Einzelbeschwerden sind inzwischen behoben. Was bleibt, ist der Befund
darunter: **das ist ein Verwaltungswerkzeug für Suchen, kein Einkaufswerkzeug.**

Die Startseite zeigt Konfigurationsobjekte statt Funde. Die Sprache ist die der
Maschine — Basis-Such-URL, Ziele, Treffer. Man kann nichts wegwischen und nichts
merken. Nichts sagt, ob eine Anzeige noch existiert. Der Preis ist Nebendarsteller
und als Text gespeichert. Eine Suche, die nichts findet, sagt nur „noch keine
Anzeigen" und bietet keinen Ausweg — genau das ist beim ersten echten Versuch
passiert, weil es die dreizehn Drucker in dreißig Kilometern um Landsberg nicht
gibt.

Ziel: eine Oberfläche, die sich wie eine Einkaufsplattform anfühlt. Kleinanzeigen
bleibt für den Proof of Concept die Datenquelle im Hintergrund; die Trennlinie
dorthin wird jetzt eingezogen, damit eine zweite Quelle später Tage statt Monate
kostet.

---

## Die Strategie: Stöbern oder Beobachten

Die Frage, an der sich alles entscheidet, war: was gehört auf die Startseite?
Ein Strom aller neuen Funde ist Lärm. Bei „alle Matratzen" ist kein einzelner
Fund eine Nachricht wert. Bei einem Motorrad, das die KI bemerkenswert findet,
sehr wohl.

Der Unterschied ist nicht die Kategorie, sondern **die Art des Kaufs**:

| | **Stöbern** | **Beobachten** |
|---|---|---|
| Absicht | Ich brauche jetzt eins | Ich warte auf das richtige |
| Zeitraum | eine Sitzung | Wochen bis Monate |
| Beispiel | Matratze 140×200 | Motorrad, bestimmtes Modell |
| Die Liste | ich sehe sie mir an und entscheide | ich sehe sie selten an |
| KI | aus | an |
| Startseite | taucht nie auf | nur wenn etwas die Schwelle reißt |
| Referenzpreis | als Spalte nützlich | die eigentliche Währung |

**Eine Suche erklärt beim Anlegen, welcher Fall sie ist.** Das ist derselbe
Schalter wie die KI-Bewertung: Beobachten heißt „bewerte das und sag mir
Bescheid", Stöbern heißt „lass mich einfach gucken".

Daraus folgt die Startseite, und zwar als Auslassung: **sie zeigt nur, was eine
Schwelle gerissen hat.** Meistens ist sie kurz. Oft ist sie leer — und eine leere
Startseite ist dann ein Ergebnis („seit Dienstag nichts Bemerkenswertes"), keine
Sackgasse.

### Was die Schwelle reißt

Drei Bedingungen, alle messbar, keine davon Geschmackssache:

1. **Preisabstand zur Referenz.** Der Median vergleichbarer Anzeigen, die wir
   ohnehin schon gescraped haben. Kostet keinen Modellaufruf.
2. **Harte Kriterien erfüllt.** Was der Käufer ausgeschlossen hat, ist
   ausgeschlossen. `scraper/scoring.py` kann das bereits (`evaluate_hard_constraints`).
3. **Kein disqualifizierendes Urteil.** Es ist wirklich das Ding und nicht
   Zubehör, Ersatzteil oder ein Bett statt einer Matratze.

Und die Zeile, die dabeisteht, sagt **warum**:
„35 % unter dem Median für dieses Modell · Duplex-ADF bestätigt".

### Die Kostenregel, die nicht verhandelbar ist

Aus `docs/ROADMAP.md`: *kein Modellaufruf darf von einem einzelnen Käufer
abhängen.* Ein Faktenblatt je Anzeige, Bewertung als reine Funktion gegen die
Absicht des Käufers. Kosten wachsen mit dem Markt, nicht mit der Nutzerzahl.
Jede Entscheidung unten hält sich daran.

---

## Der wichtigste Befund aus der Erkundung

**Die teure Hälfte ist schon gebaut und wird nie erreicht.**

`scraper/pipeline.py` verdrahtet genau das Richtige: Playbook → zwischen-
gespeichertes Faktenblatt → Identität → Dossier → reine Bewertung. Es läuft nur
nie. `pipeline.process_listing()` verlangt, dass die Kaufabsicht ein nicht-leeres
`fields` trägt; der Assistent im Frontend schreibt aber nur
`extraction_criteria`. Also fällt jede Auswertung auf den alten
`agent_worker.py` zurück — ein Modellaufruf je Anzeige je Käufer, ohne
Zwischenspeicher, ohne Wiederverwendung.

Die Folge ist messbar: alle zehn je bewerteten Anzeigen tragen **exakt 50**, weil
ihre Checkliste leer war und der Abdeckungsfaktor damit null ist. Die KI hat in
der Produktion noch nie wirklich gearbeitet.

Das verschiebt den Zuschnitt erheblich: „KI in die Zeile" ist überwiegend
**Anschlussarbeit**, nicht Neubau.

Dazu kommt ein zweiter, kleinerer Bruch an derselben Kette. Welches Playbook für
eine Anzeige gilt, entscheidet `playbooks.playbook_for_url()`, und die Funktion
sucht nach einem Pfadsegment der Form `cNNN`. Gemessen an den 28 Suchen in der
Datenbank trägt **genau eine** eine Kategorie; alle Familien- und Korridorsuchen
sind `k0`, also kategorielos. Die Kategorie steht aber sehr wohl in den Daten —
jede Anzeigen-URL endet auf `…/3481692776-278-9616`, und die mittlere Zahl ist
die Kategorie. Nur erkennt die Funktion sie dort nicht, weil dort kein `c`
davorsteht. Das ist ein regulärer Ausdruck, keine Architekturfrage, und ohne ihn
läuft Phase 5 für jede Suche außer einer ins Leere.

---

## Phase 0 — Die Trennlinie zur Quelle

*ROADMAP P0, bisher offen. Zuerst, damit alles Folgende dagegen gebaut wird.*

Eine kanonische Anzeige-Struktur, die die Oberfläche und die Bewertung
konsumieren, und ein Kleinanzeigen-Adapter dahinter. Bewusst dünn — es gibt eine
Quelle, und ein Framework für hypothetische zweite Quellen wäre Verschwendung.

Das Minimum, das sich jetzt lohnt:
- eine benannte kanonische Form (Identität, Titel, Preis, Ort, Zeitpunkte,
  Quelle, Quell-ID, Rohfelder) als **eine** Stelle im Python und **ein** Typ im
  Frontend
- `scraper/result_list.py` und `scraper/scraper.py` liefern diese Form, statt
  dass jeder Verbraucher Kleinanzeigen-Felder auspackt
- alles Neue in diesem Plan liest nur die kanonische Form

Ausdrücklich **nicht** jetzt: Plugin-Register, mehrere Adapter, generische
Feld-Abbildung.

---

## Phase 1 — Die Sackgasse schließen

*Der akute Schaden. Klein, und das Erste, was jede neue Suche tut.*

Heute sagt die leere Trefferliste „No listings found yet" und bietet einen Knopf,
der dasselbe nochmal tut. Nach der Suche muss dastehen, **was der Lauf getan
hat** und **was jetzt hilft**:

- je Begriff die Trefferzahl, damit sichtbar wird, dass es nicht am Werkzeug lag
- die Erkennung „null Treffer im Radius" als eigener Zustand, nicht als „noch
  nicht gesucht"
- ein gemessener Ausweg: dieselbe Suche bei größerem Radius, mit der echten Zahl
  daneben — bei den Druckern also „30 km: 0 · 100 km: 6 · 200 km: 28"
- ein Knopf, der den Radius übernimmt

Die Messung dafür ist billig: ein Abruf je Begriff und Radius, und der Parser in
`scraper/result_list.py` zählt bereits korrekt nur die echten Treffer innerhalb
von `srchrslt-adtable` — die bundesweiten Vorschläge darunter verwirft er schon.

Dazu die Begriffs-Chips auch im Leerzustand sichtbar halten (steht bereits) und
die Liste scrollbar mit erkennbarem Hinweis, statt eine Zeile auf halber Höhe
abzuschneiden.

---

## Phase 2 — Die Liste zum Einkaufen machen

Drei Dinge fehlen, ohne die keine Liste eine Einkaufsliste ist.

### 2a — Ein Preis, mit dem man rechnen kann

`scraper/result_list.py` **parst bereits** einen numerischen `price_eur`, und
`as_db_listing()` trägt ihn mit. `scraper/main.py` lässt ihn beim INSERT fallen.
Das ist die billigste hochwertige Änderung im ganzen Plan.

Die Altlast ist schmutzig und muss ehrlich behandelt werden: 267 verschiedene
Werte über 1266 Zeilen, 19 leere, 5 „Zu verschenken", und 20 Zeilen mit zwei
aneinandergeklebten Preisen wie `330 € VB360 €`. Was nicht eindeutig ist, bleibt
null, und die Oberfläche zeigt „Preis unklar" statt einer erfundenen Zahl.

> **Korrektur an einer früheren Fassung dieses Plans.** Ich hatte die zwanzig
> Doppelpreise für einen Fehler im laufenden Parser gehalten und „an der Wurzel
> beheben, betroffene Anzeigen neu ernten" geschrieben. Das ist falsch. Der Live-
> Parser ist sauber: `result_list.PRICE_RE` ist ein einzelner Ausdruck, verankert
> an den HTML-Grenzen `>…<`. Die Doppelpreise stammen aus
> `scraper_selenium.py:464`, das zwei Geschwister-Textknoten ohne Trenner
> zusammenzieht — und dieser Pfad läuft nur mit `INTERACTIVE_LOGIN=1`, gegen ein
> Seitenlayout, das es nicht mehr gibt. Es sind zwanzig Altlastzeilen, kein
> laufender Schaden. Also: beim Rückfüllen die **erste** Zahl vor dem ersten `€`
> nehmen — das ist in allen zwanzig Fällen der VB-Preis —, die betroffenen Zeilen
> im Protokoll des Skripts auflisten, und keine `price_ambiguous`-Spalte für
> zwanzig von 1266 Zeilen erfinden.

Damit: Filtern nach Preisspanne, Sortieren nach Preis, und die Grundlage für
Phase 3.

Dazu gehört, mit Lücken umzugehen statt sie zu verstecken. Im heutigen Bestand
fehlt 198 Anzeigen der Ort, 48 das Bild und 19 der Preis. Eine Einkaufsliste, die
dann eine leere Zelle zeigt, sieht kaputt aus; sie muss sagen, was fehlt — die
Regel dafür steht in `RouteResultsView` bereits für den Preis und für die drei
`geo_status`-Fälle.

### 2b — Frische

Heute gibt es keinen Zeitpunkt, der sagt, wann eine Anzeige zuletzt noch da war,
und **nichts erkennt eine verschwundene Anzeige**. `scraper/main.py` benutzt
`INSERT OR IGNORE`; ein Wiederfund rührt die Zeile nicht an. Bei Kleinanzeigen
ist eine drei Wochen alte Anzeige aber meistens weg — eine Einkaufsliste, die das
verschweigt, verschwendet Fahrten.

Es braucht einen Zeitpunkt „zuletzt gesehen", der bei jedem Wiederfund gestempelt
wird. In der Zeile steht dann „vor 2 Stunden" oder „seit 8 Tagen nicht mehr
gesehen".

> **Korrektur an einer früheren Fassung dieses Plans.** Ich hatte „weg" aus dem
> Ausbleiben in den Suchergebnissen ableiten wollen: wenn jede Suche, die eine
> Anzeige je gefunden hat, seitdem gelaufen ist und sie nicht mehr brachte, gilt
> sie als verschwunden. Das ist strukturell falsch. `PAGES_TO_SCRAPE` begrenzt,
> wie viele Ergebnisseiten je Suche geholt werden, und Kleinanzeigen sortiert nach
> Relevanz oder Datum — eine ältere, quicklebendige Anzeige rutscht routinemäßig
> aus dem geholten Seitenbereich, ohne verkauft zu sein. Wer daraus „weg" macht,
> erklärt laufend echte Anzeigen für tot, und der Irrtum ist hinterher nicht mehr
> von einer echten Löschung zu unterscheiden, ohne jede einzelne neu abzurufen.
>
> Das einzige belastbare Signal ist der **Abruf der Detailseite**, den
> `harvest_descriptions` ohnehin schon macht: eine gelöschte Anzeige liefert dort
> eine erkennbare Hinweisseite oder gar keine 200. Also: „zuletzt gesehen" wird
> von zwei positiven Signalen gestempelt — Wiederauftauchen in der Ergebnisliste
> *und* erfolgreicher Detailabruf. „Weg" wird **ausschließlich** vom negativen
> Detailabruf gesetzt, nie vom Ausbleiben in der Liste.
>
> Daraus folgt eine Änderung an der Ernte, die heute noch fehlt: sie besucht nur
> Anzeigen mit `full_info_obtained = 0`, also jede genau einmal. Um Löschungen
> überhaupt zu bemerken, muss sie schon geerntete Anzeigen erneut besuchen, in
> einer Reihenfolge nach „am längsten nicht bestätigt", eine begrenzte Zahl je
> Lauf. Das ist Terminplanung, keine Schemafrage — aber die Spalten müssen für
> diesen Verbraucher gebaut sein.

Ein halber Schritt ist erlaubt und ehrlich: „zuletzt gesehen" ohne „weg". Ein
„weg", das auf dem billigeren falschen Signal beruht, ist schlechter als keines.

### 2c — Wegwischen und Merken

Es existiert **nichts** dafür — kein halbfertiger Ansatz, nichts zum
Wiederverwenden. `listings.status` sieht danach aus, ist es aber nicht: es ist ein
Scraper- und Chat-Zustand, und `backend/server.js:254` setzt ihn bei jeder
Gewichtsänderung bedingungslos auf `New` zurück. Als Träger einer
Nutzerentscheidung ist er unbrauchbar.

Nötig: eine Entscheidung je (Nutzer, Anzeige), die ein erneutes Scrapen überlebt
— wegwischen, merken, und „schon kontaktiert". Weggewischtes verschwindet aus der
Liste, bleibt aber über einen Filter erreichbar. Ohne das bleiben 107 Matratzen
für immer 107.

---

## Phase 3 — Der Referenzpreis

*ROADMAP P6. Kostet keinen Modellaufruf.*

Wir halten bereits vergleichbare Anzeigen. Der Median je Produktidentität ist
damit umsonst zu haben — und er ist die Größe, die aus einer Liste eine
Kaufentscheidung macht.

Zwei Bezugsgrößen, je nachdem, wie viel wir wissen:
- **mit auflösbarer Identität** (Marke + Modell, `scraper/identity.py` kann das):
  Median über alle Anzeigen desselben Modells
- **ohne**: Median über den Suchbegriff

> **Zwei Korrekturen, die den Zuschnitt dieser Phase verschieben.**
>
> Erstens: `identity_key` wird zwar bei jedem Lauf berechnet
> (`pipeline.py:133`, `identity_mod.resolve_or_log`), aber **nirgends
> gespeichert** — es lebt nur im Arbeitsspeicher des Durchlaufs. Die
> gleichnamige Spalte im Schema ist der Primärschlüssel von `dossiers`, nicht ein
> Feld an der Anzeige. Ohne eine Codeänderung in `pipeline.py` bleibt eine
> Referenzpreistabelle also strukturell fertig und dauerhaft leer — genau dieselbe
> Falle wie bei `item_json.fields`.
>
> Zweitens, und unangenehmer: die Abdeckung startet **nicht dünn, sondern bei
> null**. `identity.py` kennt Identitätsfelder für vier Kategorien — Autos,
> Motorräder, Laptops, Handys. Von den 28 Suchen in der Datenbank löst genau eine
> überhaupt ein Playbook auf. Schränke, Matratzen und Drucker haben keines. Der
> identitätsbasierte Median hat heute also **keine einzige** Zeile, auf der er
> rechnen könnte.
>
> Das macht die Phase nicht wertlos, aber es dreht die Reihenfolge um: der
> **begriffsbasierte** Median ist nicht der Rückfall, sondern der Anfang. Er
> funktioniert sofort für Matratzen, Schränke und Drucker. Der identitätsbasierte
> kommt dazu, sobald Phase 5 Playbooks und gespeicherte Identitäten liefert — und
> erst dann lohnt die zweite Bezugsgröße.

In der Zeile erscheint der Abstand, nicht die Referenz: „35 % unter Median".
Sortieren nach Abstand wird damit möglich — und das ist die Sortierung, die ein
Schnäppchenjäger eigentlich will.

Zwei Ehrlichkeitsregeln, beide an den eigenen Daten gemessen:

**Unter einer Mindestzahl von Vergleichsanzeigen wird keine Referenz gezeigt.**
Ein Median aus drei Anzeigen täuscht Sicherheit vor. Der heutige Bestand trägt
das: 1062 bepreiste Laptops, 91 Matratzen, 74 Schränke.

**Eine preisgefilterte Suche taugt nicht als Referenz.** Die Schrank-Suche lautet
`…/preis:10:100/kleiderschrank-ikea/…` — ihr Median von 50 € ist kein Marktpreis,
sondern die Mitte eines selbstgewählten Fensters. Wer daraus „30 % unter Median"
ableitet, misst die eigene Filtereinstellung. Der Referenzwert muss deshalb aus
einer ungefilterten Abfrage stammen, und wo das nicht geht, gibt es keinen. Der
Preisfilter steht als `preis:a:b` im Pfad; `scraper/search_url.py` kennt diese
Form bereits — es überspringt solche Segmente beim Auffinden des Suchbegriffs —,
hat aber noch keine Funktion, die sie ausliest. Das ist ein kleiner Zusatz an
einer Stelle, die die Grammatik ohnehin schon beherrscht.

Ein Hinweis auf die Grenzen: die Matratzenpreise reichen von 1 € bis 3000 €. Der
Median ist gegen solche Ausreißer robust, die Liste darunter ist es nicht — das
ist dieselbe Trennschärfe, die Phase 5 herstellen muss.

---

## Phase 4 — Stöbern oder Beobachten

Der Schalter aus der Strategie, sichtbar gemacht.

- beim Anlegen einer Suche zwei Kacheln mit einem Satz Erklärung, nicht ein
  Fachbegriff im Einstellungsdialog
- jederzeit umschaltbar, wie die Geometrie seit dem letzten Umbau auch
- Beobachten schaltet die KI-Bewertung an und zeigt, was das für diese Suche
  kostet („13 Anzeigen · ca. 0,03 €") — die Zahl steht vor der Entscheidung, nicht
  danach
- Stöbern-Suchen erscheinen nie auf der Startseite und lösen nie einen Modellauf
  aus

Das ist zugleich die Antwort auf „aktiv/passiv", die bisher nur als Datenbankfeld
existiert: `searches.enabled` taucht im Frontend ausschließlich in `types.ts` auf
und in keiner einzigen Ansicht.

---

## Phase 5 — Die KI in die Zeile

Kein Assistent mehr davor, kein eigener Modus. Ein Urteil je Anzeige, eine Zeile.

**Der Anschluss ist die Arbeit.** Die Kaufabsicht muss `fields` tragen, damit
`pipeline.py` überhaupt anläuft. Erst dann greifen Faktenblatt-Zwischenspeicher,
Identität und Dossiers — und erst dann gilt die Kostenregel wirklich.

Schritte:
- die Kaufabsicht als `fields` erzeugen statt als `extraction_criteria`;
  `scripts/make_intent.py` erzeugt so ein Profil bereits aus einem Playbook
- den dreistufigen Kopier-Assistenten durch eine kurze Erhebung ersetzen: was ist
  dir wichtig, was ist Ausschluss. Wenige Felder, keine Runde durch ein fremdes
  Chatfenster
- den Auswertezustand ehrlich machen: heute ein einzelnes Ja/Nein, das
  „eingereiht", „läuft", „fehlgeschlagen" und „veraltet" nicht unterscheiden kann
- eine menschenlesbare Begründung erzeugen. Heute gibt es im Ergebnis mehrere
  mehrsätzige Erklärungen je Dimension, aber **keinen** Einzeiler — der Einzeiler
  muss im Schema entstehen, nicht aus Fragmenten zusammengeklebt werden
- die fahrzeugspezifischen Annahmen entfernen: `listingTransformer.ts` zieht
  `Kilometerstand`, `Erstzulassung` und `Hubraum` aus **jeder** Anzeige, und der
  Assistent backt „Max Mileage" in die Prompts jeder Kategorie

---

## Phase 6 — Die Startseite

Erst jetzt, weil sie ohne Phase 3 und 5 nichts zu zeigen hätte.

- was die Schwelle gerissen hat, mit Bild, Preis, Preisabstand, Entfernung oder
  Umweg, Alter und der einen Zeile Begründung
- nur aus Beobachten-Suchen
- leer ist ein gültiger, gut gestalteter Zustand mit dem Datum des letzten Funds
- die Suchenverwaltung rutscht eine Ebene tiefer und heißt überall gleich

Das heutige rote „1060 New" auf der Laptop-Kachel verschwindet dabei: es zählt
Anzeigen ohne KI-Bewertung, nicht neue Funde, und ist deshalb seit Monaten
dieselbe Zahl.

---

## Phase 7 — Sprache und Beiwerk

Durchgehend, nicht als eigener Meilenstein — aber einmal als Durchgang.

- **Eine Sache, ein Name.** Heute: „Searches", „Search Profile", „Targets",
  „Matches", „Campaign", „Targets & Guidelines", „Family settings", und im Code
  zusätzlich `searches`, `targets`, `campaigns`, `families`.
- **Keine Maschinensprache.** „Basis-Such-URL" ist die Arbeit, die das Werkzeug
  abnehmen soll. Langfristig: fragen, was gesucht wird, wo und zu welchem Preis —
  und die Adresse selbst bauen. Das Werkzeug dafür (`scraper/search_url.py`)
  existiert bereits, es baut heute schon Begriff und Ort in jede URL ein.
- **Der rote Balken.** „Kleinanzeigen: Nicht verbunden" ist das Auffälligste auf
  jedem Bildschirm und betrifft nur das Kontaktieren von Verkäufern, nicht das
  Suchen. Er gehört dorthin, wo er gebraucht wird.
- **Löschen** sitzt direkt neben „Dashboard öffnen", ohne sichtbare Sicherung.
- **Leerzustände** sind uneinheitlich: von sieben bieten zwei eine Handlung an.
  Ein Muster für alle: Symbol, Überschrift, ein Satz, eine Handlung.
- **Überlagerungen**: vier handgeschriebene Umsetzungen desselben Musters
  (mobiles Menü, mobile Detailansicht, Korridor-Schublade, Familien-Dialog). Eine
  reicht.
- **Toter Code**: `CriteriaTuner.tsx` ist nirgends eingebunden.
- **Sprachparität**: nichts erzwingt, dass ein neuer Schlüssel auch auf Deutsch
  existiert — der Typ leitet sich allein aus dem englischen Baum ab, und ein
  fehlender deutscher Schlüssel fällt zur Laufzeit still auf Englisch zurück.

---

## Phase 8 — Damit es trägt

Heute unsichtbar, bei einer Einkaufsoberfläche schnell nicht mehr.

- `GET /api/listings` liefert **jede** Zeile mit **jeder** Spalte, ohne Grenze —
  rund 3 MB für die heutigen 1266. Der Client verwandelt alle, bevor er nach
  Kampagne filtert.
- Der einzige angelegte Index in der ganzen Datenbank ist einer auf
  `listing_search_hits`. `listings.search_id`, `listings.niceness_score`,
  `searches.campaign_id` und die Familien-Verknüpfungen sind alle heiß und alle
  ohne Index.
- Der Familien-Endpunkt kann bereits `limit`/`offset` — sein einziger Aufrufer
  benutzt beides nicht.
- Es gibt keine Aufbewahrungsregel. 1070 der 1266 Anzeigen gehören einer
  aufgegebenen Suche.

---

## Der Datenteil, in der Reihenfolge, in der er sicher ist

`db/schema.sql` erlaubt ausschließlich Hinzufügen; neue Spalten kommen in den
`ALTER TABLE`-Abschnitt unten, in dem bereits vier stehen. Vor jeder Migration
ein `VACUUM INTO`-Backup.

**Quelle, zuerst.** `listings.source` (voreingestellt `kleinanzeigen`) und
`listings.source_id`. Beides ist jetzt trivial und später teuer: sobald eine
zweite Quelle Anzeigen liefert, kollidieren die Schlüssel, und jede Tabelle, die
inzwischen auf `listings.id` zeigt, muss angefasst werden. Das ist die ganze
Phase 0 auf Datenebene.

**Preis, zweistufig.** Erst den Parser reparieren, dann rückfüllen — nicht
umgekehrt, sonst wird der Fehler in die Spalte einbetoniert. Die zwanzig Zeilen
der Form `330 € VB360 €` sind kein Schmutz aus der Quelle, sondern zwei
zusammengeklebte Preiselemente aus `scraper/result_list.py`; die gehören an der
Wurzel behoben und die betroffenen Anzeigen neu geerntet. Danach
`listings.price_eur INTEGER`:

- „Zu verschenken" wird **0**, nicht null. Verschenkt ist ein echter Preis und
  für einen Schnäppchenjäger der interessanteste.
- Leere und mehrdeutige Werte bleiben **null**, und die Oberfläche sagt „Preis
  unklar".
- Der Wert entsteht aus dem bereits vorhandenen `price_eur` in
  `result_list.as_db_listing()`, das heute vor dem INSERT verlorengeht — keine
  zweite Regex.

**Rückfüllungen sind Daten, nicht Schema.** `db/schema.sql` wird von beiden
Anwendern naiv an `;` zerlegt und kennt nur DDL. Für genau diesen Fall gibt es
bereits ein Vorbild: `backfillListingTimestamps()` in `backend/server.js:92-114`,
einmal aus `seedDefaultUser()` gerufen, durch ein `WHERE … IS NULL` so bewacht,
dass ein Lauf bei jedem Start harmlos ist. Die Preisrückfüllung gehört
danebengestellt und **nicht** nach `scraper/db_schema.py` — dort hängt sie an
jedem kurzlebigen Python-Aufruf. Der Node-Dienst ist der einzige lang laufende
Prozess und damit der richtige Besitzer einmaliger Rückfüllungen.

**Frische: zwei Spalten, die zusammen gehören.** Ein `last_seen_at` allein wäre
gelogen, weil nichts es schreibt: der Import benutzt `INSERT OR IGNORE`, ein
Wiederfund rührt die Zeile nicht an. Der billigste richtige Weg ist kein zweites
Statement, sondern ein Upsert — `ON CONFLICT(id) DO UPDATE SET last_seen_at =
excluded.last_seen_at` —, der neue Zeilen vollständig anlegt und bei bekannten
ausschließlich den Zeitstempel nachzieht, ohne Titel oder Preis zu überschreiben.
Die SQLite-Version im Projekt vorher prüfen.

`last_seen_at` und `delisted_at` werden **gemeinsam** ausgeliefert, und zwar
genau damit niemand versucht ist, ein `delisted_at` auf dem billigeren falschen
Signal als Zwischenlösung einzuziehen. Die Begründung steht in Phase 2b.

**Entscheidungen des Nutzers, eigene Tabelle.** `listing_triage` mit
`(listing_id, user_id)` als Schlüssel, Zustand (`kept`, `dismissed`), Zeitpunkt.
Keine Zeile heißt „noch nicht entschieden" — dieselbe dünne Befüllung wie bei
`listing_search_hits`, kein Sonderfall nötig.

Der Grund für eine Tabelle ist **nicht**, dass sie erneutes Scrapen überlebt; das
täte eine Spalte an `listings` genauso, weil `INSERT OR IGNORE` bei bekannter
Zeile ohnehin nichts anfasst. Der Grund ist `users`: die Tabelle existiert, und
`authenticateToken` füllt `req.user` bereits bei jeder Anfrage. Eine einzelne
globale Spalte sieht heute richtig aus und erzwingt am Tag des zweiten Nutzers
eine Migration über die interessanteste Tabelle. Der Verbund kostet bei 1266
Zeilen nichts.

Eine Falle dabei: die Nutzerkennung an den Aufrufstellen **aus `req.user.id`
lesen**, nicht als Konstante einsetzen, weil es gerade nur einen Nutzer gibt.
Sonst ist die Tabelle richtig geschnitten und jede Aufrufstelle falsch.

`listings.status` bleibt, wo es ist, und wird **nicht** für Triage benutzt. Es
gehört dem Scraper und dem Chat-Abgleich. Zusammen mit dieser Tabelle muss
allerdings der Rücksetzer in `backend/server.js:254` weg, der bei jeder
Gewichtsänderung bedingungslos auf `New` zurückstellt — sonst streiten sich zwei
Mechanismen darüber, was „kontaktiert" heißt.

**Referenzpreis, eigene Tabelle.** Bereich (`identity` oder `term`), Schlüssel,
Median, Stichprobengröße, Zeitpunkt. Wird berechnet, nicht bei jeder Abfrage
ermittelt, und trägt die Stichprobengröße mit, weil die Oberfläche unterhalb
einer Mindestzahl nichts anzeigen darf.

Sie heißt **nicht** `price_band`. Der Name ist vergeben: `dossiers.py:40` führt
`price_band` als recherchierte, mit Quellen belegte und mit Verfallsdatum
versehene Behauptung. Ein selbst gerechneter SQL-Median und eine belegte
Modellaussage haben verschiedene Herkunft, und derselbe Name macht diesen
Unterschied für den nächsten Leser unsichtbar. `identity_price_stats` oder
Ähnliches.

Und, wie oben in Phase 3 begründet: die identitätsbasierte Hälfte braucht
zwingend, dass `pipeline.py` den berechneten `identity_key` an der Anzeige
**speichert**. Spalte und Schreibstelle gehören in dieselbe Auslieferung, sonst
steht eine fertige Tabelle da, die nie eine Zeile bekommt.

**Indizes.** Heute existiert genau einer in der ganzen Datenbank. Nötig, jeweils
für eine nachweisbare Abfrage: `listings(search_id)` für jede Kampagnenansicht,
`listings(last_seen_at)` und `listings(price_eur)` für die neuen Sortierungen,
`searches(campaign_id)`, `search_family_searches(family_id)` und
`search_family_terms(family_id)` für die Familienabfrage, `listing_decisions(listing_id)`
für das Ausblenden.

**Reihenfolgefallen:**

- **Quelle zuerst.** `listings.source` ist das einzige Stück in diesem ganzen
  Plan, das sich später **nicht** korrekt nachfüllen lässt. Sobald Zeilen einer
  zweiten Quelle ohne Unterscheidungsmerkmal in derselben Tabelle liegen, bleibt
  nur noch Raten anhand der URL. Alles andere hier ist umkehrbar.
- **`CREATE INDEX` muss im Datei­text unter dem zugehörigen `ALTER` stehen.**
  Beide Anwender führen `db/schema.sql` strikt von oben nach unten aus, und auch
  eine frische Installation legt diese Spalten über den unteren
  `ALTER`-Abschnitt an. Ein Index auf `price_eur`, der weiter oben steht,
  scheitert bei der Neuinstallation an einer Spalte, die es zu dem Zeitpunkt noch
  nicht gibt.
- **`identity_key`-Spalte nie ohne die Schreibstelle in `pipeline.py`.**
- **Die Referenzpreis-Berechnung nicht anschalten**, bevor `price_eur` gefüllt
  ist — sonst entsteht ein „Marktpreis" aus einer Handvoll Zeilen, der
  autoritativ aussieht. Die Anzeige muss von Tag eins an an der Stichprobengröße
  hängen.
- **`last_seen_at` nie ohne den Upsert** — eine Spalte, die niemand schreibt,
  sieht aus, als sei der ganze Bestand veraltet.
- **Die Triage-Tabelle nie ohne den Status-Rücksetzer in `backend/server.js:254`.**
- **Nichts in `listings.status` schreiben oder daraus lesen**, solange dieser
  Rücksetzer steht.
- Indizes auf `last_seen_at` und `delisted_at` bewusst **noch nicht** — es gibt
  bis zur Umstellung der Ernte keine Abfrage, die darauf filtert. Sie kommen
  zusammen mit ihr, als Einzeiler.

---

## Zuschnitt für die Umsetzung

Die Phasen sind nach Wirkung geordnet, nicht nach Abhängigkeit. Tatsächlich
abhängig ist nur wenig, und das lohnt sich zu wissen, damit mehrere Agenten
parallel arbeiten können, ohne sich in dieselben Dateien zu setzen.

**Echte Abhängigkeiten, sonst keine:**

```
Phase 0  kanonische Anzeige ──┬──► alles Weitere liest nur diese Form
                              │
Phase 2a numerischer Preis ───┴──► Phase 3 Referenzpreis ──► Phase 6 Startseite
                                                   ▲
Phase 5  Playbook + Absicht ───────────────────────┴──► Phase 6
```

Phase 1 (Sackgasse), Phase 2b (Frische), Phase 2c (Wegwischen), Phase 7
(Sprache) und Phase 8 (Skalierung) hängen an nichts und können jederzeit laufen.

**Paketschnitt nach Dateibesitz**, damit zwei Agenten nie dieselbe Datei
anfassen:

| Paket | Besitzt | Phasen |
|---|---|---|
| Quelle & Ernte | `scraper/result_list.py`, `scraper/scraper.py`, `scraper/main.py`, Schema | 0, 2a, 2b |
| Bewertung | `scraper/playbooks.py`, `pipeline.py`, `extraction.py`, `identity.py` | 5, 3 (Rechenteil) |
| Ausliefern | `backend/server.js`, `backend/db/` | 2c, 3 (Endpunkt), 8 |
| Oberfläche Liste | `RouteResultsView.tsx`, `ListingDetailCard.tsx` | 1, 2 (Anzeige), 3 (Anzeige) |
| Oberfläche Rahmen | `App.tsx`, `translations.ts`, `components/ui/` | 4, 6, 7 |

`App.tsx` mit seinen 2371 Zeilen ist der Engpass: drei der Phasen wollen
hinein. Wer daran arbeitet, arbeitet allein — oder die Datei wird vorher
zerlegt, was ohnehin überfällig ist.

---

## Ausdrücklich nicht in diesem Plan

- **Mehrbenutzerbetrieb** (Gruppe E in `PROPOSALS.md`, sieben Einträge). Zuletzt,
  wie besprochen.
- **Bildauswertung.** Nicht gut genug, und ausdrücklich verworfen.
- **Eine zweite Datenquelle.** Die Trennlinie wird gezogen, die Quelle nicht
  gebaut.
- **Der Recherche-Agent** (ROADMAP P4). Er braucht ein Suchwerkzeug, sonst
  erfindet er Quellen — gemessen: neun von neun Quellenangaben frei erfunden.

---

## Abnahme

Für jede Phase gilt derselbe Maßstab wie bisher in diesem Projekt:

```bash
buildlock ./venv/bin/pytest scraper/ -q
cd frontend && npm run build && npm run lint && npm test
./venv/bin/python scripts/ui_shots.py             # und die Bilder ansehen
./venv/bin/python scripts/ui_shots.py --width 390 # und diese auch
```

Regeln, die sich in diesem Projekt bereits bezahlt gemacht haben:

- **Jeder neue Test wird einmal gegen absichtlich kaputten Code gelaufen**, bevor
  er behalten wird. Ein Test, der dann nicht fehlschlägt, prüft nichts.
- **Niemals in `data/scraper.db` schreiben.** Lesen nur über
  `file:data/scraper.db?mode=ro`, Schreiben nur gegen eine Kopie über
  `PRISMDEALS_DB`. Vor jeder Migration ein `VACUUM INTO`-Backup.
- **Niemals `backend/db_setup.js --recreate`.**
- Höchstens eine Anfrage pro Sekunde an kleinanzeigen.de.
- `db/schema.sql` nur erweitern, neue Spalten per `ALTER` im unteren Abschnitt.
- Keine Schlüssel oder Inhalte von `scraper/config.py` in Ausgaben oder Commits.

Und eine Abnahme, die über Tests hinausgeht: **die Druckersuche muss den Weg
gehen können.** Dreizehn Modelle, dreißig Kilometer, null Treffer — und die
Oberfläche führt von dort ohne fremde Hilfe zu den achtundzwanzig Treffern bei
zweihundert Kilometern.
