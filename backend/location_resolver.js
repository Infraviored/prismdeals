// Location resolver for Kleinanzeigen location IDs.
//
// Kleinanzeigen provides an open suggestions endpoint at
// https://www.kleinanzeigen.de/s-ort-empfehlungen.json?query=...
// which returns mappings like {"_0": "Deutschland", "_7091": "86899 Landsberg (Lech)"}.
//
// This module caches queries in memory and enforces a strict rate limit
// (at most one request per 1.05 seconds) via serialized promise queue.

const express = require('express');
const https = require('https');
const places = require('./places');

const router = express.Router();

const cache = new Map();
const MAX_CACHE_ENTRIES = 500;
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1050;

function setCached(key, val) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, val);
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Accept': 'application/json,text/javascript,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let fetchJsonImpl = function defaultFetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: BROWSER_HEADERS, timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Kleinanzeigen returned HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
};

let queuePromise = Promise.resolve();

function scheduleSerialized(fn) {
  const run = queuePromise.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestTime));
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastRequestTime = Date.now();
    return fn();
  });
  queuePromise = run.catch(() => {});
  return run;
}

async function queryOrtEmpfehlungen(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const cacheKey = q.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  return scheduleSerialized(async () => {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const url = `https://www.kleinanzeigen.de/s-ort-empfehlungen.json?query=${encodeURIComponent(q)}`;
    try {
      const data = await fetchJsonImpl(url);
      if (!data || typeof data !== 'object') {
        return null;
      }

      let resolved = null;
      for (const [key, label] of Object.entries(data)) {
        const id = key.replace(/^_/, '');
        if (id === '0' || !/^\d+$/.test(id)) continue;
        resolved = { location_id: id, label: String(label) };
        break;
      }

      if (resolved) {
        setCached(cacheKey, resolved);
      }
      return resolved;
    } catch (err) {
      console.error('Failed to query s-ort-empfehlungen.json:', err.message);
      return null;
    }
  });
}

router.get('/api/locations/resolve', async (req, res) => {
  const query = req.query.q || req.query.postal_code || '';
  const slug = req.query.slug || '';

  if (slug && !query) {
    const clean = slug.replace(/^s-/, '').replace(/-/g, ' ');
    const matches = places.suggest(clean, 3);
    if (matches && matches.length > 0) {
      const top = matches[0];
      const resolved = await queryOrtEmpfehlungen(top.postal_code || top.name);
      return res.json({
        place: top,
        location_id: resolved ? resolved.location_id : null,
        label: resolved ? resolved.label : top.label,
      });
    }
    return res.status(404).json({ error: `Location slug not found: ${slug}` });
  }

  if (!query) {
    return res.status(400).json({ error: 'Missing query or slug parameter' });
  }

  const resolved = await queryOrtEmpfehlungen(query);
  if (!resolved) {
    return res.status(404).json({ error: 'Location ID could not be resolved' });
  }

  res.json(resolved);
});

router._setFetchJsonForTest = (mockFn) => {
  fetchJsonImpl = mockFn;
};

module.exports = router;
