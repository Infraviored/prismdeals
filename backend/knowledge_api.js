/**
 * Knowledge per node (plan §8).
 *
 *   GET  /api/hunts/:id/brief       the research brief for the hunt's targets
 *   POST /api/hunts/:id/knowledge   {text}: a pasted research answer, filed as proposed knowledge
 *   GET  /api/hunts/:id/knowledge   everything known about its targets, proposed or approved
 *   POST /api/knowledge/:id/approve | /reject
 *   GET  /api/listings/:id/knowledge?campaign_id=   the approved knowledge of the listing's product
 *
 * Python (scraper/graph/knowledge.py) writes; this side reads through the tree.
 */

const express = require('express');
const { graph } = require('./python');
const { loadTree, describe } = require('./db/graph');

/** Knowledge rows of these nodes, each with the name of the node it hangs at. */
async function knowledgeAt(query, tree, nodeIds, approvedOnly) {
  if (!nodeIds.length) return [];
  const rows = await query(
    `SELECT id, node_id, kind, statement, check_path, weight, sources_json, created_at, approved
       FROM node_knowledge
      WHERE node_id IN (${nodeIds.map(() => '?').join(',')})
        AND (expires_at IS NULL OR expires_at > ?)
        ${approvedOnly ? 'AND approved = 1' : ''}
      ORDER BY id`,
    [...nodeIds, new Date().toISOString()]
  );
  return rows.map(r => ({
    id: r.id,
    node_id: r.node_id,
    node: describe(tree, r.node_id),
    kind: r.kind,
    statement: r.statement,
    check_path: r.check_path,
    weight: r.weight,
    sources: JSON.parse(r.sources_json || '[]'),
    created_at: r.created_at,
    approved: !!r.approved,
  }));
}

/** The knowledge text for a comparison prompt: what holds for the hunt's targets. */
async function knowledgeForPrompt(query, tree, targetIds) {
  const ids = [...new Set(targetIds.flatMap(t => tree.ancestors(t).map(n => n.id)))];
  const rows = await knowledgeAt(query, tree, ids, true);
  return rows.map(k => `- ${k.node}: ${k.kind.replace('_', ' ')} [${k.weight}] ${k.statement} (prüfen: ${k.check_path})`).join('\n');
}

module.exports = (query) => {
  const router = express.Router();
  // Every :id is a number; anything else is no such thing, not a model outage.
  router.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ error: 'Nicht gefunden' })));

  async function targetsOf(campaignId) {
    return (await query('SELECT node_id FROM hunt_targets WHERE campaign_id = ?', [campaignId])).map(r => r.node_id);
  }

  router.get('/api/hunts/:id/brief', async (req, res) => {
    const result = await graph(['brief', String(Number(req.params.id))]);
    res.status(result.status).json(result.body);
  });

  router.post('/api/hunts/:id/knowledge', async (req, res) => {
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'Keine Antwort eingefügt.' });
    const result = await graph(['classify', String(Number(req.params.id))], text);
    res.status(result.status).json(result.body);
  });

  router.get('/api/hunts/:id/knowledge', async (req, res) => {
    try {
      const tree = await loadTree(query);
      const targets = (await targetsOf(Number(req.params.id))).filter(t => tree.byId.has(t));
      const ids = [...new Set(targets.flatMap(t => [
        ...tree.ancestors(t).map(n => n.id),
        ...[...tree.byId.values()].filter(n => n.parent_id === t).map(n => n.id),
      ]))];
      res.json({ knowledge: await knowledgeAt(query, tree, ids, false) });
    } catch (error) {
      console.error('Reading hunt knowledge failed:', error);
      res.status(500).json({ error: 'Das Wissen konnte nicht gelesen werden.' });
    }
  });

  for (const action of ['approve', 'reject']) {
    router.post(`/api/knowledge/:id/${action}`, async (req, res) => {
      const result = await graph([action, String(Number(req.params.id))]);
      res.status(result.status).json(result.body);
    });
  }

  router.get('/api/listings/:id/knowledge', async (req, res) => {
    try {
      const tree = await loadTree(query);
      const row = await query('SELECT node_id FROM listing_resolution WHERE listing_id = ?', [req.params.id]);
      const nodeId = row.length && tree.byId.has(row[0].node_id) ? row[0].node_id : null;
      if (!nodeId) return res.json({ node: null, knowledge: [] });
      const chain = tree.ancestors(nodeId).map(n => n.id);
      res.json({ node: describe(tree, nodeId), knowledge: await knowledgeAt(query, tree, chain, true) });
    } catch (error) {
      console.error('Reading listing knowledge failed:', error);
      res.status(500).json({ error: 'Das Wissen konnte nicht gelesen werden.' });
    }
  });

  return router;
};

module.exports.knowledgeForPrompt = knowledgeForPrompt;
