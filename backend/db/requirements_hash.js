/**
 * Stable hash of normalised requirement fields.
 *
 * Must produce the same output as scraper/requirements_hash.py for identical
 * input so that verdicts written by Python and looked up by JS agree.
 *
 * The canonical form: [{id, buyer_wants}] sorted by id, JSON-serialised with
 * sorted keys and compact separators, SHA-256, first 16 hex characters.
 */

const crypto = require('crypto');

/**
 * Deterministic JSON serialisation with sorted keys at every level and
 * compact separators (no spaces).  Mirrors Python's
 * json.dumps(sort_keys=True, separators=(",", ":")).
 */
function canonicalStringify(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return JSON.stringify(val);
  if (typeof val === 'string') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(val).sort(); // code-point order, like sort_keys=True
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(val[k])).join(',') + '}';
}

/**
 * SHA-256 prefix of the canonical buyer requirements.
 *
 * @param {Array|null} fields - The fields array from knowledge_sets.item_json
 * @returns {string|null} 16-char hex hash, or null when there are no requirements
 */
function requirementsHash(fields) {
  if (!fields || !Array.isArray(fields) || fields.length === 0) return null;
  const canonical = fields
    .map(f => ({ id: f.id || '', buyer_wants: f.buyer_wants || {} }))
    // Code-point order, as Python's sorted(); localeCompare puts 'Zustand' after 'akku'.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const blob = canonicalStringify(canonical);
  return crypto.createHash('sha256').update(blob).digest('hex').slice(0, 16);
}

/**
 * SQL JOIN condition that resolves a verdict by requirements hash (P9),
 * falling back to search_id for rows written before the backfill.
 *
 * @param {string} listingCol  - e.g. 'l.id' or 'lsh.listing_id'
 * @param {string} searchIdCol - e.g. 'lsh.search_id' or 'sfs.search_id'
 * @param {string} [alias]     - table alias, defaults to 'fit'
 * @returns {string} SQL ON clause for LEFT JOIN listing_fit <alias>
 */
function fitJoinOn(listingCol, searchIdCol, alias) {
  const a = alias || 'fit';
  const one = `${a}_one`;
  const matches = (f) => `${f}.listing_id = ${listingCol} AND (
    (${f}.requirements_hash IS NOT NULL AND ${f}.requirements_hash = (
      SELECT ks_rh.requirements_hash FROM searches s_rh
      JOIN knowledge_sets ks_rh ON ks_rh.id = s_rh.knowledge_set_id
      WHERE s_rh.id = ${searchIdCol}
    ))
    OR (${f}.requirements_hash IS NULL AND ${f}.search_id = ${searchIdCol})
  )`;
  // Exactly one verdict per (listing, search). Every search that shares the
  // requirements left its own row under the same hash, and joining them all
  // multiplied the listing: a median over 70 rows for 49 listings.
  // (SQLite allows the outer columns in WHERE here, not in ORDER BY.)
  return `${matches(a)} AND ${a}.rowid = COALESCE(
    (SELECT ${one}.rowid FROM listing_fit ${one}
      WHERE ${matches(one)} AND ${one}.search_id = ${searchIdCol} LIMIT 1),
    (SELECT MAX(${one}.rowid) FROM listing_fit ${one} WHERE ${matches(one)})
  )`;
}

module.exports = { requirementsHash, canonicalStringify, fitJoinOn };
