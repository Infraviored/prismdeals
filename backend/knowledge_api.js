/**
 * Knowledge nodes & research bridge API (P7).
 *
 * Endpoints:
 * - GET  /api/campaigns/:id/brief   → research brief and decision
 * - POST /api/knowledge/classify    → parse pasted answer into proposed claims
 * - POST /api/claims/:id/approve    → approve a proposed claim
 * - POST /api/claims/:id/reject     → delete a rejected claim
 * - GET  /api/listings/:id/claims   → inherited claims for a listing
 * - GET  /api/campaigns/:id/claims  → all claims (approved and pending) for campaign
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();

function findPython() {
  const candidates = [
    path.join(__dirname, '..', '.venv', 'bin', 'python3'),
    path.join(__dirname, '..', '.venv', 'bin', 'python'),
    path.join(__dirname, '..', 'venv', 'bin', 'python3'),
    '/usr/bin/python3',
    'python3',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'python3';
}

function runPythonJson(scriptName, args, stdinInput = null) {
  return new Promise((resolve, reject) => {
    const python = findPython();
    const scriptPath = path.join(__dirname, '..', 'scraper', scriptName);
    const child = spawn(python, [scriptPath, ...args], {
      env: {
        ...process.env,
        PYTHONPATH: path.join(__dirname, '..', 'scraper'),
      },
    });

    let out = '';
    let err = '';

    if (stdinInput) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }

    child.stdout.on('data', d => {
      out += d.toString();
    });

    child.stderr.on('data', d => {
      err += d.toString();
    });

    child.on('error', spawnErr => {
      console.error(`Failed to spawn ${scriptName}:`, spawnErr.message);
      reject(spawnErr);
    });

    child.on('close', code => {
      if (code !== 0) {
        console.error(`Python script ${scriptName} exited with code ${code}: ${err}`);
        return reject(new Error(`Script exited with code ${code}: ${err.slice(0, 300)}`));
      }
      try {
        const parsed = JSON.parse(out.trim());
        resolve(parsed);
      } catch (parseErr) {
        console.error(`Failed to parse JSON output from ${scriptName}:`, out.slice(0, 300));
        reject(new Error(`Invalid JSON output from ${scriptName}`));
      }
    });
  });
}

function ancestors(nodeKey) {
  if (!nodeKey) return [];
  const parts = nodeKey.split('/');
  const res = [];
  for (let i = parts.length - 1; i > 0; i--) {
    res.push(parts.slice(0, i).join('/'));
  }
  return res;
}

function parseClaimRow(row) {
  let sources = [];
  try {
    sources = JSON.parse(row.sources || '[]');
  } catch (e) {
    sources = [];
  }
  return {
    id: row.id,
    node_key: row.node_key,
    kind: row.kind,
    axis: row.axis || '',
    statement: row.statement,
    check_path: row.check_path || 'text',
    weight: row.weight || 'minor',
    sources,
    created_at: row.created_at,
    expires_at: row.expires_at,
    approved: !!row.approved,
  };
}

module.exports = (query, get, run) => {
  /**
   * GET /api/campaigns/:id/brief
   * Returns research recommendation, brief text for copy-pasting, and current claims.
   */
  router.get('/api/campaigns/:id/brief', async (req, res) => {
    const campaignId = Number(req.params.id);
    if (!campaignId || campaignId < 1) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }

    try {
      const dbArgs = process.env.PRISMDEALS_DB ? ['--db', process.env.PRISMDEALS_DB] : [];
      // ?check=1 only asks whether research pays off (no model call): the
      // results screen asked on every open and paid for a brief each time.
      const noLlm = req.query.check ? ['--no-llm'] : [];
      const briefData = await runPythonJson('knowledge_cli.py', [...dbArgs, 'brief', String(campaignId), ...noLlm]);

      // Also attach any pending (unapproved) claims for this node
      let pendingClaims = [];
      if (briefData.node_key) {
        const rows = await query(
          `SELECT id, node_key, kind, axis, statement, check_path, weight,
                  sources, created_at, expires_at, approved
             FROM claims WHERE node_key = ? AND approved = 0
            ORDER BY created_at DESC`,
          [briefData.node_key]
        );
        pendingClaims = rows.map(parseClaimRow);
      }

      res.json({
        ...briefData,
        pending_claims: pendingClaims,
      });
    } catch (err) {
      console.error(`GET /api/campaigns/${campaignId}/brief failed:`, err);
      res.status(500).json({ error: 'Failed to generate research brief' });
    }
  });

  /**
   * POST /api/knowledge/classify
   * Parses pasted answer text into proposed claims and saves them as unapproved.
   */
  router.post('/api/knowledge/classify', async (req, res) => {
    const { node_key, answer_text, profile_key, auto_approve } = req.body || {};
    if (!node_key || !answer_text) {
      return res.status(400).json({ error: 'node_key and answer_text are required' });
    }

    try {
      const dbArgs = process.env.PRISMDEALS_DB ? ['--db', process.env.PRISMDEALS_DB] : [];
      const cmdArgs = [...dbArgs, 'classify', node_key];
      if (profile_key) cmdArgs.push('--profile', profile_key);
      if (auto_approve) cmdArgs.push('--auto-approve');

      const claims = await runPythonJson('knowledge_cli.py', cmdArgs, answer_text);
      res.json({ claims });
    } catch (err) {
      console.error('POST /api/knowledge/classify failed:', err);
      res.status(500).json({ error: 'Failed to classify research answer' });
    }
  });

  /**
   * POST /api/claims/:id/approve
   * Approves a single proposed claim.
   */
  router.post('/api/claims/:id/approve', async (req, res) => {
    const claimId = Number(req.params.id);
    if (!claimId || claimId < 1) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }
    try {
      await run('UPDATE claims SET approved = 1 WHERE id = ?', [claimId]);
      res.json({ success: true, id: claimId });
    } catch (err) {
      console.error(`POST /api/claims/${claimId}/approve failed:`, err);
      res.status(500).json({ error: 'Failed to approve claim' });
    }
  });

  /**
   * POST /api/claims/:id/reject
   * Deletes a rejected claim.
   */
  router.post('/api/claims/:id/reject', async (req, res) => {
    const claimId = Number(req.params.id);
    if (!claimId || claimId < 1) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }
    try {
      await run('DELETE FROM claims WHERE id = ?', [claimId]);
      res.json({ success: true, id: claimId });
    } catch (err) {
      console.error(`POST /api/claims/${claimId}/reject failed:`, err);
      res.status(500).json({ error: 'Failed to reject claim' });
    }
  });

  /**
   * GET /api/listings/:id/claims
   * Returns approved unexpired claims for the listing's node and its ancestors.
   */
  router.get('/api/listings/:id/claims', async (req, res) => {
    const listingId = String(req.params.id);
    try {
      // Check latest listing_ranks entry for node_key
      const rankRow = await get(
        `SELECT lr.node_key FROM listing_ranks lr
           JOIN judge_runs jr ON jr.id = lr.run_id
          WHERE lr.listing_id = ? AND lr.node_key IS NOT NULL AND lr.node_key != ''
          ORDER BY jr.created_at DESC LIMIT 1`,
        [listingId]
      );

      let nodeKey = rankRow ? rankRow.node_key : null;
      if (!nodeKey) {
        // Fall back to python identity lookup
        const dbArgs = process.env.PRISMDEALS_DB ? ['--db', process.env.PRISMDEALS_DB] : [];
        const result = await runPythonJson('knowledge_cli.py', [...dbArgs, 'claims-listing', listingId]);
        return res.json(result);
      }

      // Walk path from leaf to root
      const allKeys = [nodeKey, ...ancestors(nodeKey)];
      const claimsList = [];
      const nowIso = new Date().toISOString();

      for (const key of allKeys) {
        const rows = await query(
          `SELECT id, node_key, kind, axis, statement, check_path, weight,
                  sources, created_at, expires_at, approved
             FROM claims
            WHERE node_key = ? AND approved = 1
            ORDER BY kind, created_at DESC`,
          [key]
        );
        for (const r of rows) {
          if (!r.expires_at || r.expires_at > nowIso) {
            claimsList.push(parseClaimRow(r));
          }
        }
      }

      res.json({
        listing_id: listingId,
        node_key: nodeKey,
        claims: claimsList,
      });
    } catch (err) {
      console.error(`GET /api/listings/${listingId}/claims failed:`, err);
      res.status(500).json({ error: 'Failed to load listing claims' });
    }
  });

  /**
   * GET /api/campaigns/:id/claims
   * Returns all claims for the nodes relevant to the campaign.
   */
  router.get('/api/campaigns/:id/claims', async (req, res) => {
    const campaignId = Number(req.params.id);
    try {
      const nodeRows = await query(
        `SELECT DISTINCT lr.node_key
           FROM listing_ranks lr
           JOIN judge_runs jr ON jr.id = lr.run_id
          WHERE jr.campaign_id = ? AND lr.node_key IS NOT NULL AND lr.node_key != ''`,
        [campaignId]
      );
      const nodeKeys = nodeRows.map(r => r.node_key);

      if (!nodeKeys.length) {
        return res.json({ campaign_id: campaignId, claims: [] });
      }

      const allAncestors = new Set(nodeKeys);
      for (const nk of nodeKeys) {
        ancestors(nk).forEach(a => allAncestors.add(a));
      }

      const placeholders = Array.from(allAncestors).map(() => '?').join(',');
      const rows = await query(
        `SELECT id, node_key, kind, axis, statement, check_path, weight,
                sources, created_at, expires_at, approved
           FROM claims
          WHERE node_key IN (${placeholders})
          ORDER BY approved DESC, kind, created_at DESC`,
        Array.from(allAncestors)
      );

      res.json({
        campaign_id: campaignId,
        node_keys: nodeKeys,
        claims: rows.map(parseClaimRow),
      });
    } catch (err) {
      console.error(`GET /api/campaigns/${campaignId}/claims failed:`, err);
      res.status(500).json({ error: 'Failed to load campaign claims' });
    }
  });

  return router;
};
