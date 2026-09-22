/**
 * What a buyer wants, beyond what the site can filter on.
 *
 * Kleinanzeigen can narrow a search to "PC-Zubehör, Speicher, up to 150 EUR".
 * It cannot say "two sticks of sixteen gigabytes, DDR4, 3200 MHz, CL16" -- and
 * that is precisely the difference between 84 offers and the nine worth
 * opening. Those requirements are the buyer's, they belong to the search, and
 * the scoring pipeline already knows how to read them: they are the intent it
 * looks for in the knowledge set.
 *
 * Stored rather than derived, because unlike the site's filters they cannot be
 * recovered from the URL.
 */

const express = require('express');

const router = express.Router();

// The vocabulary scoring.py reads. Writing anything else is silently ignored,
// which is how a requirement can look set and do nothing.
const OPERATORS = new Set(['min', 'max', 'match', 'preferred', 'excluded', 'present']);

function validate(fields) {
  if (!Array.isArray(fields)) return 'requirements must be a list';
  for (const field of fields) {
    if (!field || typeof field.id !== 'string' || !field.id) return 'every requirement needs a field id';
    const wants = field.buyer_wants;
    if (!wants || typeof wants !== 'object') return `${field.id}: missing buyer_wants`;
    const keys = Object.keys(wants);
    if (keys.length === 0) return `${field.id}: buyer_wants says nothing`;
    for (const key of keys) {
      if (!OPERATORS.has(key)) {
        return `${field.id}: "${key}" is not something scoring understands (${[...OPERATORS].join(', ')})`;
      }
    }
  }
  return null;
}

module.exports = (query, get, run) => {
  router.get('/api/searches/:id/requirements', async (req, res) => {
    try {
      const row = await get(
        `SELECT k.item_json FROM searches s
           LEFT JOIN knowledge_sets k ON k.id = s.knowledge_set_id
          WHERE s.id = ?`,
        [req.params.id]
      );
      if (!row) return res.status(404).json({ error: 'Unknown search' });
      let parsed = {};
      try {
        parsed = JSON.parse(row.item_json || '{}');
      } catch {
        parsed = {};
      }
      res.json({ requirements: parsed.fields || [] });
    } catch (error) {
      console.error('Error reading requirements:', error);
      res.status(500).json({ error: 'Failed to read requirements' });
    }
  });

  router.put('/api/searches/:id/requirements', async (req, res) => {
    const fields = req.body && req.body.requirements;
    const problem = validate(fields);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const search = await get('SELECT id, name, knowledge_set_id FROM searches WHERE id = ?', [
        req.params.id,
      ]);
      if (!search) return res.status(404).json({ error: 'Unknown search' });

      const payload = JSON.stringify({ fields, dimensions_enabled: false });

      let setId = search.knowledge_set_id;
      if (!setId) {
        // One knowledge set per search, named after it. The wizard used to
        // create these and leave them empty; this is the same row with
        // something in it.
        const created = await run(
          `INSERT INTO knowledge_sets (name, item_json) VALUES (?, ?)`,
          [`${search.name} (${search.id})`, payload]
        );
        setId = created.id;
        await run('UPDATE searches SET knowledge_set_id = ? WHERE id = ?', [setId, search.id]);
      } else {
        await run('UPDATE knowledge_sets SET item_json = ? WHERE id = ?', [payload, setId]);
      }

      res.json({ success: true, knowledge_set_id: setId, requirements: fields });
    } catch (error) {
      console.error('Error saving requirements:', error);
      res.status(500).json({ error: 'Failed to save requirements' });
    }
  });

  return router;
};
