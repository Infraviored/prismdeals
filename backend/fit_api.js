/**
 * Asking for a verdict, and reading it back.
 *
 * The judgement existed but went nowhere: it ran inside the scoring pipeline,
 * decided most of a search for nothing, and threw the answer away. So a list of
 * fifty offers looked exactly like the same list on Kleinanzeigen, with a 4x8
 * kit sitting between the matches.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();

function findPython() {
  const candidates = [
    path.join(__dirname, '..', '.venv', 'bin', 'python3'),
    path.join(__dirname, '..', 'venv', 'bin', 'python3'),
    path.join(__dirname, '..', '..', '..', 'venv', 'bin', 'python3'),
    '/home/flo/docker-projects/prismdeals/venv/bin/python3',
    '/usr/bin/python3',
    'python3'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'python3';
}

module.exports = (query, get) => {
  // What the free stages make of every listing in a search. No model is called
  // here: on the Corsair search this settles 43 of 50 from the listings' own
  // words, and the model is left for the handful that stay unclear.
  function judgeOne(searchId) {
    return new Promise(resolve => {
      const python = findPython();
      const script = path.join(__dirname, '..', 'scraper', 'judge_cli.py');
      const child = spawn(python, [script, String(searchId)]);

      child.on('error', err => {
        console.error('Failed to spawn python for judge:', err.message);
        resolve({ error: 'failed' });
      });

      let out = '';
      let err = '';
      child.stdout.on('data', d => (out += d));
      child.stderr.on('data', d => (err += d));
      child.on('close', code => {
        if (code !== 0) {
          console.error('Judging search %s failed: %s', searchId, err);
          return resolve({ error: 'failed' });
        }
        try {
          resolve(JSON.parse(out.trim()));
        } catch {
          console.error('Unreadable judge output for %s: %s', searchId, out.slice(0, 200));
          resolve({ error: 'unreadable' });
        }
      });
    });
  }

  router.post('/api/searches/:id/judge', async (req, res) => {
    const search = await get('SELECT id FROM searches WHERE id = ?', [req.params.id]);
    if (!search) return res.status(404).json({ error: 'Unknown search' });
    const result = await judgeOne(req.params.id);
    if (result.error) return res.status(400).json(result);
    res.json({ success: true, counts: result });
  });

  // A campaign is what the results screen shows, and it can hold several
  // searches -- a family expands to one per model per place. Judging by
  // campaign is therefore the button the screen can actually offer.
  router.post('/api/campaigns/:id/judge', async (req, res) => {
    const searches = await query('SELECT id FROM searches WHERE campaign_id = ?', [req.params.id]);
    if (searches.length === 0) return res.status(404).json({ error: 'No searches in this campaign' });

    const totals = { fit: 0, unclear: 0, no: 0 };
    const problems = [];
    for (const search of searches) {
      const result = await judgeOne(search.id);
      if (result.error) {
        problems.push({ search_id: search.id, error: result.error });
        continue;
      }
      for (const key of Object.keys(totals)) totals[key] += result[key] || 0;
    }

    // A campaign whose searches have no requirements yet is not a failure to
    // hide: it is the one thing the buyer has to do.
    if (problems.length === searches.length) {
      return res.status(400).json({ error: problems[0].error, problems });
    }
    res.json({ success: true, counts: totals, problems });
  });

  router.get('/api/searches/:id/fit', async (req, res) => {
    try {
      const rows = await query(
        `SELECT listing_id, verdict, reason, facts_json, stage, judged_at
           FROM listing_fit WHERE search_id = ?`,
        [req.params.id]
      );
      res.json({
        fit: rows.map(r => ({
          listing_id: String(r.listing_id),
          verdict: r.verdict,
          reason: r.reason,
          stage: r.stage,
          judged_at: r.judged_at,
          facts: JSON.parse(r.facts_json || '{}'),
        })),
      });
    } catch (error) {
      // The table only exists once something has been judged.
      if (String(error.message || '').includes('no such table')) return res.json({ fit: [] });
      console.error('Error reading verdicts:', error);
      res.status(500).json({ error: 'Failed to read verdicts' });
    }
  });

  return router;
};
