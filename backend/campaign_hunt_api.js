/**
 * Campaign hunt attributes API: hunt_type, profile_key, intent_json.
 *
 * Implements P1 hunt model storage and validation:
 * - hunt_type: exact | shortlist | class | features | fit | taste | opportunity | null
 * - profile_key: string | null
 * - intent_json: JSON string or object { text, musts[], prefs[], filters{}, use[], models[], sizes{}, budget{min,max} }
 */

const express = require('express');

const VALID_HUNT_TYPES = new Set([
  'exact',
  'shortlist',
  'class',
  'features',
  'fit',
  'taste',
  'opportunity',
]);

function validateHuntPayload(body) {
  if (body.hunt_type !== undefined && body.hunt_type !== null) {
    if (!VALID_HUNT_TYPES.has(body.hunt_type)) {
      return `Invalid hunt_type: "${body.hunt_type}". Allowed: ${[...VALID_HUNT_TYPES].join(', ')}`;
    }
  }

  if (body.profile_key !== undefined && body.profile_key !== null) {
    if (typeof body.profile_key !== 'string') {
      return 'profile_key must be a string or null';
    }
  }

  if (body.intent_json !== undefined && body.intent_json !== null) {
    if (typeof body.intent_json === 'string') {
      try {
        JSON.parse(body.intent_json);
      } catch {
        return 'intent_json must be valid JSON';
      }
    } else if (typeof body.intent_json !== 'object') {
      return 'intent_json must be an object, JSON string, or null';
    }
  }

  return null;
}

module.exports = (query, get, run) => {
  const router = express.Router();

  // GET /api/campaigns/:id
  router.get('/api/campaigns/:id', async (req, res) => {
    try {
      const campaign = await get(
        `SELECT c.*,
                (SELECT id FROM route_searches r WHERE r.campaign_id = c.id ORDER BY r.id DESC LIMIT 1) as route_id,
                (SELECT id FROM search_families sf WHERE sf.campaign_id = c.id ORDER BY sf.id DESC LIMIT 1) as family_id
           FROM campaigns c
          WHERE c.id = ?`,
        [req.params.id]
      );
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      let parsedIntent = null;
      if (campaign.intent_json) {
        try {
          parsedIntent = JSON.parse(campaign.intent_json);
        } catch {
          parsedIntent = null;
        }
      }

      res.json({
        ...campaign,
        intent: parsedIntent,
      });
    } catch (error) {
      console.error('Error fetching campaign:', error);
      res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  });

  // PATCH /api/campaigns/:id and PUT /api/campaigns/:id
  const updateCampaign = async (req, res) => {
    const error = validateHuntPayload(req.body);
    if (error) return res.status(400).json({ error });

    try {
      const existing = await get('SELECT id, name, hunt_type, profile_key, intent_json FROM campaigns WHERE id = ?', [
        req.params.id,
      ]);
      if (!existing) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const updates = [];
      const values = [];

      if (req.body.name !== undefined) {
        updates.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.hunt_type !== undefined) {
        updates.push('hunt_type = ?');
        values.push(req.body.hunt_type);
      }
      if (req.body.profile_key !== undefined) {
        updates.push('profile_key = ?');
        values.push(req.body.profile_key);
      }
      if (req.body.intent_json !== undefined) {
        const storedIntent =
          req.body.intent_json === null
            ? null
            : typeof req.body.intent_json === 'object'
            ? JSON.stringify(req.body.intent_json)
            : req.body.intent_json;
        updates.push('intent_json = ?');
        values.push(storedIntent);
      }

      if (updates.length > 0) {
        values.push(req.params.id);
        await run(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, values);
      }

      const updated = await get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
      res.json({
        success: true,
        campaign: {
          ...updated,
          intent: updated.intent_json ? JSON.parse(updated.intent_json) : null,
        },
      });
    } catch (err) {
      if (err && String(err.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: `A campaign called "${req.body.name}" already exists.` });
      }
      console.error('Error updating campaign hunt model:', err);
      res.status(500).json({ error: 'Failed to update campaign' });
    }
  };

  router.patch('/api/campaigns/:id', updateCampaign);
  router.put('/api/campaigns/:id', updateCampaign);

  return router;
};

module.exports.validateHuntPayload = validateHuntPayload;
