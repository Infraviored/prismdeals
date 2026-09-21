/**
 * The Kleinanzeigen category tree and the filters each category offers.
 *
 * Served from data/kleinanzeigen_taxonomy.json, harvested once by
 * scripts/harvest_taxonomy.py. 161 categories, 714 KB -- too much to hand a
 * phone in one piece, so the tree goes out without its filters and one
 * category's filters are fetched when somebody picks it.
 *
 * Read once at startup and kept in memory: it changes when the harvester runs,
 * not while the server does.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const SOURCE = path.join(__dirname, '..', 'data', 'kleinanzeigen_taxonomy.json');

let loaded = null;

function load() {
  if (loaded) return loaded;
  try {
    const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
    const categories = Array.isArray(raw.categories) ? raw.categories : [];
    loaded = {
      version: raw.version || null,
      generatedAt: raw.generated_at || null,
      // The tree a picker needs: no filters, so it stays a few tens of kB.
      tree: categories.map(c => ({
        id: String(c.id),
        name: c.name,
        slug: c.slug,
        parent_id: c.parent_id ? String(c.parent_id) : null,
        parent_name: c.parent_name || null,
        is_top_level: !!c.is_top_level,
        filter_count: Array.isArray(c.filters) ? c.filters.length : 0,
      })),
      byId: new Map(categories.map(c => [String(c.id), c])),
    };
  } catch (err) {
    console.error('Taxonomy unavailable:', err.message);
    loaded = { version: null, generatedAt: null, tree: [], byId: new Map() };
  }
  return loaded;
}

router.get('/api/taxonomy/categories', (req, res) => {
  const data = load();
  if (data.tree.length === 0) {
    // Saying so beats serving an empty tree that looks like "no categories".
    return res.status(503).json({ error: 'Taxonomy not harvested' });
  }

  const q = (req.query.q || '').trim().toLowerCase();
  const tree = q
    ? data.tree.filter(
        c => c.name.toLowerCase().includes(q) || (c.parent_name || '').toLowerCase().includes(q)
      )
    : data.tree;

  res.json({ version: data.version, generated_at: data.generatedAt, categories: tree });
});

router.get('/api/taxonomy/categories/:id', (req, res) => {
  const category = load().byId.get(String(req.params.id));
  if (!category) return res.status(404).json({ error: 'Unknown category' });

  res.json({
    id: String(category.id),
    name: category.name,
    slug: category.slug,
    parent_name: category.parent_name || null,
    filters: Array.isArray(category.filters) ? category.filters : [],
  });
});


// A German search term against the taxonomy.
//
// Matching category names alone found almost nothing, because the words people
// type are not what the categories are called: "Drucker" lives under
// "PC-Zubehör & Software", "Matratze" under "Schlafzimmer", "Sofa" under
// "Wohnzimmer". The word is in the filter values -- `art_s:drucker_scanner` --
// which is exactly where the site itself keeps the distinction.
//
// So a match carries the filter it matched on, and picking the suggestion sets
// the category AND that filter. That is the whole point: a search for a printer
// should arrive as "PC-Zubehör, Art: Drucker & Scanner", not as a word in a
// title.
// Containment needs a length floor, and finding that out was instructive: the
// clothing sizes S, M and L matched every term containing those letters, so
// "laserdrucker", "matratze" and "bohrmaschine" all came back as Damenbekleidung.
const MIN_MATCH = 4;

// German plurals umlaut and suffix: Schrank -> Schränke, Kleid -> Kleider. A
// buyer types the singular inside a compound ("kleiderschrank") and the site
// offers the plural ("Schränke & Schrankwände"), so both sides are folded to a
// stem before they are compared. Crude on purpose: the alternative is a
// stemmer, and this only has to be good enough to offer a suggestion a person
// then confirms.
function stem(word) {
  return word
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/(en|er|e|n|s)$/, '');
}

function matchIn(term, text) {
  if (!text) return 0;
  const t = text.toLowerCase().trim();
  if (!t) return 0;
  if (t === term) return 100;
  if (t.length >= MIN_MATCH && (t.includes(term) || term.includes(t))) return 80;
  const termStem = stem(term);
  for (const word of t.split(/[\s&/,_()-]+/).filter(w => w.length > MIN_MATCH)) {
    if (word.includes(term) || term.endsWith(word)) return 60;
    const wordStem = stem(word);
    if (wordStem.length >= MIN_MATCH && termStem.endsWith(wordStem)) return 55;
    // A German compound's head is its LAST word: a Kleiderschrank is a
    // Schrank, not a Kleid. A word found anywhere else in the term scores
    // below the threshold, so it can lose to a better match but never wins on
    // its own -- without that, "kleiderschrank" was filed under skirts.
    if (term.includes(word)) return 40;
  }
  return 0;
}

function bestMatch(term, category) {
  let best = { score: Math.max(matchIn(term, category.name), matchIn(term, category.slug)), filter: null };

  for (const f of category.filters || []) {
    if (f.location !== 'tail') continue;
    for (const option of f.options || []) {
      const score = Math.max(matchIn(term, option.value), matchIn(term, option.label));
      // A filter match beats a bare category match: it is more specific and it
      // arrives with the filter already set.
      if (score > 0 && score + 5 > best.score) {
        best = { score: score + 5, filter: `${f.key}:${option.value}`, filterLabel: option.label || option.value };
      }
    }
  }
  return best;
}

router.get('/api/taxonomy/suggest', (req, res) => {
  const term = (req.query.q || '').trim().toLowerCase();
  if (term.length < 3) return res.json({ suggestions: [] });

  const data = load();
  const ranked = [];
  for (const entry of data.tree) {
    const category = data.byId.get(entry.id);
    if (!category) continue;
    const best = bestMatch(term, category);
    // A weak match is no match: a wrong category filters a search down to
    // nothing and does not say why.
    if (best.score >= 60) {
      ranked.push({ ...entry, score: best.score, filter: best.filter || null, filter_label: best.filterLabel || null });
    }
  }

  ranked.sort((a, b) => b.score - a.score || b.filter_count - a.filter_count);
  res.json({ suggestions: ranked.slice(0, 3) });
});

module.exports = router;
