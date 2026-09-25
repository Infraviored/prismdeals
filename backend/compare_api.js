/**
 * Comparative judging API: trigger a comparison and attach rank data.
 *
 * POST /api/campaigns/:id/compare   → spawns compare_cli.py
 * GET  /api/campaigns/:id/ranks     → latest run's listing ranks
 *
 * The rank data is also attached to listings by attachRanks(), which is called
 * alongside attachScores in the listing endpoints.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();
// Campaigns with a comparison in flight, and the last failure per campaign.
const running = new Map();
const failures = new Map();

/**
 * Runs the comparison for one campaign in the background, once at a time.
 * Called by the button and after every finished crawl, so the ranks follow
 * the market without anyone asking.
 */
function startCompare(campaignId) {
  if (!campaignId || running.has(campaignId)) return false;
  const child = spawn(findPython(), [path.join(__dirname, '..', 'scraper', 'compare_cli.py'), String(campaignId)], {
    env: { ...process.env },
    cwd: path.join(__dirname, '..', 'scraper'),
  });
  running.set(campaignId, { started_at: new Date().toISOString() });
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-2000); });
  child.on('error', err => {
    running.delete(campaignId);
    failures.set(campaignId, String(err.message || err));
  });
  child.on('close', code => {
    running.delete(campaignId);
    if (code !== 0) {
      console.error('compare_cli.py failed:', stderr);
      failures.set(campaignId, stderr.slice(-500));
    } else {
      failures.delete(campaignId);
    }
  });
  return true;
}

function findPython() {
  const candidates = [
    path.join(__dirname, '..', '.venv', 'bin', 'python3'),
    path.join(__dirname, '..', 'venv', 'bin', 'python3'),
    '/usr/bin/python3',
    'python3',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'python3';
}

module.exports = (query, get) => {
  /**
   * POST /api/campaigns/:id/compare
   * Triggers a full comparative judging run for the campaign.
   */
  router.post('/api/campaigns/:id/compare', (req, res) => {
    const campaignId = Number(req.params.id);
    if (!campaignId || campaignId < 1) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    // Three model runs take minutes; holding the request open ran into the
    // proxy timeout, and a second tap started a second paid run. Answer at
    // once, run in the background, and let the ranks endpoint say when done.
    if (running.has(campaignId)) return res.status(202).json({ running: true });

    startCompare(campaignId);
    res.status(202).json({ running: true });
  });

  /**
   * GET /api/campaigns/:id/ranks
   * Returns the latest judge run's listing ranks.
   */
  router.get('/api/campaigns/:id/ranks', async (req, res) => {
    const campaignId = Number(req.params.id);
    try {
      const run = await get(
        `SELECT id, created_at, kendall_tau, candidate_count, duration_s, cost_eur
           FROM judge_runs
          WHERE campaign_id = ? AND status = 'complete'
          ORDER BY created_at DESC LIMIT 1`,
        [campaignId],
      );
      const status = { running: running.has(campaignId), error: failures.get(campaignId) || null };
      if (!run) return res.json({ ...status, run: null, ranks: [] });

      const ranks = await query(
        `SELECT listing_id, rank, rank_of, reason, musts_json,
                facts_json, questions_json, same_as, uncertain, spread, node_key
           FROM listing_ranks WHERE run_id = ?`,
        [run.id],
      );

      const parsed = ranks.map(r => ({
        listing_id: r.listing_id,
        rank: r.rank,
        rank_of: r.rank_of,
        reason: r.reason,
        musts: safeJson(r.musts_json),
        facts: safeJson(r.facts_json),
        seller_questions: safeJson(r.questions_json),
        same_as: safeJson(r.same_as),
        uncertain: !!r.uncertain,
        spread: r.spread,
        node_key: r.node_key || null,
      }));

      res.json({
        ...status,
        run: {
          id: run.id,
          created_at: run.created_at,
          kendall_tau: run.kendall_tau,
          candidate_count: run.candidate_count,
          duration_s: run.duration_s,
          cost_eur: run.cost_eur,
        },
        ranks: parsed,
      });
    } catch (err) {
      console.error('GET /api/campaigns/:id/ranks failed:', err);
      res.status(500).json({ error: 'Could not load ranks' });
    }
  });

  return router;
};

/**
 * Attaches rank, rank_of, rank_reason, seller_questions, uncertain to listings.
 *
 * Called alongside attachScores in listing endpoints. Uses the latest completed
 * judge run for the given campaign.
 */
async function attachRanks(query, get, listings, campaignId) {
  if (!listings.length || !campaignId) return listings;

  const run = await get(
    `SELECT id, requirements_json FROM judge_runs
      WHERE campaign_id = ? AND status = 'complete'
      ORDER BY created_at DESC LIMIT 1`,
    [campaignId],
  );
  if (!run) return listings;

  const ids = listings.map(l => String(l.id));
  const placeholders = ids.map(() => '?').join(',');

  const ranks = await query(
    `SELECT listing_id, rank, rank_of, reason, musts_json, questions_json, uncertain, same_as, node_key
       FROM listing_ranks
      WHERE run_id = ? AND listing_id IN (${placeholders})`,
    [run.id, ...ids],
  );

  const rankMap = new Map();
  for (const r of ranks) {
    rankMap.set(String(r.listing_id), r);
  }
  const judgedWants = safeJson(run.requirements_json) || {};
  // "same as" names other listings of the run; the buyer knows them by rank.
  const rankById = new Map(
    (await query('SELECT listing_id, rank FROM listing_ranks WHERE run_id = ?', [run.id]))
      .map(r => [String(r.listing_id), r.rank])
  );

  for (const listing of listings) {
    const r = rankMap.get(String(listing.id));
    if (r) {
      listing.rank = r.rank;
      listing.rank_of = r.rank_of;
      listing.rank_reason = r.reason;
      listing.seller_questions = safeJson(r.questions_json);
      listing.uncertain = !!r.uncertain;
      listing.same_as = (safeJson(r.same_as) || [])
        .map(id => rankById.get(String(id)))
        .filter(rank => typeof rank === 'number' && rank !== r.rank);
      listing.rank_musts = safeJson(r.musts_json);
      listing.rank_wants = judgedWants;
      listing.node_key = r.node_key || null;
    }
  }

  return listings;
}

function safeJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

module.exports.attachRanks = attachRanks;
module.exports.startCompare = startCompare;
