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
const { findPython } = require('./python');
const { spawn } = require('child_process');

const router = express.Router();


/**
 * Judges every search of a campaign with the free stages, then starts the
 * comparison. The one path after anything that changes what a hunt sees or
 * wants: a finished crawl (server-side, app open or not) and saved
 * requirements (no crawl -- Kleinanzeigen is not asked again for that).
 */
async function judgeCampaignWith(query, judgeOne, campaignId) {
  const searches = await query('SELECT id FROM searches WHERE campaign_id = ? AND enabled = 1', [campaignId]);
  if (searches.length === 0) {
    return { status: 404, body: { error: 'No searches in this campaign' } };
  }
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
  // The comparison reads the verdicts, so it starts after them.
  require('./compare_api').startCompare(campaignId);
  // A campaign whose searches have no requirements yet is not a failure to
  // hide: it is the one thing the buyer has to do.
  if (problems.length === searches.length) {
    return { status: 400, body: { error: problems[0].error, problems } };
  }
  return { body: { success: true, counts: totals, problems } };
}

let judgeCampaign = async () => ({ status: 503, body: { error: 'not ready' } });

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

  // Express 4 does not catch a rejected async handler, and on this Node an
  // unhandled rejection ends the process: a busy database would take the API.
  router.post('/api/searches/:id/judge', async (req, res) => {
    try {
      const search = await get('SELECT id FROM searches WHERE id = ?', [req.params.id]);
      if (!search) return res.status(404).json({ error: 'Unknown search' });
      const result = await judgeOne(req.params.id);
      if (result.error) return res.status(400).json(result);
      res.json({ success: true, counts: result });
    } catch (error) {
      console.error('Judging a search failed:', error);
      res.status(500).json({ error: 'Judging failed' });
    }
  });

  // A campaign is what the results screen shows, and it can hold several
  // searches -- a family expands to one per model per place. Judging by
  // campaign is therefore the button the screen can actually offer.
  router.post('/api/campaigns/:id/judge', async (req, res) => {
    try {
      const result = await judgeCampaign(Number(req.params.id));
      if (result.status) return res.status(result.status).json(result.body);
      res.json(result.body);
    } catch (error) {
      console.error('Judging a campaign failed:', error);
      res.status(500).json({ error: 'Judging failed' });
    }
  });

  router.get('/api/searches/:id/fit', async (req, res) => {
    try {
      const rows = await query(
        `SELECT listing_id, verdict, reason, facts_json, stage, judged_at
           FROM (
             SELECT listing_id, verdict, reason, facts_json, stage, judged_at,
                    ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY judged_at DESC) AS rn
               FROM listing_fit
              WHERE (requirements_hash IS NOT NULL AND requirements_hash = (
                       SELECT ks.requirements_hash FROM searches s_rh
                       JOIN knowledge_sets ks ON ks.id = s_rh.knowledge_set_id
                       WHERE s_rh.id = ?
                     ))
                 OR (requirements_hash IS NULL AND search_id = ?)
           ) WHERE rn = 1`,
        [req.params.id, req.params.id]
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

  judgeCampaign = campaignId => judgeCampaignWith(query, judgeOne, campaignId);
  return router;
};

module.exports.judgeCampaign = campaignId => judgeCampaign(campaignId);
