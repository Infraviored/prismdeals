/**
 * Shared fit verdict ranking, ordering, and object transformation.
 *
 * Best verdict across multiple searches follows the domain rule:
 *   fit > unclear > no > unjudged (NULL)
 *
 * Tied verdicts resolve in favor of the newest first_seen_at.
 */

const { fitJoinOn } = require('./requirements_hash');

const BEST_FIT_ORDER_SQL = `
  CASE fit.verdict
    WHEN 'fit' THEN 1
    WHEN 'unclear' THEN 2
    WHEN 'no' THEN 3
    ELSE 4
  END ASC,
  lsh.first_seen_at DESC
`;

const FIT_FIRST_SQL =
  "CASE fit_verdict WHEN 'fit' THEN 0 WHEN 'unclear' THEN 1 WHEN 'no' THEN 2 ELSE 1 END ASC, ";

function fitOf(row) {
  if (!row.fit_verdict) return null;
  return {
    verdict: row.fit_verdict,
    reason: row.fit_reason,
    stage: row.fit_stage,
    facts: JSON.parse(row.fit_facts || '{}'),
  };
}

module.exports = {
  BEST_FIT_ORDER_SQL,
  FIT_FIRST_SQL,
  fitOf,
  fitJoinOn,
};
