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
const path = require('path');
const { findPython } = require('./python');
const { spawn } = require('child_process');
const { requirementsHash } = require('./db/requirements_hash');

const router = express.Router();


/**
 * The questions this campaign's category can answer.
 *
 * They live in the playbook, which is Python, so this is the same shape of
 * helper as the judge: one question, one JSON answer, no scraper.
 */
function askableFields(campaignId, categoryOrUrl) {
  return new Promise(resolve => {
    const python = findPython();
    const script = path.join(__dirname, '..', 'scraper', 'requirements_cli.py');
    const args = [script, String(campaignId)];
    if (categoryOrUrl) args.push(String(categoryOrUrl));
    const child = spawn(python, args, {
      env: { ...process.env, PRISMDEALS_DB: process.env.PRISMDEALS_DB || '' }
    });

    child.on('error', err => {
      console.error('Failed to spawn python for requirements:', err.message);
      resolve({ playbook: null, fields: [] });
    });

    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('close', code => {
      if (code !== 0) {
        console.error('Reading requirement fields for %s failed: %s', campaignId, err);
        return resolve({ playbook: null, fields: [] });
      }
      try {
        resolve(JSON.parse(out.trim()));
      } catch {
        console.error('Unreadable field list for %s: %s', campaignId, out.slice(0, 200));
        resolve({ playbook: null, fields: [] });
      }
    });
  });
}

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
      const reqHash = requirementsHash(fields);

      let setId = search.knowledge_set_id;
      if (!setId) {
        // One knowledge set per search, named after it. The wizard used to
        // create these and leave them empty; this is the same row with
        // something in it.
        const created = await run(
          `INSERT INTO knowledge_sets (name, item_json, requirements_hash) VALUES (?, ?, ?)`,
          [`${search.name} (${search.id})`, payload, reqHash]
        );
        setId = created.id;
        await run('UPDATE searches SET knowledge_set_id = ? WHERE id = ?', [setId, search.id]);
      } else {
        await run('UPDATE knowledge_sets SET item_json = ?, requirements_hash = ? WHERE id = ?', [payload, reqHash, setId]);
      }

      res.json({ success: true, knowledge_set_id: setId, requirements: fields });
    } catch (error) {
      console.error('Error saving requirements:', error);
      res.status(500).json({ error: 'Failed to save requirements' });
    }
  });

  // By campaign, because that is what a buyer has in front of them. A family
  // expands to one search per model per place and they all want the same
  // thing, so the requirements are written to every search the campaign runs
  // -- setting them thirteen times by hand is not a feature.
  router.get('/api/campaigns/:id/requirements', async (req, res) => {
    try {
      const [campaign] = await query('SELECT id, name FROM campaigns WHERE id = ?', [
        req.params.id,
      ]);
      if (!campaign) return res.status(404).json({ error: 'Unknown campaign' });

      const searches = await query(
        'SELECT id, knowledge_set_id FROM searches WHERE campaign_id = ?',
        [req.params.id]
      );
      const families = await query(
        'SELECT id, knowledge_set_id, base_url FROM search_families WHERE campaign_id = ?',
        [req.params.id]
      );
      const routes = await query(
        'SELECT id, knowledge_set_id, base_url FROM route_searches WHERE campaign_id = ?',
        [req.params.id]
      );

      const withSet =
        searches.find(s => s.knowledge_set_id) ||
        families.find(f => f.knowledge_set_id) ||
        routes.find(r => r.knowledge_set_id);

      let stored = [];
      if (withSet) {
        const row = await get('SELECT item_json FROM knowledge_sets WHERE id = ?', [
          withSet.knowledge_set_id,
        ]);
        try {
          stored = JSON.parse((row && row.item_json) || '{}').fields || [];
        } catch {
          stored = [];
        }
      }

      const { playbook, fields } = await askableFields(
        req.params.id,
        req.query.category || req.query.url
      );
      // Only the searches that still run: retired ones ("alle 7 Suchen" for a
      // hunt with two terms) made the sheet's sentence wrong.
      const running = await query('SELECT COUNT(*) AS n FROM searches WHERE campaign_id = ? AND enabled = 1', [
        req.params.id,
      ]);
      res.json({ playbook, fields, requirements: stored, searches: running[0]?.n ?? searches.length });
    } catch (error) {
      console.error('Error reading campaign requirements:', error);
      res.status(500).json({ error: 'Failed to read requirements' });
    }
  });

  router.put('/api/campaigns/:id/requirements', async (req, res) => {
    const fields = req.body && req.body.requirements;
    const problem = validate(fields);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const [campaign] = await query('SELECT id, name FROM campaigns WHERE id = ?', [
        req.params.id,
      ]);
      if (!campaign) return res.status(404).json({ error: 'Unknown campaign' });

      const searches = await query(
        'SELECT id, name, knowledge_set_id FROM searches WHERE campaign_id = ?',
        [req.params.id]
      );
      const families = await query(
        'SELECT id, name, knowledge_set_id FROM search_families WHERE campaign_id = ?',
        [req.params.id]
      );
      const routes = await query(
        'SELECT id, name, knowledge_set_id FROM route_searches WHERE campaign_id = ?',
        [req.params.id]
      );

      const payload = JSON.stringify({ fields, dimensions_enabled: false });
      const reqHash = requirementsHash(fields);

      let existingSetId =
        (searches.find(s => s.knowledge_set_id) ||
          families.find(f => f.knowledge_set_id) ||
          routes.find(r => r.knowledge_set_id))?.knowledge_set_id;

      if (!existingSetId) {
        const created = await run('INSERT INTO knowledge_sets (name, item_json, requirements_hash) VALUES (?, ?, ?)', [
          `${campaign.name} (${campaign.id})`,
          payload,
          reqHash,
        ]);
        existingSetId = created.id;
      } else {
        await run('UPDATE knowledge_sets SET item_json = ?, requirements_hash = ? WHERE id = ?', [
          payload,
          reqHash,
          existingSetId,
        ]);
      }

      if (searches.length > 0) {
        await run('UPDATE searches SET knowledge_set_id = ? WHERE campaign_id = ?', [
          existingSetId,
          campaign.id,
        ]);
      }
      if (families.length > 0) {
        await run('UPDATE search_families SET knowledge_set_id = ? WHERE campaign_id = ?', [
          existingSetId,
          campaign.id,
        ]);
      }
      if (routes.length > 0) {
        await run('UPDATE route_searches SET knowledge_set_id = ? WHERE campaign_id = ?', [
          existingSetId,
          campaign.id,
        ]);
      }

      res.json({
        success: true,
        searches: searches.length,
        requirements: fields,
        knowledge_set_id: existingSetId,
      });
    } catch (error) {
      console.error('Error saving campaign requirements:', error);
      res.status(500).json({ error: 'Failed to save requirements' });
    }
  });

  return router;
};
