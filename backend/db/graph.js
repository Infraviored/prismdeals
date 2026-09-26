/**
 * Reading the product graph (plan §12). Python (scraper/graph/) is the only
 * writer; this side reads nodes, a hunt and the listings' resolution and facts.
 *
 * The node table is small (a category tree plus the products hunted for), so a
 * request loads it once into a map and walks it in memory.
 */

const SLACK_AFTER = 1; // a first registration may follow the build year by one

async function loadTree(query) {
  const rows = await query(
    `SELECT id, parent_id, kind, key, name, category_code, years_from, years_to, status
       FROM nodes WHERE merged_into IS NULL`
  );
  const byId = new Map(rows.map(r => [r.id, r]));
  const ancestors = (id) => {
    const chain = [];
    for (let n = byId.get(id); n; n = n.parent_id ? byId.get(n.parent_id) : null) chain.push(n);
    return chain.reverse();
  };
  return { byId, ancestors };
}

/**
 * The node as a hunt shows it: brand, model, generation, with a name that
 * already contains the one above, or its last words, standing for them ("CBR"
 * -> "CBR 1000 RR"; "Sony PlayStation" -> "PlayStation 5" is "Sony
 * PlayStation 5"). The same rule as scraper/graph/place.describe.
 */
function describe(tree, id) {
  let words = [];
  for (const n of tree.ancestors(id)) {
    if (n.kind === 'category' || n.kind === 'class') continue;
    let k = words.length;
    while (k > 0 && !n.name.toLowerCase().startsWith(words.slice(-k).join(' ').toLowerCase())) k--;
    words = [...words.slice(0, words.length - k), ...n.name.split(/\s+/)];
  }
  const node = tree.byId.get(id);
  return words.join(' ') || (node ? node.name : '');
}

/** Attributes of a node and everything above it; the deeper one wins. */
async function effectiveAttributes(query, tree, id) {
  const chain = tree.ancestors(id).map(n => n.id);
  if (!chain.length) return [];
  const rows = await query(
    `SELECT node_id, attr_id, label, type, unit, options_json, site_filter
       FROM node_attributes WHERE node_id IN (${chain.map(() => '?').join(',')})`,
    chain
  );
  const depth = new Map(chain.map((nid, i) => [nid, i]));
  const out = new Map();
  rows
    .sort((a, b) => depth.get(a.node_id) - depth.get(b.node_id))
    .forEach(r => out.set(r.attr_id, {
      id: r.attr_id,
      label: r.label,
      type: r.type,
      unit: r.unit,
      options: r.options_json ? JSON.parse(r.options_json) : null,
      site_filter: r.site_filter,
    }));
  return [...out.values()];
}

/** The hunt as the verdict reads it. Null when the campaign is no hunt. */
async function loadHunt(query, get, tree, campaignId) {
  const campaign = await get(
    'SELECT id, name, intent_json, frame_json FROM campaigns WHERE id = ?',
    [campaignId]
  );
  if (!campaign) return null;
  const targets = (await query(
    'SELECT node_id, typed, name, weight FROM hunt_targets WHERE campaign_id = ? ORDER BY position',
    [campaignId]
  )).filter(t => tree.byId.has(t.node_id));
  if (!targets.length) return null;
  const conditions = (await query(
    `SELECT id, node_id, attr_id, op, value_json, importance, label, weight
       FROM hunt_conditions WHERE campaign_id = ? ORDER BY id`,
    [campaignId]
  )).map(c => ({ ...c, value: c.value_json == null ? null : JSON.parse(c.value_json) }));
  let intent = {};
  let frame = {};
  try { intent = JSON.parse(campaign.intent_json || '{}') || {}; } catch { /* typed text only */ }
  try { frame = JSON.parse(campaign.frame_json || '{}') || {}; } catch { /* no frame */ }
  return {
    id: campaign.id,
    name: campaign.name,
    text: intent.text || '',
    frame,
    category_code: tree.byId.get(targets[0].node_id).category_code,
    targets: targets.map(t => {
      const node = tree.byId.get(t.node_id);
      return {
        node_id: t.node_id,
        typed: t.typed,
        weight: t.weight,
        name: t.name,
        key: node.key,
        kind: node.kind,
        status: node.status,
        years: node.years_from ? [node.years_from, node.years_to] : null,
      };
    }),
    conditions,
  };
}

/** The deepest node every one of `ids` lies below (or is); the same rule as
 * scraper/graph/hunts._common_ancestor. */
function commonNode(tree, ids) {
  const chains = ids.map(id => tree.ancestors(id).map(n => n.id));
  let common = null;
  for (let i = 0; chains.length && i < chains[0].length; i++) {
    if (!chains.every(c => c[i] === chains[0][i])) break;
    common = chains[0][i];
  }
  return common;
}

/** {listing_id: {node_id, method, facts}} for the given listings. */
async function loadReadings(query, listingIds) {
  const out = new Map();
  const ids = listingIds.map(String);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const marks = chunk.map(() => '?').join(',');
    for (const r of await query(
      `SELECT listing_id, node_id, method FROM listing_resolution WHERE listing_id IN (${marks})`,
      chunk
    )) {
      out.set(String(r.listing_id), { node_id: r.node_id, method: r.method, facts: {} });
    }
    for (const r of await query(
      `SELECT listing_id, attr_id, value_json FROM listing_facts WHERE listing_id IN (${marks})`,
      chunk
    )) {
      const reading = out.get(String(r.listing_id));
      if (reading) reading.facts[r.attr_id] = JSON.parse(r.value_json);
    }
  }
  return out;
}

module.exports = { loadTree, describe, effectiveAttributes, loadHunt, loadReadings, commonNode, SLACK_AFTER };
