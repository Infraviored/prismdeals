/**
 * The buyer's own shortlist.
 *
 * Browsing a thousand laptops turns up three worth a second look, and until now
 * there was nowhere to put them: change a filter and the list reorders, and the
 * only way back to a listing was to find it again.
 *
 * Kept per user rather than as a flag on the listing, because two people
 * hunting the same corridor do not share a shortlist -- and because the
 * listings table belongs to the scraper, which rewrites rows it re-harvests.
 */

const express = require('express');
const { annotateDeals } = require('./db/reference_price');

const router = express.Router();

function userId(req) {
  // The auth middleware puts the row from `users` here, so the id is `id`.
  return req.user && req.user.id ? Number(req.user.id) : null;
}

module.exports = (query, get, run) => {
  // Two answers from one route. The ids alone are what a list of fifty rows
  // needs to draw its marks; the listings themselves are what the shortlist
  // screen needs, and asking for them always would make every results screen
  // fetch a second copy of data it already holds.
  router.get('/api/kept', async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not signed in' });
    const wantListings = req.query.listings === '1' || req.query.listings === 'true';
    try {
      if (!wantListings) {
        const rows = await query(
          `SELECT k.listing_id, k.kept_at, k.note
             FROM kept_listings k
            WHERE k.user_id = ?
            ORDER BY k.kept_at DESC`,
          [uid]
        );
        // Same shape either way. `total` appearing only when listings were
        // asked for made data.total undefined on the cheaper call.
        return res.json({
          total: rows.length,
          kept: rows.map(r => ({ ...r, listing_id: String(r.listing_id) })),
        });
      }

      const rows = await query(
        `SELECT l.*, s.name AS search_name, c.name AS campaign_name,
                k.kept_at, k.note,
                MAX(lsh.first_seen_at) AS first_seen_at
           FROM kept_listings k
           JOIN listings l ON l.id = k.listing_id
           LEFT JOIN searches s ON s.id = l.search_id
           LEFT JOIN campaigns c ON c.id = s.campaign_id
           LEFT JOIN listing_search_hits lsh ON lsh.listing_id = l.id AND lsh.search_id = l.search_id
          WHERE k.user_id = ?
          GROUP BY l.id
          ORDER BY k.kept_at DESC`,
        [uid]
      );

      const listings = rows.map(r => ({
        ...r,
        id: String(r.id),
        llm_processed: !!r.llm_processed,
        full_info_obtained: !!r.full_info_obtained,
        extracted_facts: JSON.parse(r.extracted_facts || '{}'),
        details: JSON.parse(r.details || '{}'),
        images: JSON.parse(r.images || '[]'),
        matched_terms: [],
      }));

      await annotateDeals(query, listings);
      res.json({ total: listings.length, kept: listings.map(l => ({ listing_id: l.id })), listings });
    } catch (error) {
      console.error('Error reading kept listings:', error);
      res.status(500).json({ error: 'Failed to read kept listings' });
    }
  });

  router.put('/api/kept/:listingId', async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not signed in' });
    try {
      // The listing has to exist. Keeping an id that names nothing would show
      // up later as an empty row nobody can explain.
      const listing = await get('SELECT id FROM listings WHERE id = ?', [req.params.listingId]);
      if (!listing) return res.status(404).json({ error: 'Unknown listing' });

      await run(
        `INSERT INTO kept_listings (listing_id, user_id, kept_at, note)
              VALUES (?, ?, datetime('now'), ?)
         -- A request that carries no note is not a request to erase one. The
         -- bookmark toggle sends an empty body, so re-keeping a find wiped
         -- "seller will go to 70, collect Saturday" without a word.
         ON CONFLICT(listing_id, user_id) DO UPDATE
                SET note = COALESCE(excluded.note, kept_listings.note)`,
        [
          req.params.listingId,
          uid,
          // An absent field leaves the note alone; an empty one clears it. The
          // two are different requests and must not arrive as the same NULL.
          req.body && Object.prototype.hasOwnProperty.call(req.body, 'note')
            ? String(req.body.note ?? '')
            : null,
        ]
      );
      res.json({ kept: true });
    } catch (error) {
      console.error('Error keeping listing:', error);
      res.status(500).json({ error: 'Failed to keep listing' });
    }
  });

  router.delete('/api/kept/:listingId', async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not signed in' });
    try {
      await run('DELETE FROM kept_listings WHERE listing_id = ? AND user_id = ?', [
        req.params.listingId,
        uid,
      ]);
      res.json({ kept: false });
    } catch (error) {
      console.error('Error releasing listing:', error);
      res.status(500).json({ error: 'Failed to release listing' });
    }
  });

  return router;
};
