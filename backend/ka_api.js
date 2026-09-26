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

const express = require('express');
const ka = require('./ka_browser');

module.exports = () => {
  const router = express.Router();

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
