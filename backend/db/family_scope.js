/**
 * Which of a family's searches belong in view.
 *
 * A re-aimed family marks its old searches inactive (active = 0) and runs new
 * ones. Until the new search for a term has finished its first crawl, the old
 * one's listings and verdicts stay in view: saving a changed filter must never
 * look like "everything was deleted", which is what it looked like the first
 * time (Corsair, 2026-09-23). After that first crawl the old search drops out.
 *
 * Expects the family membership row aliased as `sfs`.
 */
const SFS_ACTIVE_OR_PENDING_SQL = `(
  sfs.active = 1
  OR (
    sfs.active = 0
    AND EXISTS (
      SELECT 1
        FROM search_family_searches sfs_act
        JOIN searches s_act ON s_act.id = sfs_act.search_id
       WHERE sfs_act.family_id = sfs.family_id
         AND sfs_act.term_id = sfs.term_id
         AND sfs_act.active = 1
         AND s_act.last_scraped_at IS NULL
    )
  )
)`;

module.exports = { SFS_ACTIVE_OR_PENDING_SQL };
