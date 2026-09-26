# Plan: signals in the list — chips, proposals, weights

What a buyer cares about beyond the must-haves is visible in every row, proposed from
the market, and weighted in the score, the same way for every kind of goods. Builds on
the product graph (docs/plan-product-graph.md): attributes, facts, conditions, verdict.

## 1. Principles
- One mechanism for every category. No list of "important facts per category" in
  code; `frontend/src/utils/specChips.ts` (RAM/vehicle regexes) is deleted.
- Two kinds of chips: **yes/no** (ABS ✓, Unfall ✗) and **values** (16 GB, 90×200, EZ 2009).
- A chip shows only what the offer states. Unstated facts get no chip; a must stays
  visible through the verdict.
- Proposals come from the offers actually found, with their frequency, and belong to the
  product node: the next hunt for the same product gets them without a model call.
- Every reader a proposal brings is checked on real titles (`define_attributes`).

## 2. Generalization check (the 8 live hunts)
| Hunt | Kind | yes/no chips | value chips | preference among targets |
| --- | --- | --- | --- | --- |
| CBR / R1 | model + generation | ABS ✓, Scheckheft ✓, Unfall ✗ | EZ, km | SC59 Facelift before SC59 |
| Ventilator | class | Fernbedienung ✓, Timer ✓, defekt ✗ | Bauform | HT-900 before any fan |
| Corsair | model + spec | OVP ✓, Rechnung ✓ | 2×16 GB, CL16, 3200 | — (one target) |
| Drucker | 13 models | Duplex ✓, Toner neu ✓, Fehler ✗ | Seitenzähler | L2750DW before L2740DW |
| Laptop | whole category | Rechnung ✓, Akku schwach ✗ | RAM, SSD, CPU | — (one target) |
| Matratze | class, taste | Nichtraucher ✓, Flecken ✗ | 90×200, Härtegrad | — |
| Kleiderschrank | class, size | Lieferung ✓, Abbau selbst ✗ | Breite, Farbe | — |
| Motorrad | whole category, open | ABS ✓, Unfall ✗ | Marke, ccm | — |
- Taste that only a photo shows (Stil, Farbe ohne Text) is out of scope until photos are read.
- Many targets (Drucker): proposals hang at the targets' lowest common node, not per target.

## 3. Data model
- `hunt_conditions.weight` INTEGER, −3…+3, default +2 for wishes. Meaning:
  - `importance = must` → gate (unchanged); weight unused.
  - `importance = wish`, weight > 0 → plus; < 0 → minus (present costs); 0 → shown, not scored.
  - A hard exclusion stays a must with op `absent` ("ohne Unfall").
- `hunt_targets.weight` INTEGER 0…3: preference among targets (★). 0 for all = no preference.
- `node_signals` — proposals per node, shared by all hunts:
  `node_id, attr_id, polarity (plus|minus|value), default_weight, found, total, proposed_at`.
  Refreshed when the node's offers doubled or after 30 days.

## 4. Proposals (after a hunt's first crawl)
- Trigger: `refine` of a hunt with ≥ 20 offers and no fresh `node_signals` at its node.
- Node: the targets' lowest common ancestor below or at the category.
- One model call over ≤ 60 offers of that node (title + first 300 chars of description):
  "which facts vary between these offers and change what a buyer would pay or want" →
  5–12 signals `{label, kind yes/no|value, polarity, default_weight, hint}`.
- Each goes through `define_attributes` (readers checked on real titles); failures are dropped.
- Frequency: read the facts of the node's offers; `found` = offers stating it.
- API: `GET /api/hunts/:id/signals` → proposals not yet in the hunt, with `found/total`;
  accepting one = a condition added via `PUT /api/hunts/:id` (importance wish, the weight).

## 5. Weights in the score
- Identity axis = Σ w·s / Σ |w| over the hunt's wishes:
  - plus (w > 0): stated yes = 1, stated no = 0, unstated = 0.5;
  - minus (w < 0): stated yes = 0, stated no or unstated = 1.
- Target preference: the listing's target weight adds to identity as one more term.
- Defaults from the model's `default_weight`; the buyer changes them in one tap (−3…+3 as
  "stark minus … stark plus"). Asking the buyer is optional: the defaults are usable.

## 6. Chips (computed once, backend)
- `huntListings` adds `listing.chips = [{text, tone: good|bad|value}]`, at most 5, so the
  list, the detail sheet, the map popup and the comparison all show the same.
- Order: yes/no chips of conditions by |weight| (stated only), then value chips.
- Value chips, chosen per hunt, not per category: attributes in conditions first, then
  the market model's pricing facts of the target node (`market.js` knows them), then the
  node's attributes stated by most offers. Formatted by attribute type and unit.

## 7. Row layout
- Photo 72 px · text column full width · narrow right column.
- Title two lines; line 3 value chips; line 4 yes/no chips.
- Price ~20 px with "VB" small; score a small badge under it.
- CI shots at 360/480/1440: no chip row wider than the row, no button on two lines.

## 8. Build order
1. **S1** chips from existing conditions + value chips + layout; delete `specChips.ts`.
2. **S2** `weight` on conditions and targets, score formula, weight control in the editor.
3. **S3** `node_signals`: proposal call, frequency, API, "Vorschläge" sheet in results.
4. **S4** target preference (★) in the editor.
Each step: tests that fail on the old code, played on a copy of the live DB across all 8
hunts, screenshots looked at.

## 9. Risks
- Proposals that are noise ("Farbe schwarz" for motorcycles): frequency and the buyer's
  tap decide; weight 0 hides them from the score.
- Readers that misread: only verified readers are stored.
- Too many chips on a phone: hard cap 5, ordered by weight.
