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
const { referencePrices, dealListingIds, DEAL_RATIO, MIN_ABSOLUTE_SAVING_EUR, MIN_GROUP_SIZE } = require('./db/reference_price');

const router = express.Router();

// Playbook field labels and units for computing human-readable requirement summaries.
const FIELD_INFO = {
  generation: { label: 'Generation', unit: '' },
  formFactor: { label: 'Bauform', unit: '' },
  stickCount: { label: 'Anzahl Module', unit: 'Module' },
  gbPerStick: { label: 'GB je Modul', unit: 'GB' },
  totalGb: { label: 'GB gesamt', unit: 'GB' },
  speedMhz: { label: 'Taktung', unit: 'MHz' },
  casLatency: { label: 'CAS-Latenz', unit: '' },
  isKit: { label: 'Matched Kit', unit: '' },
  hasFunctionalDefect: { label: 'Defekt', unit: '' },
  sealed: { label: 'Ungeöffnet', unit: '' },
  conditionGrade: { label: 'Zustand', unit: '' },
  productLine: { label: 'Produktlinie', unit: '' },
};

function formatRequirementText(field, allFields = []) {
  const fid = field.id;
  const wants = field.buyer_wants || {};
  const info = FIELD_INFO[fid] || { label: fid, unit: '' };

  if (fid === 'stickCount') {
    const sticks = wants.match ?? (wants.min !== undefined && wants.min === wants.max ? wants.min : null);
    const gbField = allFields.find(f => f.id === 'gbPerStick');
    const gb = gbField?.buyer_wants?.match ?? (gbField?.buyer_wants?.min !== undefined && gbField?.buyer_wants?.min === gbField?.buyer_wants?.max ? gbField?.buyer_wants?.min : null);
    if (sticks === 2 && gb === 16) return 'Zwei Riegel à 16 GB';
    if (sticks === 2 && gb) return `Zwei Riegel à ${gb} GB`;
    if ('match' in wants && wants.match === 2) return 'Zwei Riegel';
    if ('match' in wants && wants.match === 1) return 'Ein Riegel';
    if ('match' in wants && wants.match === 4) return 'Vier Riegel';
    if (wants.min !== undefined && wants.min === wants.max) return `${wants.min} Module`;
    if (wants.min !== undefined) return `mind. ${wants.min} Module`;
    if (wants.max !== undefined) return `höchstens ${wants.max} Module`;
  }
  if (fid === 'gbPerStick') {
    const stickField = allFields.find(f => f.id === 'stickCount');
    const sticks = stickField?.buyer_wants?.match ?? (stickField?.buyer_wants?.min !== undefined && stickField?.buyer_wants?.min === stickField?.buyer_wants?.max ? stickField?.buyer_wants?.min : null);
    const gb = wants.match ?? (wants.min !== undefined && wants.min === wants.max ? wants.min : null);
    if (sticks === 2 && gb === 16) return 'Zwei Riegel à 16 GB';
    if (gb) return `${gb} GB je Modul`;
    if (wants.min !== undefined && wants.min === wants.max) return `${wants.min} GB je Modul`;
  }
  if (fid === 'generation') {
    if (wants.match) return String(wants.match).toUpperCase();
    if (Array.isArray(wants.preferred)) return wants.preferred.map(g => g.toUpperCase()).join(' / ');
  }
  if (fid === 'formFactor') {
    if (wants.match) return String(wants.match).toUpperCase();
    if (Array.isArray(wants.preferred)) return wants.preferred.map(f => f.toUpperCase()).join(' / ');
  }
  if (fid === 'speedMhz') {
    if ('match' in wants) return `mindestens ${wants.match} MHz`;
    if (wants.min !== undefined) return `ab ${wants.min} MHz`;
  }
  if (fid === 'casLatency') {
    const maxVal = wants.max ?? wants.match;
    if (maxVal !== undefined) return `CL${maxVal} oder schneller`;
  }
  if (fid === 'hasFunctionalDefect') {
    if (wants.match === false) return 'kein Defekt';
    if (wants.match === true) return 'Defekt';
  }
  if (fid === 'productLine') {
    if (wants.present) return 'Produktlinie angegeben';
  }

  // Generic fallback
  if ('match' in wants) {
    if (typeof wants.match === 'boolean') return `${info.label}: ${wants.match ? 'ja' : 'nein'}`;
    return `${info.label}: ${wants.match}`;
  }
  if (wants.min !== undefined && wants.max !== undefined) {
    return wants.min === wants.max
      ? `${info.label} ${wants.min}${info.unit ? ' ' + info.unit : ''}`
      : `${info.label} ${wants.min}–${wants.max}${info.unit ? ' ' + info.unit : ''}`;
  }
  if (wants.min !== undefined) return `${info.label} ab ${wants.min}${info.unit ? ' ' + info.unit : ''}`;
  if (wants.max !== undefined) return `${info.label} bis ${wants.max}${info.unit ? ' ' + info.unit : ''}`;
  if (Array.isArray(wants.preferred)) return `${info.label}: ${wants.preferred.join(' / ')}`;
  if (Array.isArray(wants.excluded)) return `${info.label}: nicht ${wants.excluded.join(' / ')}`;
  return info.label;
}

function contradicts(wants, value) {
  if (value === null || value === undefined) return false;
  if ('match' in wants) {
    if (typeof value === 'boolean') {
      return value !== Boolean(wants.match);
    }
    if (typeof value === 'number') {
      return Number(value) !== Number(wants.match);
    }
    if (typeof value === 'string') {
      return String(value).trim().toLowerCase() !== String(wants.match).trim().toLowerCase();
    }
    return value !== wants.match;
  }
  if ('min' in wants && typeof value === 'number' && value < wants.min) {
    return true;
  }
  if ('max' in wants && typeof value === 'number' && value > wants.max) {
    return true;
  }
  if (Array.isArray(wants.preferred) && typeof value === 'string') {
    const lower = value.toLowerCase();
    return !wants.preferred.some(p => String(p).toLowerCase() === lower);
  }
  if (Array.isArray(wants.excluded) && typeof value === 'string') {
    const lower = value.toLowerCase();
    return wants.excluded.some(e => String(e).toLowerCase() === lower);
  }
  return false;
}

/**
 * Normalizes rejection reasons so variations (e.g. 3000 MHz vs 2666 MHz)
 * group together into meaningful aggregate buckets.
 */
function normalizeReason(raw) {
  if (!raw) return 'Ohne Begründung';
  const str = String(raw).trim();

  if (/sodimm.*statt.*dimm/i.test(str)) {
    return 'SODIMM statt DIMM';
  }

  // "Taktung 3000 MHz statt mind. 3200 MHz" -> "Taktung unter mind. 3200 MHz"
  const minMatch = str.match(/^(.+?)\s+[\d\.,]+\s*(\w+)?\s+statt\s+(mind\..+)$/);
  if (minMatch) {
    return `${minMatch[1]} unter ${minMatch[3]}`;
  }

  // "CAS-Latenz 18 statt höchstens 16" -> "CAS-Latenz über höchstens 16"
  const maxMatch = str.match(/^(.+?)\s+[\d\.,]+\s*(\w+)?\s+statt\s+(höchstens.+)$/);
  if (maxMatch) {
    return `${maxMatch[1]} über ${maxMatch[3]}`;
  }

  return str;
}

/**
 * Computes price histogram classes from a list of integer prices.
 */
function buildPriceHistogram(prices) {
  if (!prices || prices.length === 0) {
    return { min: null, max: null, count: 0, bins: [] };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const count = sorted.length;

  if (min === max) {
    return {
      min,
      max,
      count,
      bins: [{ min, max, count, label: `${min} €` }],
    };
  }

  const range = max - min;
  const targetBins = 7;
  const rawStep = range / targetBins;
  const niceSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500, 1000];
  const step = niceSteps.find(s => s >= rawStep) || Math.ceil(rawStep);

  const start = Math.floor(min / step) * step;
  const bins = [];

  for (let current = start; current <= max; current += step) {
    const binMin = current;
    const binMax = current + step - 1;
    bins.push({
      min: binMin,
      max: binMax,
      count: 0,
      label: `${binMin}–${binMax} €`,
    });
  }

  for (const price of sorted) {
    const idx = Math.min(Math.floor((price - start) / step), bins.length - 1);
    if (idx >= 0 && idx < bins.length) {
      bins[idx].count++;
    }
  }

  // Filter out completely empty outer trailing bins if any
  return { min, max, count, bins };
}

module.exports = (query, get) => {
  /**
   * Resolves campaign searches in the same precedence order as the results screen:
   * Route -> Family -> Plain campaign.
   */
  async function resolveCampaignScope(campaignId, searchIdParam) {
    const campaign = await get('SELECT id, name FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) return null;

    if (searchIdParam) {
      const search = await get('SELECT id, name, campaign_id, knowledge_set_id FROM searches WHERE id = ?', [searchIdParam]);
      if (search) {
        return {
          campaign,
          kind: 'search',
          searchIds: [Number(search.id)],
          primarySearchId: Number(search.id),
        };
      }
    }

    const route = await get(
      'SELECT id FROM route_searches WHERE campaign_id = ? ORDER BY id DESC LIMIT 1',
      [campaignId]
    );
    if (route) {
      const circles = await query(
        'SELECT DISTINCT search_id FROM route_search_circles WHERE route_search_id = ?',
        [route.id]
      );
      const searchIds = circles.map(c => Number(c.search_id));
      return {
        campaign,
        kind: 'route',
        routeId: Number(route.id),
        searchIds,
        primarySearchId: searchIds[0] || null,
      };
    }

    const family = await get(
      'SELECT id FROM search_families WHERE campaign_id = ? ORDER BY id DESC LIMIT 1',
      [campaignId]
    );
    if (family) {
      const rows = await query(
        'SELECT DISTINCT search_id FROM search_family_searches WHERE family_id = ? AND active = 1',
        [family.id]
      );
      const searchIds = rows.map(r => Number(r.search_id));
      return {
        campaign,
        kind: 'family',
        familyId: Number(family.id),
        searchIds,
        primarySearchId: searchIds[0] || null,
      };
    }

    const plainSearches = await query('SELECT id FROM searches WHERE campaign_id = ?', [campaignId]);
    const searchIds = plainSearches.map(s => Number(s.id));
    return {
      campaign,
      kind: 'plain',
      searchIds,
      primarySearchId: searchIds[0] || null,
    };
  }

  async function getOverview(scope, reqQuery) {
    const { campaign, kind, routeId, familyId, searchIds, primarySearchId } = scope;
    const { q, dealsOnly, min_price, minPrice, max_price, maxPrice, term, maxDetour } = reqQuery;

    const whereConditions = [];
    const whereParams = [];

    // Scope listings based on campaign kind
    let fromSql = '';
    let fitJoinSql = '';

    if (kind === 'search') {
      fromSql = `
        FROM listings l
        LEFT JOIN listing_search_hits lsh ON lsh.listing_id = l.id AND lsh.search_id = ?
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND fit.search_id = ?
      `;
      whereConditions.push('(l.search_id = ? OR lsh.search_id = ?)');
      whereParams.push(primarySearchId, primarySearchId, primarySearchId, primarySearchId);
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
      // Plain campaign
      fromSql = `
        FROM listings l
        LEFT JOIN searches s ON l.search_id = s.id
        LEFT JOIN listing_search_hits lsh ON lsh.listing_id = l.id
        LEFT JOIN searches hs ON hs.id = lsh.search_id
        LEFT JOIN listing_fit fit ON fit.listing_id = l.id AND (fit.search_id = s.id OR fit.search_id = hs.id)
      `;
      whereConditions.push('(s.campaign_id = ? OR hs.campaign_id = ?)');
      whereParams.push(campaign.id, campaign.id);
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

    // Query listings with their verdicts and facts
    const sql = `
      SELECT l.id, l.price_eur,
             MAX(lsh.first_seen_at) AS first_seen_at,
             MAX(fit.verdict) AS verdict,
             MAX(fit.reason) AS reason,
             MAX(fit.facts_json) AS facts_json
      ${fromSql}
      ${whereSql}
      GROUP BY l.id
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
    const rejections = [...rejectionMap.entries()]
      .map(([reason, data]) => ({
        reason,
        count: data.count,
        examples: [...data.examples.entries()].map(([ex, c]) => (c > 1 ? `${ex} (${c})` : ex)),
      }))
      .sort((a, b) => b.count - a.count);

    const exactRejections = [...exactRejectionMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // 3. Price histogram & market statistics
    const references = await referencePrices(query, searchIds);
    let marketMedian = null;
    let dealThreshold = null;
    let cheapest = null;

    if (searchIds.length > 0) {
      if (primarySearchId && references.has(primarySearchId)) {
        const ref = references.get(primarySearchId);
        marketMedian = ref.median;
        cheapest = ref.cheapest;
        if (ref.count >= MIN_GROUP_SIZE) {
          dealThreshold = Math.min(
            ref.cheapest,
            Math.floor(ref.median * DEAL_RATIO),
            ref.median - MIN_ABSOLUTE_SAVING_EUR
          );
        }
      } else if (references.size > 0) {
        // Average across group references
        const refs = [...references.values()];
        const sumMedian = refs.reduce((acc, r) => acc + r.median, 0);
        marketMedian = Math.round(sumMedian / refs.length);
        const minCheapest = Math.min(...refs.map(r => r.cheapest));
        cheapest = minCheapest;
        dealThreshold = Math.min(
          minCheapest,
          Math.floor(marketMedian * DEAL_RATIO),
          marketMedian - MIN_ABSOLUTE_SAVING_EUR
        );
      }
    }

    // Fallback median from current scoped prices if no reference was stored
    if (marketMedian === null && prices.length > 0) {
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sortedPrices.length / 2);
      marketMedian = sortedPrices.length % 2 === 0
        ? Math.round((sortedPrices[mid - 1] + sortedPrices[mid]) / 2)
        : sortedPrices[mid];
    }

    // Clustering: where most prices gather
    let clusterShare = null;
    let clusterMin = null;
    let clusterMax = null;
    if (prices.length > 0) {
      const freq = {};
      for (const p of prices) freq[p] = (freq[p] || 0) + 1;
      const common = Object.keys(freq)
        .map(Number)
        .sort((a, b) => freq[b] - freq[a])
        .slice(0, 2)
        .sort((a, b) => a - b);
      if (common.length > 0) {
        clusterMin = common[0];
        clusterMax = common[common.length - 1];
        const inCluster = prices.filter(p => p >= clusterMin && p <= clusterMax).length;
        clusterShare = Math.round((100 * inCluster) / prices.length);
      }
    }

    const histogram = buildPriceHistogram(prices);
    const market = {
      median: marketMedian,
      deal_threshold: dealThreshold,
      cheapest,
      min: histogram.min,
      max: histogram.max,
      count: histogram.count,
      bins: histogram.bins,
      cluster_share: clusterShare,
      cluster_min: clusterMin,
      cluster_max: clusterMax,
    };

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

    const requirementStats = requirementFields.map(f => {
      const fid = f.id;
      const wants = f.buyer_wants || {};
      const info = FIELD_INFO[fid] || { label: fid, unit: '' };

      let passed = 0;
      let contradictedCount = 0;
      let missing = 0;

      for (const facts of factsList) {
        const val = facts[fid];
        if (val === undefined || val === null) {
          missing++;
        } else if (contradicts(wants, val)) {
          contradictedCount++;
        } else {
          passed++;
        }
      }

      const evalTotal = factsList.length;
      return {
        id: fid,
        label: info.label,
        unit: info.unit || null,
        text: formatRequirementText(f, requirementFields),
        buyer_wants: wants,
        survivors: evalTotal - contradictedCount,
        passed,
        contradicted: contradictedCount,
        missing,
        total: evalTotal,
      };
    });

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
      const scope = await resolveCampaignScope(req.params.id, req.query.search_id);
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
        scope = await resolveCampaignScope(search.campaign_id, req.params.id);
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
