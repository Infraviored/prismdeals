/**
 * Hunts as queries (plan §5, §12).
 *
 *   GET  /api/hunts               every hunt: name, targets, counts, newest offer
 *   POST /api/hunts               the hunt document -> the stored document
 *   GET  /api/hunts/:id           the document, with each target's attributes
 *   PUT  /api/hunts/:id           the same document, changed -> the stored document
 *   DELETE /api/hunts/:id         the hunt and its crawl plan; what it found stays
 *   GET  /api/hunts/:id/listings  offers with computed verdicts, filtered, sorted, paged
 *   GET  /api/hunts/:id/overview  counts, rejection reasons, markets, conditions
 *   GET  /api/listings/:id        one listing, with its hunt's verdict when ?campaign_id=
 *   POST /api/hunts/draft         {text} -> a document drafted from the buyer's words, not saved
 *   POST /api/hunts/edit          the document changed in words, not saved
 *
 * Python (scraper/graph/cli.py) writes the graph; this side reads it. A model
 * that cannot be asked answers 503 "KI nicht erreichbar" -- never a guess.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { graph, runJson } = require('./python');
const { huntScope, huntListings, routeShape } = require('./hunt_listings');
const { effectiveAttributes } = require('./db/graph');
const { conditionText } = require('./db/verdict');
const { listingOrder } = require('./listing_order');
const { attachPriceHistory } = require('./listing_extras');
const { attachRanks, startCompare } = require('./compare_api');
const { buildPriceHistogram } = require('./db/market');

// One refine per hunt at a time; asked for while one runs, it runs once more.
const refining = new Map();
function refine(campaignId) {
  if (refining.has(campaignId)) {
    refining.set(campaignId, true);
    return;
  }
  refining.set(campaignId, false);
  graph(['refine', String(campaignId)]).then(result => {
    if (result.status !== 200) console.error('Refining hunt %s: %s', campaignId, result.body.error);
    // What fits may have changed with what the hunt wants: rank it again.
    startCompare(campaignId);
    const again = refining.get(campaignId);
    refining.delete(campaignId);
    if (again) refine(campaignId);
  });
}

function conditionOut(c) {
  return {
    id: c.id,
    attr_id: c.attr_id,
    label: c.label,
    op: c.op,
    value: c.value,
    importance: c.importance,
    text: conditionText(c),
  };
}

const num = (v) => (v === undefined || v === '' || v === null || isNaN(Number(v)) ? undefined : Number(v));

module.exports = (query, get) => {
  const router = express.Router();

  async function documentOf(campaignId) {
    const scope = await huntScope(query, get, campaignId);
    if (!scope) return null;
    const { tree, hunt, family, route } = scope;
    const targets = [];
    for (const t of hunt.targets) {
      targets.push({
        ...t,
        attributes: await effectiveAttributes(query, tree, t.node_id),
        conditions: hunt.conditions.filter(c => c.node_id === t.node_id).map(conditionOut),
      });
    }
    const crawl = family
      ? await query(
        `SELECT t.id, t.label, COUNT(sfs.search_id) AS searches
           FROM search_family_terms t
           LEFT JOIN search_family_searches sfs ON sfs.term_id = t.id AND sfs.active = 1
          WHERE t.family_id = ? GROUP BY t.id ORDER BY t.position`,
        [family.id]
      )
      : [];
    return {
      id: hunt.id,
      name: hunt.name,
      text: hunt.text,
      category_code: hunt.category_code,
      frame: hunt.frame,
      family_id: family ? family.id : null,
      route: route ? { id: route.id, origin: route.origin, destination: route.destination, half_width_km: route.half_width_km } : null,
      targets,
      conditions: hunt.conditions.filter(c => c.node_id === null).map(conditionOut),
      crawl,
    };
  }

  async function save(req, res, campaignId) {
    const args = ['hunt-save'];
    if (campaignId) args.push(String(campaignId));
    const result = await graph(args, JSON.stringify(req.body || {}));
    if (result.status !== 200) return res.status(result.status).json(result.body);
    refine(result.body.id);
    res.json(await documentOf(result.body.id));
  }

  router.get('/api/hunts', async (req, res) => {
    try {
      const ids = (await query('SELECT DISTINCT campaign_id FROM hunt_targets ORDER BY campaign_id DESC'))
        .map(r => r.campaign_id);
      const out = [];
      for (const id of ids) {
        const scope = await huntScope(query, get, id);
        if (!scope) continue;
        const listings = await huntListings(query, scope);
        const counts = { all: listings.length, fit: 0, unclear: 0, no: 0 };
        for (const l of listings) counts[l.fit.verdict] += 1;
        const newest = listings.find(l => l.fit.verdict === 'fit') || null;
        out.push({
          id,
          name: scope.hunt.name,
          targets: scope.hunt.targets.map(t => t.name),
          frame: scope.hunt.frame,
          route: scope.route ? { origin: scope.route.origin, destination: scope.route.destination } : null,
          counts,
          newest: newest ? { id: newest.id, title: newest.title, price: newest.price, image: newest.images[0] || null, first_seen_at: newest.first_seen_at } : null,
        });
      }
      res.json(out);
    } catch (error) {
      console.error('Listing hunts failed:', error);
      res.status(500).json({ error: 'Die Suchen konnten nicht gelesen werden.' });
    }
  });

  router.post('/api/hunts', (req, res) => save(req, res, null).catch(error => {
    console.error('Saving a hunt failed:', error);
    res.status(500).json({ error: 'Die Suche konnte nicht gespeichert werden.' });
  }));

  router.put('/api/hunts/:id', (req, res) => save(req, res, Number(req.params.id)).catch(error => {
    console.error('Saving a hunt failed:', error);
    res.status(500).json({ error: 'Die Suche konnte nicht gespeichert werden.' });
  }));

  router.delete('/api/hunts/:id', async (req, res) => {
    const result = await graph(['hunt-delete', String(Number(req.params.id))]);
    res.status(result.status === 200 && !result.body.deleted ? 404 : result.status).json(result.body);
  });

  router.get('/api/hunts/:id', async (req, res) => {
    try {
      const doc = await documentOf(Number(req.params.id));
      if (!doc) return res.status(404).json({ error: 'Keine Suche mit dieser Nummer' });
      res.json(doc);
    } catch (error) {
      console.error('Reading a hunt failed:', error);
      res.status(500).json({ error: 'Die Suche konnte nicht gelesen werden.' });
    }
  });

  router.get('/api/hunts/:id/listings', async (req, res) => {
    try {
      const scope = await huntScope(query, get, Number(req.params.id));
      if (!scope) return res.status(404).json({ error: 'Keine Suche mit dieser Nummer' });
      const all = await huntListings(query, scope, {
        q: (req.query.q || '').trim() || undefined,
        minPrice: num(req.query.min_price),
        maxPrice: num(req.query.max_price),
        maxDetour: num(req.query.maxDetour),
      });
      let listings = all;
      const target = num(req.query.target);
      if (target !== undefined) listings = listings.filter(l => l.fit.target_id === target);
      if (req.query.dealsOnly === '1' || req.query.dealsOnly === 'true') listings = listings.filter(l => l.is_deal);
      const counts = { all: listings.length, fit: 0, unclear: 0, no: 0 };
      for (const l of listings) counts[l.fit.verdict] += 1;
      if (['fit', 'unclear', 'no'].includes(req.query.verdict)) {
        listings = listings.filter(l => l.fit.verdict === req.query.verdict);
      }
      const total = listings.length;
      const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      // Every pin of the tab rides along with the first page.
      const points = offset > 0 ? undefined : listings
        .filter(l => typeof l.lat === 'number' && typeof l.lon === 'number')
        .map(l => ({
          id: l.id, title: l.title, price: l.price, location: l.location, url: l.url,
          lat: l.lat, lon: l.lon, detour_min: l.detour_min, offroute_km: l.offroute_km,
          distance_km: l.distance_km, images: l.images.slice(0, 1),
        }));
      const order = listingOrder(req.query.sort || 'score', Boolean(scope.route));
      if (order) listings = [...listings].sort(order);
      const names = new Map(scope.hunt.targets.map(t => [t.node_id, t.name]));
      listings = listings.slice(offset, offset + limit).map(l => ({
        ...l,
        target: l.fit.target_id ? { node_id: l.fit.target_id, name: names.get(l.fit.target_id) } : null,
      }));
      await attachPriceHistory(query, listings);
      await attachRanks(query, get, listings, scope.hunt.id);
      res.json({ total, counts, offset, limit, route: routeShape(scope.route), points, listings });
    } catch (error) {
      console.error('Hunt listings failed:', error);
      res.status(500).json({ error: 'Die Angebote konnten nicht gelesen werden.' });
    }
  });

  // One listing, by its Kleinanzeigen id, so a find can be shared as a link.
  // With campaign_id it carries that hunt's verdict, score and rank.
  router.get('/api/listings/:id', async (req, res) => {
    try {
      const campaignId = num(req.query.campaign_id);
      const scope = campaignId !== undefined ? await huntScope(query, get, campaignId) : null;
      let listing = scope ? (await huntListings(query, scope)).find(l => String(l.id) === String(req.params.id)) : null;
      if (listing) {
        await attachRanks(query, get, [listing], scope.hunt.id);
        const target = scope.hunt.targets.find(t => t.node_id === listing.fit.target_id);
        listing = {
          ...listing,
          campaign_name: scope.hunt.name,
          target: target ? { node_id: target.node_id, name: target.name } : null,
        };
      } else {
        const row = await get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Listing not found' });
        listing = { ...row, details: JSON.parse(row.details || '{}'), images: JSON.parse(row.images || '[]'), fit: null };
      }
      const [withHistory] = await attachPriceHistory(query, [listing]);
      res.json(withHistory);
    } catch (error) {
      console.error('GET /api/listings/:id failed:', error);
      res.status(500).json({ error: 'Could not load listing' });
    }
  });

  router.get('/api/hunts/:id/overview', async (req, res) => {
    try {
      const scope = await huntScope(query, get, Number(req.params.id));
      if (!scope) return res.status(404).json({ error: 'Keine Suche mit dieser Nummer' });
      const listings = await huntListings(query, scope);
      const pots = { all: listings.length, fit: 0, unclear: 0, no: 0 };
      const groups = new Map();
      for (const l of listings) {
        pots[l.fit.verdict] += 1;
        if (l.fit.verdict !== 'no') continue;
        // "Anderes Modell: Yamaha WR 125" groups under "Anderes Modell".
        const first = l.fit.reason.split(' · ')[0];
        const group = first.split(': ')[0].split(' (')[0];
        if (!groups.has(group)) groups.set(group, { reason: group, count: 0, examples: new Map() });
        const g = groups.get(group);
        g.count += 1;
        g.examples.set(first, (g.examples.get(first) || 0) + 1);
      }
      const rejections = [...groups.values()]
        .sort((a, b) => b.count - a.count)
        .map(g => ({
          reason: g.reason,
          count: g.count,
          examples: [...g.examples.entries()].sort((a, b) => b[1] - a[1]).map(([e, c]) => (c > 1 ? `${e} (${c})` : e)),
        }));
      const kept = listings.filter(l => l.fit.verdict !== 'no');
      const prices = kept.map(l => l.price_eur).filter(p => typeof p === 'number' && p > 0);
      const conditions = scope.hunt.conditions.map(c => {
        const judged = listings.filter(l => l.fit.states[c.id]);
        const count = (s) => judged.filter(l => l.fit.states[c.id] === s).length;
        return { ...conditionOut(c), node_id: c.node_id, met: count('met'), violated: count('violated'), open: count('open'), total: judged.length };
      });
      // The market of each target, whether or not this hunt has found one yet.
      const markets = scope.hunt.targets.map(t => {
        const market = scope.markets.get(t.node_id);
        return { node_id: t.node_id, name: t.name, count: market ? market.count : 0, median: market ? market.median : null };
      });
      let lastCrawled = null;
      if (scope.searchIds.length) {
        const ran = await get(
          `SELECT MAX(last_scraped_at) AS at FROM searches WHERE id IN (${scope.searchIds.map(() => '?').join(',')})`,
          scope.searchIds
        );
        lastCrawled = ran ? ran.at : null;
      }
      let scheduleInterval = 0;
      try {
        scheduleInterval = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'schedule_config.json'), 'utf8')).interval || 0;
      } catch { /* no schedule configured */ }
      res.json({
        campaign_id: scope.hunt.id,
        campaign_name: scope.hunt.name,
        pots,
        rejections,
        markets,
        price_distribution: buildPriceHistogram(prices),
        conditions,
        last_crawled_at: lastCrawled,
        schedule_interval: scheduleInterval,
      });
    } catch (error) {
      console.error('Hunt overview failed:', error);
      res.status(500).json({ error: 'Die Übersicht konnte nicht berechnet werden.' });
    }
  });

  router.post('/api/hunts/draft', async (req, res) => {
    const text = String((req.body || {}).text || '').trim();
    if (!text) return res.status(400).json({ error: 'Was wird gesucht?' });
    const result = await graph(['draft', '--', text]);
    res.status(result.status).json(result.body);
  });

  // The document changed in the buyer's words ("nur SC59 bei der CBR, unter
  // 5000 km"). Nothing is saved: the edit screen shows the change, then PUTs.
  router.post('/api/hunts/edit', async (req, res) => {
    const { document, instruction } = req.body || {};
    if (!document || typeof document !== 'object' || !Array.isArray(document.targets)) {
      return res.status(400).json({ error: 'document with targets is required' });
    }
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: 'instruction is required' });
    }
    const result = await runJson(['hunt_edit.py'], JSON.stringify({ document, instruction }));
    res.status(result.status === 200 && result.body.error ? 422 : result.status).json(result.body);
  });

  return router;
};

module.exports.refine = refine;
