/**
 * Market per node: the usual price of a product, not a search.
 * Excludes defects, parts donors and accessories from the median.
 * docs/product-core.md §7, plan-hunt-engine.md §11 (P8).
 */

const { fitJoinOn } = require('./requirements_hash');

const MIN_NODE_SAMPLE = 5;

const EXCLUSION_KEYWORDS = [
  'defekt', 'teildefekt', 'kaputt', 'bastler', 'bastlerfahrzeug',
  'ersatzteil', 'ersatzteile', 'teile', 'schlachtung', 'schlachtfest',
  'teilespender', 'ersatzteilspender',
  'nicht funktionsfähig', 'nicht funktionstüchtig',
  'ohne motor', 'ohne getriebe', 'ohne display', 'ohne akku',
  'für bastler', 'an bastler', 'zum ausschlachten',
  'suche', 'gesucht',
];

const EXCLUSION_RE = new RegExp(
  '\\b(' + EXCLUSION_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'i'
);

function isMarketExcluded(listing) {
  if (!listing) return false;
  const condition = listing.details?.Zustand || listing.details?.zustand || '';
  if (String(condition).toLowerCase().trim() === 'defekt') return true;

  const text = [listing.title, listing.short_description].filter(Boolean).join(' ');
  if (EXCLUSION_RE.test(text)) return true;

  if (listing.fit?.verdict === 'no') return true;

  const price = Number(listing.price_eur);
  if (typeof listing.price_eur !== 'undefined' && listing.price_eur !== null && (isNaN(price) || price <= 0)) {
    return true;
  }
  return false;
}

function nodeChain(nodeKey) {
  if (!nodeKey) return [];
  const parts = nodeKey.split('/');
  const chain = [];
  for (let i = parts.length; i > 0; i--) {
    chain.push(parts.slice(0, i).join('/'));
  }
  return chain;
}

function medianOf(prices) {
  if (!prices || !prices.length) return null;
  const valid = prices.filter(p => typeof p === 'number' && !isNaN(p) && p > 0);
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return { median: Math.round(median), count: sorted.length };
}

async function nodeMedians(query, nodeKeys, scopeSearchIds = []) {
  const result = new Map();
  if (!nodeKeys || !nodeKeys.length) return result;

  const allKeys = new Set();
  for (const key of nodeKeys) {
    for (const k of nodeChain(key)) allKeys.add(k);
  }

  const keyList = [...allKeys];
  const conds = keyList.map(() => '(ln.node_key = ? OR ln.node_key LIKE ?)').join(' OR ');
  const params = [];
  for (const k of keyList) {
    params.push(k, k + '/%');
  }

  const rows = await query(`
    SELECT ln.node_key, l.price_eur
      FROM listing_nodes ln
      JOIN listings l ON l.id = ln.listing_id
      LEFT JOIN listing_fit fit ON fit.listing_id = l.id
     WHERE (${conds})
       AND l.price_eur IS NOT NULL
       AND l.price_eur > 0
       AND (fit.verdict IS NULL OR fit.verdict <> 'no')
       AND COALESCE(json_extract(l.details, '$.Zustand'), '') <> 'Defekt'
       AND NOT (
         LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%defekt%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%bastler%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%ersatzteil%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%schlacht%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%kaputt%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%teilespender%'
         OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
         LIKE '%suche%'
       )
  `, params);

  const pricesByNode = new Map();
  for (const row of rows) {
    const chain = nodeChain(row.node_key);
    for (const k of chain) {
      if (!allKeys.has(k)) continue;
      if (!pricesByNode.has(k)) pricesByNode.set(k, []);
      pricesByNode.get(k).push(Number(row.price_eur));
    }
  }

  const mediansByNode = new Map();
  for (const [key, prices] of pricesByNode) {
    const m = medianOf(prices);
    if (m) mediansByNode.set(key, m);
  }

  let scopeMedian = null;
  if (scopeSearchIds && scopeSearchIds.length > 0) {
    const scopePlaceholders = scopeSearchIds.map(() => '?').join(',');
    const scopeRows = await query(`
      SELECT l.price_eur
        FROM listing_search_hits lsh
        JOIN listings l ON l.id = lsh.listing_id
        LEFT JOIN listing_fit fit ON ${fitJoinOn('l.id', 'lsh.search_id')}
       WHERE lsh.search_id IN (${scopePlaceholders})
         AND l.price_eur IS NOT NULL
         AND l.price_eur > 0
         AND (fit.verdict IS NULL OR fit.verdict <> 'no')
         AND COALESCE(json_extract(l.details, '$.Zustand'), '') <> 'Defekt'
         AND NOT (
           LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
           LIKE '%defekt%'
           OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
           LIKE '%bastler%'
           OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
           LIKE '%ersatzteil%'
           OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
           LIKE '%schlacht%'
           OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.short_description, ''))
           LIKE '%suche%'
         )
    `, scopeSearchIds);
    const scopePrices = scopeRows.map(r => Number(r.price_eur));
    scopeMedian = medianOf(scopePrices);
  }

  for (const key of nodeKeys) {
    const chain = nodeChain(key);
    let found = null;
    for (const candidate of chain) {
      const m = mediansByNode.get(candidate);
      if (m && m.count >= MIN_NODE_SAMPLE) {
        found = {
          median: m.median,
          count: m.count,
          basis: candidate,
          basis_type: candidate === key ? 'node' : 'parent',
        };
        break;
      }
    }
    if (!found && scopeMedian && scopeMedian.count >= MIN_NODE_SAMPLE) {
      found = {
        median: scopeMedian.median,
        count: scopeMedian.count,
        basis: 'scope',
        basis_type: 'scope',
      };
    }
    if (found) result.set(key, found);
  }

  return result;
}

function normalizeNodePart(entry) {
  const value = typeof entry === 'object' && entry !== null ? entry.value : entry;
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase()
    .replace(/[^a-z0-9äöüß\s.-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return cleaned || null;
}

function resolveNode(listing, factSheet, playbookKey, rankNode, huntFallback) {
  if (rankNode) {
    return { node_key: rankNode, source: 'rank' };
  }

  const criteria = factSheet?.criteria || {};
  if (playbookKey === 'vehicles/cars' || playbookKey === 'vehicles/motorcycles') {
    const make = normalizeNodePart(criteria.make);
    const model = normalizeNodePart(criteria.model);
    const prefix = playbookKey === 'vehicles/cars' ? 'auto' : 'motorrad';
    if (make && model) return { node_key: `${prefix}/${make}/${model}`, source: 'identity' };
    if (make) return { node_key: `${prefix}/${make}`, source: 'identity' };
  }

  if (playbookKey === 'electronics/laptops' || playbookKey === 'electronics/phones') {
    const brand = normalizeNodePart(criteria.brand);
    const model = normalizeNodePart(criteria.modelName);
    const prefix = playbookKey === 'electronics/laptops' ? 'laptop' : 'handy';
    if (brand && model) return { node_key: `${prefix}/${brand}/${model}`, source: 'identity' };
    if (brand) return { node_key: `${prefix}/${brand}`, source: 'identity' };
  }

  if (playbookKey === 'computing/memory') {
    const gen = normalizeNodePart(criteria.generation);
    const stickVal = typeof criteria.stickCount === 'object' && criteria.stickCount !== null
      ? criteria.stickCount.value : criteria.stickCount;
    const perStickVal = typeof criteria.gbPerStick === 'object' && criteria.gbPerStick !== null
      ? criteria.gbPerStick.value : criteria.gbPerStick;
    if (gen && stickVal && perStickVal) {
      return { node_key: `ram/${gen}/${stickVal}x${perStickVal}gb`, source: 'playbook' };
    }
    if (gen) {
      return { node_key: `ram/${gen}`, source: 'playbook' };
    }
  }

  if (huntFallback) {
    return { node_key: huntFallback, source: 'hunt' };
  }

  return { node_key: 'unknown', source: 'hunt' };
}

function humanNodeLabel(basis) {
  if (!basis || basis === 'scope' || basis === 'unknown') return '';
  const parts = basis.split('/');
  const category = parts[0];
  const rest = parts.slice(1).map(p =>
    p.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
  if (category === 'motorrad' || category === 'auto') {
    const article = category === 'auto' ? 'ein' : 'eine';
    return `${article} ${rest.join(' ')}`.trim();
  }
  if (category === 'laptop' || category === 'handy') {
    return `ein ${rest.join(' ')}`.trim();
  }
  if (category === 'ram') {
    return `${rest.join(' ').toUpperCase()} RAM`;
  }
  return rest.join(' ');
}

function formatMarketBasis(priceDeltaPct, market) {
  if (!market) return '';
  const nodeLabel = humanNodeLabel(market.basis);
  const count = market.count;
  if (priceDeltaPct > 0) {
    return `${priceDeltaPct} % unter dem üblichen Preis${nodeLabel ? ` für ${nodeLabel}` : ''} (${count} Angebote)`;
  }
  if (priceDeltaPct < 0) {
    return `${-priceDeltaPct} % über dem üblichen Preis${nodeLabel ? ` für ${nodeLabel}` : ''} (${count} Angebote)`;
  }
  return `Zum üblichen Preis${nodeLabel ? ` für ${nodeLabel}` : ''} (${count} Angebote)`;
}

async function valueDrivers(query, nodeKey) {
  const rows = await query(`
    SELECT
      CAST(
        COALESCE(
          json_extract(fs.facts_json, '$.criteria.firstRegistrationYear.value'),
          json_extract(fs.facts_json, '$.criteria.modelYear.value')
        ) AS INTEGER
      ) AS year,
      l.price_eur
    FROM listing_nodes ln
    JOIN listings l ON l.id = ln.listing_id
    LEFT JOIN fact_sheets fs ON fs.listing_id = l.id
    LEFT JOIN listing_fit fit ON fit.listing_id = l.id
    WHERE ln.node_key = ?
      AND l.price_eur IS NOT NULL
      AND l.price_eur > 0
      AND (fit.verdict IS NULL OR fit.verdict <> 'no')
      AND COALESCE(json_extract(l.details, '$.Zustand'), '') <> 'Defekt'
      AND year IS NOT NULL
      AND year >= 1990
      AND year <= 2030
  `, [nodeKey]);

  if (rows.length < 30) return null;

  const buckets = new Map();
  for (const row of rows) {
    const y = Number(row.year);
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push(Number(row.price_eur));
  }

  const result = [];
  for (const [year, prices] of [...buckets].sort((a, b) => a[0] - b[0])) {
    if (prices.length < 2) continue;
    const m = medianOf(prices);
    if (m) result.push({ year, median_price: m.median, count: m.count });
  }

  return result.length >= 2 ? result : null;
}

async function annotateNodeMarket(query, listings, scopeSearchIds = []) {
  if (!listings || !listings.length) return listings;

  const ids = listings.map(l => String(l.id));
  const placeholders = ids.map(() => '?').join(',');

  let rankNodes = new Map();
  try {
    const rankRows = await query(`
      SELECT lr.listing_id, lr.node
        FROM listing_ranks lr
        JOIN judge_runs jr ON jr.id = lr.run_id
       WHERE lr.listing_id IN (${placeholders})
         AND lr.node IS NOT NULL
       ORDER BY jr.created_at DESC
    `, ids);
    for (const row of rankRows) {
      if (!rankNodes.has(String(row.listing_id))) {
        rankNodes.set(String(row.listing_id), row.node);
      }
    }
  } catch {
    // listing_ranks.node column may not exist yet
  }

  const nodeRows = await query(`
    SELECT listing_id, node_key FROM listing_nodes
     WHERE listing_id IN (${placeholders})
  `, ids);
  const storedNodes = new Map();
  for (const row of nodeRows) {
    storedNodes.set(String(row.listing_id), row.node_key);
  }

  const effectiveNodes = new Map();
  for (const listing of listings) {
    const id = String(listing.id);
    const rankNode = rankNodes.get(id);
    const storedNode = storedNodes.get(id);
    effectiveNodes.set(id, rankNode || storedNode || null);
  }

  const uniqueNodes = [...new Set([...effectiveNodes.values()].filter(Boolean))];
  const medians = uniqueNodes.length > 0
    ? await nodeMedians(query, uniqueNodes, scopeSearchIds)
    : new Map();

  for (const listing of listings) {
    const nodeKey = effectiveNodes.get(String(listing.id));
    if (nodeKey) {
      const market = medians.get(nodeKey);
      if (market) {
        listing.market_median = market.median;
        const delta = typeof listing.price_eur === 'number' && market.median > 0
          ? Math.round(((market.median - listing.price_eur) / market.median) * 100)
          : 0;
        listing.market_basis = {
          ...market,
          label: humanNodeLabel(market.basis),
          text: formatMarketBasis(delta, market),
        };
      }
    }
  }

  return listings;
}

module.exports = {
  isMarketExcluded,
  nodeChain,
  medianOf,
  nodeMedians,
  resolveNode,
  normalizeNodePart,
  formatMarketBasis,
  humanNodeLabel,
  valueDrivers,
  annotateNodeMarket,
  MIN_NODE_SAMPLE,
  EXCLUSION_KEYWORDS,
  EXCLUSION_RE,
};
