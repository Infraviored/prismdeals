/**
 * The Kleinanzeigen connection (ka_browser.js), behind the app's own login:
 *
 *   GET  /api/ka/status              {connected, since, login_open}
 *   POST /api/ka/login               opens the login page in the server's browser
 *   GET  /api/ka/login/frame?after=  the newest frame as JPEG, 204 when none is newer;
 *                                    X-Ka-State: open | connected | closed, X-Ka-Seq
 *   POST /api/ka/login/input         {type: click|text|key|scroll|back, ...}
 *   POST /api/ka/login/stop          closes it
 *   POST /api/ka/logout              forgets the session
 *
 * Input bodies carry what the buyer types, their password among it: they are
 * replayed and never logged.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const ka = require('./ka_browser');
const { graph } = require('./python');

const TONE = path.join(__dirname, '..', 'data', 'message_tone.txt');
// Set once from how the buyer writes; changed in Einstellungen.
const DEFAULT_TONE = `Locker und direkt, wie man auf Kleinanzeigen schreibt. Begrüßung "Servus", mit Vornamen, wenn ich ihn kenne. Ich duze, Händler sieze ich. Kurze Sätze, keine Floskeln. Wenn es passt, sage ich offen warum (Preisrahmen nach meiner Recherche, Käuferschutz, nur Versand). Höchstens drei Fragen. Schluss: "Liebe Grüße, Florian" oder "LG Florian".`;

function tone() {
  try {
    return fs.readFileSync(TONE, 'utf8');
  } catch {
    return DEFAULT_TONE;
  }
}

module.exports = (query, run) => {
  const router = express.Router();
  const messages = require('./ka_messages')(query, run);
  router.messages = messages;
  const fail = (res, error) => res.status(/angemeldet|Login/.test(error.message) ? 409 : 502).json({ error: error.message });

  router.get('/api/ka/tone', (req, res) => res.json({ tone: tone() }));
  router.put('/api/ka/tone', (req, res) => {
    const text = String(req.body?.tone || '').trim();
    if (!text) return res.status(400).json({ error: 'Leer' });
    fs.writeFileSync(TONE, text, { mode: 0o600 });
    res.json({ tone: text });
  });

  router.get('/api/ka/reminders', async (req, res) => res.json({ reminders: await messages.reminders() }));

  router.get('/api/ka/listings/:ad/conversation', async (req, res) => res.json(await messages.conversationFor(req.params.ad) || { id: null }));

  router.get('/api/ka/conversations/:cid', async (req, res) => {
    try {
      res.json(await messages.thread(req.params.cid));
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/api/ka/conversations/:cid/reply', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Leer' });
    try {
      await messages.reply(req.params.cid, text);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });

  // A suggested answer to the seller's last message.
  router.post('/api/ka/conversations/:cid/draft', async (req, res) => {
    try {
      const t = await messages.thread(req.params.cid);
      const listing = (await query('SELECT title, price, detailed_description FROM listings WHERE id = ?', [t.ad_id]))[0] || {};
      const context = {
        kind: 'reply',
        tone: tone(),
        title: listing.title || t.ad_title,
        price: listing.price || null,
        description: listing.detailed_description || null,
        seller: t.other_name,
        thread: t.messages.slice(-12),
      };
      const result = await graph(['message-draft'], JSON.stringify(context));
      res.status(result.status).json(result.body);
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/api/ka/listings/:ad/contact', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Leer' });
    try {
      res.json(await messages.contact(req.params.ad, text));
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/api/ka/status', (req, res) => res.json(ka.status()));

  router.post('/api/ka/login', async (req, res) => {
    try {
      res.json(await ka.startLogin());
    } catch (error) {
      console.error('Kleinanzeigen login could not open:', error.message);
      res.status(503).json({ error: 'Der Browser für Kleinanzeigen ließ sich nicht öffnen.' });
    }
  });

  router.get('/api/ka/login/frame', (req, res) => {
    const out = ka.frame(Number(req.query.after) || 0);
    res.set('Cache-Control', 'no-store');
    res.set('X-Ka-State', out.state);
    if (out.seq !== undefined) res.set('X-Ka-Seq', String(out.seq));
    if (!out.jpeg) return res.status(204).end();
    res.type('image/jpeg').send(out.jpeg);
  });

  router.post('/api/ka/login/input', async (req, res) => {
    try {
      res.json({ ok: await ka.input(req.body || {}) });
    } catch {
      res.status(500).json({ error: 'Eingabe nicht angekommen.' });
    }
  });

  router.post('/api/ka/login/stop', async (req, res) => {
    await ka.stop();
    res.json({ ok: true });
  });

  router.post('/api/ka/logout', async (req, res) => {
    await ka.logout();
    res.json({ ok: true });
  });

  return router;
};

module.exports.tone = tone;
