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

module.exports = router;
