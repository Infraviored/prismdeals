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

const router = express.Router();

function userId(req) {
  // The auth middleware puts the row from `users` here, so the id is `id`.
  return req.user && req.user.id ? Number(req.user.id) : null;
}

module.exports = (query, get, run) => {
  router.get('/api/kept', async (req, res) => {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ error: 'Not signed in' });
    try {
      const rows = await query(
        `SELECT k.listing_id, k.kept_at, k.note
           FROM kept_listings k
          WHERE k.user_id = ?
          ORDER BY k.kept_at DESC`,
        [uid]
      );
      res.json({ kept: rows.map(r => ({ ...r, listing_id: String(r.listing_id) })) });
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
         ON CONFLICT(listing_id, user_id) DO UPDATE SET note = excluded.note`,
        [req.params.listingId, uid, req.body && req.body.note ? String(req.body.note) : null]
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
