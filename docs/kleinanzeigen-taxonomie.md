# Kleinanzeigen-Taxonomie und URL-Filtergrammatik

Dieses Dokument beschreibt die Struktur der Kleinanzeigen-Kategorien, die vollständige URL-Filtergrammatik, die Vorgehensweise bei der Ernte sowie die Detailanalyse der vier Zielkategorien (Laptops, Kleiderschränke, Matratzen, Drucker/Scanner).

---

## 1. Vorgehensweise und Datenquellen

### 1.1 Erkundung offener Endpunkte vs. HTML
1. **JSON-Dienste überprüft**:
   - `s-ort-empfehlungen.json`: Funktioniert und liefert Orts-IDs (z. B. `{"_3331": "Berlin"}`).
   - `s-kategorie-empfehlungen.json`, `s-kategorien.json`, `s-category-recommendations.json`: Liefern 404/400.
   - `api.kleinanzeigen.de`: Antwortet mit 401 Unauthorized.
   - **Befund:** Für Kategorien und Filter existiert kein offener JSON-Endpunkt. Die Datenquelle ist das serverseitig gerenderte HTML von Kleinanzeigen.
2. **HTML-Struktur**:
   - Die Startseite (`/`) listet 158 Kategorien mit numerischer ID (`c<id>`) und Slugs.
   - Unterkategorieseiten verlinken auf weitere Spezialkategorien (insgesamt **161 Kategorien**).
   - Filter und Facetten werden im DOM in `<details class="collapsible-filter-section">` strukturiert.
   - Dynamisch nachgeladene Menüs (z. B. Marken, Farben, Prozessoren) werden von Astro in `<astro-island props="...">` als serialisiertes JSON mit allen Optionen ausgeliefert.

### 1.2 Drosselung und Caching
- Das Erntewerkzeug [`scripts/harvest_taxonomy.py`](file:///home/flo/docker-projects/prismdeals/.wt/prismdeals-kleinanzeigen-kategorien/scripts/harvest_taxonomy.py) erzwingt eine strikte Drossel von mindestens **1,10 Sekunden** zwischen aufeinanderfolgenden Live-Anfragen an `kleinanzeigen.de`.
- Jede abgerufene Seite wird unter `data/taxonomy_cache/<md5_hash>.html` zwischengespeichert. Wiederholte Durchläufe belasten den Server nicht.

---

## 2. Die vollständige Adressgrammatik für Filter

Eine Kleinanzeigen-Suchadresse besteht aus vier Zonen:

```text
https://www.kleinanzeigen.de/s-<ort-oder-kategorie-slug>/[<facet-segmente>/]<suchbegriff-slug>/k0c<kategorie_id>[+<attribut_key>:<wert>...]l<ort_id>r<radius>
                             └─────────── 1. Basis ────────┘ └──── 2. Pfadfilter ───┘ └── 3. Begriff ─┘ └──────────────── 4. Schwanz (Tail) ────────────────┘
```

### 2.1 Pfad-Facetten (Zone 2: Vor dem Suchbegriff)
Plattformweite Filter werden als eigene Pfadsegmente vor dem Suchbegriff eingefügt:

| Filter | URL-Segment | Beispiel |
|---|---|---|
| **Preis** | `preis:<min>:<max>` | `/preis:100:500/` oder `/preis::200/` |
| **Anbieter** | `anbieter:<privat\|gewerblich>` | `/anbieter:privat/` |
| **Angebotstyp** | `anzeige:<angebote\|gesuche>` | `/anzeige:angebote/` |
| **Direkt kaufen** | `direktkaufen:aktiv` | `/direktkaufen:aktiv/` |
| **Paketdienst** | `paketdienst:<dhl\|hermes>` | `/paketdienst:dhl/` |

### 2.2 Kategoriespezifische Attributfilter (Zone 4: Im Schwanz)
Kategoriespezifische Filter werden **direkt an die Kategoriekennung `c<id>` im Schwanz angehängt**, eingeleitet mit einem Pluszeichen `+`:

```text
k0c<kategorie_id>+<attribut_key>:<wert>
```

#### A. Enum- / Auswahlfilter
- **Syntax:** `+<attribut_key>:<wert>`
- **Beispiele:**
  - `c278+notebooks.brand_s:apple` (Marke Apple bei Notebooks)
  - `c278+notebooks.ram_s:16gb` (16 GB RAM)
  - `c278+global.zustand:like_new` (Zustand: Sehr gut)
  - `c278+global.farbe:silver` (Farbe: Silber)

#### B. Numerische Bereiche (Ranges)
- **Syntax:** `+<attribut_key>:<min>,<max>` (oder offen: `+<attribut_key>:<min>,` bzw. `+<attribut_key>:,<max>`)
- **Beispiele:**
  - `c216+autos.km_i:10000,50000` (Kilometerstand 10.000 bis 50.000 km)
  - `c216+autos.ez_i:2018,2022` (Erstzulassung 2018 bis 2022)
  - `c203+wohnung_mieten.qm_d:50,100` (Wohnfläche 50 bis 100 m²)

#### C. Boolesche Optionen (Checkboxen)
- **Syntax:** `+<attribut_key>:true`
- **Beispiele:**
  - `c216+autos.air_conditioning_b:true` (Klimaanlage)
  - `c216+autos.trailer_coupling_b:true` (Anhängerkupplung)
  - `c203+wohnung_mieten.furnished_b:true` (Möbliert)
  - `c203+wohnung_mieten.balcony_b:true` (Balkon)

#### D. Mehrfachauswahl (Multi-Select)
Für mehrere Werte desselben Filters sind zwei äquivalente Notationen gültig:
1. **Kommagetrennt:** `+notebooks.brand_s:apple,lenovo`
2. **Gekettet:** `+notebooks.brand_s:apple+notebooks.brand_s:lenovo`

---

## 3. Detailanalyse der vier Kern-Kategorien

### 3.1 Laptops / Notebooks (`c278`)
- **Hierarchie:** `Elektronik` (`c161`) > `Laptops & Notebooks` (`c278`)
- **Verfügbare Filter:**
  - `notebooks.type_s`: `laptop`, `gaming_laptop`, `convertible_2_in_1`
  - `notebooks.brand_s`: `apple`, `lenovo`, `hp`, `asus`, `acer`, `dell`, `microsoft`, `samsung`, `msi`, `toshiba`, `huawei`, `razer`, `lg`, `xiaomi`, `other`
  - `notebooks.operating_system_s`: `windows`, `macos`, `chromeos`, `linux`, `other`
  - `notebooks.screen_size_s`: `up_to_12`, `13`, `14`, `15`, `16`, `17_and_up`
  - `notebooks.model_year_s`: `2018` bis `2026`, `another_year`
  - `notebooks.processor_s`: `intel_core_i3/i5/i7/i9`, `intel_core_ultra_5/7/9`, `amd_ryzen_3/5/7/9`, `apple_m1/m2/m3/m4`, `qualcomm_snapdragon_x`, `other_processor`
  - `notebooks.ram_s`: `4gb`, `8gb`, `16gb`, `24gb`, `32gb`, `64gb`, `other`
  - `notebooks.storage_s`: `128gb`, `256gb`, `512gb`, `1tb`, `2tb`, `other`
  - `notebooks.versand_s`: `ja`, `nein`
  - `global.farbe`: `black`, `silver`, `gray`, `white`, `blue`, `gold`, `green`, `pink`, `another_color`
  - `global.zustand`: `new`, `like_new`, `ok`, `alright`, `defect`

### 3.2 Kleiderschrank (`c81` / `c88`)
- **Hierarchie:** `Haus & Garten` (`c80`) > `Schlafzimmer` (`c81`) / `Wohnzimmer` (`c88`)
- **Verfügbare Filter:**
  - `schlafzimmer.art_s`: `schraenke`, `betten`, `lattenroste`, `matratzen`, `nachttische`, `sonstiges`
  - `global.material`: `wood` (Holz), `solid_wood` (Massivholz), `oak` (Eiche), `pine` (Kiefer), `fabric` (Stoff), `metal` (Metall), `glass` (Glas), `leather` (Leder), `steel` (Stahl), `formica` (Schichtstoff), `lacquered` (Lackiert), `rattan_wicker`, `other`
  - `global.farbe`: 20 Farben (`wei%C3%9F`, `holz`, `grau`, `braun`, `schwarz`, `beige`, `blau`, etc.)
  - `global.zustand`: `new`, `like_new`, `ok`, `alright`
  - **Hinweis:** Spezifische Schrankmaße (Breite/Höhe in cm) existieren nicht als numerische URL-Filter, sondern werden über den Suchbegriff-Slug (z. B. `kleiderschrank-2-tuerig-weiss`) formuliert.

### 3.3 Matratze 140x200 (`c81`)
- **Hierarchie:** `Haus & Garten` (`c80`) > `Schlafzimmer` (`c81`)
- **Verfügbare Filter:**
  - `schlafzimmer.art_s`: `matratzen` (URL: `/s-schlafzimmer/matratzen/c81+schlafzimmer.art_s:matratzen`)
  - `global.zustand`, `global.material`, `global.farbe`, `schlafzimmer.versand_s`
  - **Hinweis:** Die Abmessung `140x200` wird als Suchbegriff-Slug in den Pfad eingebettet: `/s-schlafzimmer/matratzen/140x200/c81+schlafzimmer.art_s:matratzen`.

### 3.4 Laserdrucker mit Duplex-ADF (`c225`)
- **Hierarchie:** `Elektronik` (`c161`) > `PC-Zubehör & Software` (`c225`)
- **Verfügbare Filter:**
  - `pc_zubehoer_software.art_s`: `drucker_scanner` (URL: `/s-pc-zubehoer-software/drucker_scanner/c225+pc_zubehoer_software.art_s:drucker_scanner`)
  - `pc_zubehoer_software.versand_s`: `ja`, `nein`
  - `global.zustand`: `new`, `like_new`, `ok`, `alright`, `defect`
  - **Hinweis:** Untereigenschaften wie „Laser“, „Duplex“ oder „ADF“ existieren nicht als getrennte Checkbox-Attribute im Kleinanzeigen-Filter, sondern werden als Suchbegriff-Slug übergeben (`laserdrucker-duplex-adf`).

---

## 4. Gesamtergebnis und Statistiken

Die maschinenlesbare Taxonomie ist in [`data/kleinanzeigen_taxonomy.json`](file:///home/flo/docker-projects/prismdeals/.wt/prismdeals-kleinanzeigen-kategorien/data/kleinanzeigen_taxonomy.json) abgelegt:

- **Gesamtzahl der Kategorien:** 161
  - 13 Hauptkategorien (z. B. Auto, Rad & Boot; Elektronik; Haus & Garten; Mode & Beauty; Immobilien; Jobs)
  - 148 Unterkategorien
- **Kategorien mit Filtern:** 161
- **Filter-Typen:**
  1. `path_range`: Preiseingrenzung im Pfad (`/preis:min:max/`)
  2. `path_facet`: Anbieter, Angebotstyp, Direkt kaufen, Paketdienst im Pfad
  3. `attribute_enum`: Kategoriespezifische Auswahlen im Schwanz (`+<key>:<val>`)
  4. `attribute_range`: Numerische Bereiche im Schwanz (`+<key>:<min>,<max>`)
  5. `attribute_boolean`: Boolesche Optionen im Schwanz (`+<key>:true`)

---

## 5. Grenzen und was sich nicht über die URL ausdrücken kann

1. **Nicht-existierende Attributfilter**:
   - Für Möbelabmessungen (Schrankbreite, Bettenmaße) oder Druckereigenschaften (Duplex, Laser vs. Tinte) existieren keine nativen Kleinanzeigen-Attributfilter. Sie müssen über den Suchbegriff-Slug abgedeckt werden.
2. **Sortierung vs. Filter**:
   - Die Sortierung (`sortingField=SORTING_DATE` / `SORTING_PRICE`) wird über URL-Query-Parameter (`?sortingField=...`) bzw. Standardeinstellungen gesteuert und ist kein Filter-Attribut im Pfad/Schwanz.
3. **Reine JavaScript-UI-Zustände**:
   - Umschalten zwischen Galerie- und Listenansicht (`viewMode`) oder das Öffnen/Schließen von Filter-Akkordeons ist rein clientseitig und wird nicht in der Such-URL persistiert.
