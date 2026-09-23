/**
 * Numbers for the surface: pots, rejection reasons, market histogram, and requirement survivors.
 *
 * The results view cannot compose an honest picture without server-side aggregates:
 *   1. Pots: Alle, Passend, Unklar, Abgelehnt under the active filters.
 *   2. Rejections: aggregated reasons why listings were rejected.
 *   3. Market: price histogram classes, median, and bargain threshold (Schnäppchenschwelle).
 *   4. Survivors: how many listings fulfill each requirement in the knowledge set.
 *
 * Scopes over listing_search_hits and honors search_family_searches.active = 1.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { referencePrices, dealListingIds } = require('./db/reference_price');
const { resolveCampaignScope } = require('./overview/scope');
const { computeMarketStats } = require('./overview/market');
const { normalizeReason, computeRequirementStats, aggregateRejections } = require('./overview/requirements');

const router = express.Router();

module.exports = (query, get) => {
  async function getOverview(scope, reqQuery) {
    const { campaign, kind, routeId, familyId, searchIds, primarySearchId } = scope;
    const { q, dealsOnly, min_price, minPrice, max_price, maxPrice, term, maxDetour } = reqQuery;

    const whereConditions = [];
    const whereParams = [];

    // Scope listings based on campaign kind
    let fromSql = '';

    if (kind === 'search') {
      fromSql = `
        FROM listing_search_hits lsh
        JOIN listings l ON l.id = lsh.listing_id
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND fit.search_id = lsh.search_id
      `;
      whereConditions.push('lsh.search_id = ?');
      whereParams.push(primarySearchId);
    } else if (kind === 'route') {
      fromSql = `
        FROM listings l
        JOIN listing_search_hits lsh ON lsh.listing_id = l.id
        JOIN route_search_circles c ON c.search_id = lsh.search_id
        LEFT JOIN listing_route_geo g ON g.listing_id = l.id AND g.route_search_id = ?
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND fit.search_id = c.search_id
      `;
      whereConditions.push('c.route_search_id = ?');
      whereParams.push(routeId, routeId);

      if (maxDetour !== undefined && maxDetour !== '') {
        const detourNum = parseFloat(maxDetour);
        if (!isNaN(detourNum)) {
          whereConditions.push('g.detour_min IS NOT NULL AND g.detour_min <= ?');
          whereParams.push(detourNum);
        }
      }
    } else if (kind === 'family') {
      fromSql = `
        FROM search_family_searches sfs
        LEFT JOIN search_family_terms t ON t.id = sfs.term_id
        JOIN listing_search_hits lsh ON lsh.search_id = sfs.search_id
        JOIN listings l ON l.id = lsh.listing_id
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND fit.search_id = sfs.search_id
      `;
      whereConditions.push('sfs.family_id = ? AND sfs.active = 1');
      whereParams.push(familyId);

      if (term !== undefined && term !== '') {
        const termNum = parseInt(term, 10);
        if (!isNaN(termNum) && String(termNum) === String(term).trim()) {
          whereConditions.push('(sfs.term_id = ? OR t.term = ? OR t.label = ?)');
          whereParams.push(termNum, term, term);
        } else {
          whereConditions.push('(t.term = ? OR t.label = ?)');
          whereParams.push(term, term);
        }
      }
    } else {
      // Plain campaign: listings found by searches of THIS campaign, fit evaluated for searches of THIS campaign
      fromSql = `
        FROM listing_search_hits lsh
        JOIN searches s ON s.id = lsh.search_id
        JOIN listings l ON l.id = lsh.listing_id
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND fit.search_id = s.id
      `;
      whereConditions.push('s.campaign_id = ?');
      whereParams.push(campaign.id);
    }

    // Active query text filter (q)
    if (q && q.trim() !== '') {
      const qVal = `%${q.trim()}%`;
      whereConditions.push('(l.title LIKE ? OR l.location LIKE ?)');
      whereParams.push(qVal, qVal);
    }

    // Active price filter
    const effectiveMinPrice = min_price ?? minPrice;
    if (effectiveMinPrice !== undefined && effectiveMinPrice !== '' && !isNaN(Number(effectiveMinPrice))) {
      whereConditions.push('l.price_eur >= ?');
      whereParams.push(Number(effectiveMinPrice));
    }
    const effectiveMaxPrice = max_price ?? maxPrice;
    if (effectiveMaxPrice !== undefined && effectiveMaxPrice !== '' && !isNaN(Number(effectiveMaxPrice))) {
      whereConditions.push('l.price_eur <= ?');
      whereParams.push(Number(effectiveMaxPrice));
    }

    // Deals only filter
    const isDealsOnly = dealsOnly === '1' || dealsOnly === 'true';
    if (isDealsOnly) {
      const dealIds = await dealListingIds(query, searchIds);
      if (dealIds.length > 0) {
        whereConditions.push(`l.id IN (${dealIds.map(() => '?').join(',')})`);
        whereParams.push(...dealIds);
      } else {
        whereConditions.push('1 = 0');
      }
    }

    const whereSql = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Query listings with their verdicts and facts:
    // Best verdict wins (fit > unclear > no > unjudged) and reason / facts come from that exact row.
    const sql = `
      WITH ranked AS (
        SELECT l.id, l.price_eur,
               lsh.first_seen_at,
               fit.verdict,
               fit.reason,
               fit.facts_json,
               ROW_NUMBER() OVER (
                 PARTITION BY l.id
                 ORDER BY
                   CASE fit.verdict
                     WHEN 'fit' THEN 1
                     WHEN 'unclear' THEN 2
                     WHEN 'no' THEN 3
                     ELSE 4
                   END ASC,
                   lsh.first_seen_at DESC
               ) AS rn,
               MAX(lsh.first_seen_at) OVER (PARTITION BY l.id) AS max_seen_at
        ${fromSql}
        ${whereSql}
      )
      SELECT id, price_eur, max_seen_at AS first_seen_at, verdict, reason, facts_json
        FROM ranked
       WHERE rn = 1
    `;

    const rows = await query(sql, whereParams);

    // 1. Pots
    let fitCount = 0;
    let unclearCount = 0;
    let noCount = 0;
    let unjudgedCount = 0;
    let latestSeen = null;

    const rejectionMap = new Map();
    const exactRejectionMap = new Map();
    const prices = [];
    const factsList = [];

    for (const r of rows) {
      const seen = r.first_seen_at;
      if (seen && (!latestSeen || new Date(seen) > new Date(latestSeen))) latestSeen = seen;

      const v = r.verdict;
      if (v === 'fit') {
        fitCount++;
      } else if (v === 'no') {
        noCount++;
        const rawReason = r.reason || 'Ohne Begründung';
        exactRejectionMap.set(rawReason, (exactRejectionMap.get(rawReason) || 0) + 1);

        const norm = normalizeReason(rawReason);
        if (!rejectionMap.has(norm)) {
          rejectionMap.set(norm, { count: 0, examples: new Map() });
        }
        const entry = rejectionMap.get(norm);
        entry.count++;
        entry.examples.set(rawReason, (entry.examples.get(rawReason) || 0) + 1);
      } else if (v === 'unclear') {
        unclearCount++;
      } else {
        unjudgedCount++;
        unclearCount++;
      }

      if (typeof r.price_eur === 'number' && r.price_eur > 0) {
        prices.push(r.price_eur);
      }

      if (r.facts_json) {
        try {
          factsList.push(JSON.parse(r.facts_json));
        } catch {}
      }
    }

    const total = rows.length;
    const pots = {
      all: total,
      fit: fitCount,
      unclear: unclearCount,
      no: noCount,
      unjudged: unjudgedCount,
      alle: total,
      passend: fitCount,
      unklar: unclearCount,
      abgelehnt: noCount,
    };

    // 2. Rejection reasons, aggregated
    const { rejections, exactRejections } = aggregateRejections(rejectionMap, exactRejectionMap);

    // 3. Price histogram & market statistics
    const references = await referencePrices(query, searchIds);
    const market = computeMarketStats(prices, references, searchIds, primarySearchId);

    // 4. Requirements & Survivors
    let requirementFields = [];
    if (searchIds.length > 0) {
      const placeholders = searchIds.map(() => '?').join(',');
      const setRows = await query(
        `SELECT k.item_json FROM searches s
           JOIN knowledge_sets k ON k.id = s.knowledge_set_id
          WHERE s.id IN (${placeholders}) AND k.item_json IS NOT NULL LIMIT 1`,
        searchIds
      );
      if (setRows.length > 0) {
        try {
          requirementFields = JSON.parse(setRows[0].item_json || '{}').fields || [];
        } catch {}
      }
    }

    const requirementStats = computeRequirementStats(factsList, requirementFields);

    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    let scheduleInterval = 0;
    try {
      if (fs.existsSync(configPath)) {
        scheduleInterval = JSON.parse(fs.readFileSync(configPath, 'utf8')).interval || 0;
      }
    } catch {}

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      scope_kind: kind,
      search_id: primarySearchId,
      pots,
      rejections,
      exact_rejections: exactRejections,
      market,
      price_distribution: market,
      requirements: requirementStats,
      last_crawled_at: latestSeen,
      schedule_interval: scheduleInterval,
    };
  }

  router.get('/api/campaigns/:id/overview', async (req, res) => {
    try {
      const scope = await resolveCampaignScope(req.params.id, req.query.search_id, { query, get });
      if (!scope) return res.status(404).json({ error: 'Unknown campaign' });

      const overview = await getOverview(scope, req.query);
      res.json(overview);
    } catch (error) {
      console.error('Error computing campaign overview:', error);
      res.status(500).json({ error: 'Failed to compute campaign overview' });
    }
  });

  router.get('/api/searches/:id/overview', async (req, res) => {
    try {
      const search = await get('SELECT id, campaign_id FROM searches WHERE id = ?', [req.params.id]);
      if (!search) return res.status(404).json({ error: 'Unknown search' });

      let scope;
      if (search.campaign_id) {
        scope = await resolveCampaignScope(search.campaign_id, req.params.id, { query, get });
      } else {
        scope = {
          campaign: { id: null, name: null },
          kind: 'search',
          searchIds: [Number(search.id)],
          primarySearchId: Number(search.id),
        };
      }

      const overview = await getOverview(scope, req.query);
      res.json(overview);
    } catch (error) {
      console.error('Error computing search overview:', error);
      res.status(500).json({ error: 'Failed to compute search overview' });
    }
  });

  return router;
};
