const assert = require('assert');
const { requirementsHash, canonicalStringify, fitJoinOn } = require('./db/requirements_hash');

function run() {
  // Empty or invalid input handling
  assert.strictEqual(requirementsHash(null), null);
  assert.strictEqual(requirementsHash([]), null);
  assert.strictEqual(requirementsHash(undefined), null);

  // Parity with Python implementation
  const case1 = [{ id: 'ramGb', buyer_wants: { min: 16 } }];
  assert.strictEqual(requirementsHash(case1), '469b044de33efef1');

  const case2 = [
    { id: 'brand', buyer_wants: { match: 'Corsair' } },
    { id: 'ramGb', buyer_wants: { min: 32 } },
  ];
  assert.strictEqual(requirementsHash(case2), '6da917dca59e6498');

  // Key sorting and order invariance
  const case2Reordered = [
    { id: 'ramGb', buyer_wants: { min: 32 } },
    { id: 'brand', buyer_wants: { match: 'Corsair' } },
  ];
  assert.strictEqual(requirementsHash(case2Reordered), '6da917dca59e6498');

  // Ignores irrelevant fields (importance, label, etc.)
  const withExtra = [
    { id: 'ramGb', buyer_wants: { min: 16 }, importance: 'high', label: 'RAM' },
  ];
  assert.strictEqual(requirementsHash(withExtra), '469b044de33efef1');

  // fitJoinOn SQL clause generation
  const defaultSql = fitJoinOn('l.id', 'lsh.search_id');
  assert(defaultSql.includes('fit.listing_id = l.id'));
  assert(defaultSql.includes('fit.requirements_hash IS NOT NULL'));
  assert(defaultSql.includes('fit.requirements_hash = ('));
  assert(defaultSql.includes('WHERE s_rh.id = lsh.search_id'));
  assert(defaultSql.includes('fit.requirements_hash IS NULL AND fit.search_id = lsh.search_id'));

  const customAliasSql = fitJoinOn('listings.id', 'searches.id', 'lf');
  assert(customAliasSql.includes('lf.listing_id = listings.id'));
  assert(customAliasSql.includes('lf.requirements_hash IS NOT NULL'));

  console.log('requirements_hash: all assertions passed');
}

run();
