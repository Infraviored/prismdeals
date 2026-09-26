const express = require('express');

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file if it exists
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (error) {
  console.warn('Failed to load .env file:', error.message);
}

const app = express();
// Port and database are overridable so a throwaway instance can be started
// beside the real one — which is what makes it possible to look at the
// interface at all. Without it, every screen behind the login is unverifiable
// except by asking the owner to describe what they see.
const port = Number(process.env.PRISMDEALS_PORT) || 3030;
const { spawn } = require('child_process');
const places = require('./places');
const { findPython } = require('./python');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required in production!");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'prismdeals_dev_secret_key_12345';

// Database setup
const { defaultPath } = require('./db/path');
const dbPath = defaultPath();
const db = new sqlite3.Database(dbPath);
// WAL mode allows multiple concurrent readers/writers (parallel agent evals)
db.run('PRAGMA journal_mode=WAL;');
db.run('PRAGMA busy_timeout=5000;');
// SQLite ignores foreign keys unless asked, per connection. Without this the
// ON DELETE CASCADE declarations in the schema are decoration: deleting a
// campaign removed one row and left its searches, listings and messages behind
// as orphans that nothing could reach and nothing would clean up.
const { applySchema } = require('./db/schema');

// One schema, in db/schema.sql, applied by both runtimes. It used to live in
// five places, and the campaign dashboard returned 500 on every fresh install
// because this file queried route_searches while only Python created it.
applySchema(db)
  .then(() => {
    seedDefaultUser();
  })
  .catch(err => {
    console.error('Could not bring the database up to db/schema.sql:', err.message);
    process.exit(1);
  });

function seedDefaultUser() {
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (err) {
      console.error("Failed to query users count:", err);
      return;
    }
    if (row.count > 0) return;

    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@prismdeals.local';
    let defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (process.env.NODE_ENV === 'production' && !defaultPassword) {
      console.error("FATAL: DEFAULT_ADMIN_PASSWORD environment variable is required in production to seed the default admin user!");
      process.exit(1);
    }
    if (!defaultPassword) {
      defaultPassword = 'password';
    }

    bcrypt.hash(defaultPassword, 10, (err, hash) => {
      if (err) {
        console.error("Failed to hash default password:", err);
        return;
      }
      db.run(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
        [defaultEmail, hash, 'admin'],
        (err) => {
          if (err) console.error("Failed to seed default admin user:", err);
          else console.log(`Seeded default admin user: ${defaultEmail}`);
        }
      );
    });
  });

  backfillListingTimestamps();
  const { backfillCanonicalListings, backfillListingText, backfillSearchLastScraped } = require('./db/backfill');
  backfillCanonicalListings(db);
  backfillListingText(db);
  backfillSearchLastScraped(db);
}

/**
 * The two timestamp columns are added by db/schema.sql. Their *values* are not
 * something a schema file can supply: rows that predate the columns need one
 * derived from what the row already knows. Runs after the schema, and only ever
 * fills nulls, so it is safe on every startup.
 */
function backfillListingTimestamps() {
  db.run(
    `UPDATE listings
        SET last_description_changed_at =
              COALESCE(llm_processed_time, datetime('now', 'localtime'))
      WHERE last_description_changed_at IS NULL`,
    err => { if (err) console.error('Backfilling last_description_changed_at:', err); }
  );
  db.run(
    `UPDATE listings
        SET last_ai_evaluated_at = llm_processed_time
      WHERE last_ai_evaluated_at IS NULL
        AND llm_processed = 1
        AND llm_processed_time IS NOT NULL`,
    err => { if (err) console.error('Backfilling last_ai_evaluated_at:', err); }
  );
  // Places stored before the postal code had its own column ("81547 Au").
  db.run(
    `UPDATE listings SET postal_code = substr(location, 1, 5)
      WHERE postal_code IS NULL AND location GLOB '[0-9][0-9][0-9][0-9][0-9] *'`,
    err => { if (err) console.error('Backfilling postal_code:', err); }
  );
}

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const loginAttempts = new Map();
const loginRateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, []);
  }

  const attempts = loginAttempts.get(ip).filter(t => now - t < windowMs);
  attempts.push(now);
  loginAttempts.set(ip, attempts);

  if (attempts.length > maxAttempts) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  }
  next();
};

// Periodic memory cleanup for inactive rate limiter IP records to prevent leaks
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  for (const [ip, attempts] of loginAttempts.entries()) {
    const active = attempts.filter(t => now - t < windowMs);
    if (active.length === 0) {
      loginAttempts.delete(ip);
    } else {
      loginAttempts.set(ip, active);
    }
  }
}, 15 * 60 * 1000).unref();

const authenticateToken = async (req, res, next) => {
  let token = null;
  if (req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(/;\s*/).map(c => {
        const parts = c.split('=');
        return [parts[0].trim(), parts.slice(1).join('=')];
      })
    );
    token = cookies['__Host-token'] || cookies.token;
  }

  if (!token) {
    // Development only, and only from this machine: set by mistake on the
    // server it would have logged every visitor in as the first user.
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (process.env.PRISMDEALS_DEV_AUTH === '1' && process.env.NODE_ENV !== 'production' && local) {
      const user = await get("SELECT id, email, role FROM users LIMIT 1");
      if (user) {
        req.user = user;
        return next();
      }
    }
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get("SELECT id, email, role FROM users WHERE id = ?", [decoded.userId]);
    if (!user) {
      return res.status(401).json({ error: 'User session invalid or user deleted.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}
app.use(express.json());

// Auth: Login
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password must be strings.' });
    }

    const user = await get("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
    
    // Always run bcrypt.compare to prevent timing attacks (user enumeration)
    const passwordHash = user ? user.password_hash : "$2b$10$VEPtO9A6YfW7.g.7/S9a9y9a9y9a9y9a9y9a9y9a9y9a9y9a9y9a9";
    const isMatch = await bcrypt.compare(password, passwordHash);

    if (!user || !isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(isProd ? '__Host-token' : 'token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: {
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

// Auth: Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('__Host-token', { path: '/' });
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

// Auth: Me
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Global API Auth Protection (applied to all subsequent /api/* routes)
app.use('/api', authenticateToken);

// API: Get listings with optional filtering, sorting, pagination, and scoping.
//
// One query for all three scopes. It used to be three, and only the campaign
// one consulted limit, offset, sort and q -- so ?search_id=5&limit=20 returned
// every row of that search, ordered by score, and ?limit=20 with no scope
// returned the whole listings table. Worse, the response shape flipped between
// a bare array and {total, offset, limit, listings} depending on which branch
// answered, so a client could not tell what it was holding.

app.use(require('./location_resolver'));
app.use(require('./kept')(query, get, run));
app.use(require('./hunts_api')(query, get));

app.use(require('./compare_api')(query, get));
app.use(require('./knowledge_api')(query));
app.use(require('./ka_api')());


// API: Place suggestions for the route corridor's From/To fields.
app.get('/api/places/suggest', (req, res) => {
  const matches = places.suggest(req.query.q || '', 8);
  res.json({
    places: matches.map(({ label, name, qualifier, state, postal_code, lat, lon }) => ({
      label, name, qualifier, state, postal_code, lat, lon,
    })),
  });
});

/**
 * Runs scraper/main.py and collects everything it said.
 *
 * Three route endpoints had grown their own copy of this: the venv path, the
 * stdout/stderr accumulation, and a hand-rolled `replied` latch keeping the
 * 'error' and 'close' handlers from both answering the request. A promise
 * settles once, which is the invariant that latch was spelling out by hand.
 *
 * The 'error' handler matters more than it looks: an unhandled 'error' event on
 * a ChildProcess ends the Node process, so a missing venv would have taken the
 * whole API down rather than failing one request. Having it in one place means
 * the next endpoint cannot forget it.
 */
function runPlanner(args, res = null) {
  return new Promise((resolve, reject) => {
    const python = spawn(
      findPython(),
      [path.join(__dirname, '..', 'scraper', 'main.py'), ...args],
      { env: { ...process.env } }
    );

    // A preview the browser has already given up on still spends its OSRM and
    // Kleinanzeigen requests to the end. Dragging a slider abandons several in
    // a row, so they are stopped when the client that wanted them goes away.
    //
    // Watched on the *response*, not the request. Since Node 16 an
    // IncomingMessage emits 'close' once its body has been read, which for a
    // JSON POST is immediately — measured at 3 ms, killing the planner at 4 ms
    // with a null exit code. Whether that happens depends on the client:
    // undici triggers it, curl and a browser hold the connection open and do
    // not. A guard that works by luck of the client is not a guard.
    //
    // `res` emits 'close' when the connection ends either way, so
    // writableFinished is what tells an abandoned request from a served one.
    if (res) {
      res.on('close', () => {
        if (!res.writableFinished) python.kill();
      });
    }

    let stdout = '';
    let stderr = '';
    python.stdout.on('data', data => { stdout += data; });
    python.stderr.on('data', data => { stderr += data; });
    python.on('error', reject);
    python.on('close', code => resolve({ code, stdout, stderr }));
  });
}

/** The value the planner printed after `__NAME__:`, or null. */
function readMarker(stdout, name) {
  const found = stdout.match(new RegExp(`__${name}__:(.+)`));
  return found ? found[1].trim() : null;
}

// API: Diagnose listings counts for the same family terms across larger search radii.
//
// When a crawl returns zero listings in a small radius (e.g. 30 km in Landsberg),
// telling "0 listings found" is a dead end. This endpoint executes a rate-limited
// (>= 1.05s per request) probe across candidate radii (e.g. 30 km, 100 km, 200 km),
// providing genuine measured data so the user can make an informed radius decision.
app.post('/api/search-families/:id/diagnose-radius', async (req, res) => {
  try {
    const fam = await get('SELECT id, name, base_url FROM search_families WHERE id = ?', [req.params.id]);
    if (!fam) return res.status(404).json({ error: 'Search family not found' });

    const diagPath = path.join(__dirname, '..', 'data', `radius_diagnosis_${fam.id}.json`);
    const { refresh, radii } = req.body || {};

    if (!refresh && fs.existsSync(diagPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
        return res.json(cached);
      } catch (e) {}
    }

    const termsRows = await query(
      'SELECT id, term, label FROM search_family_terms WHERE family_id = ? AND enabled = 1 ORDER BY position, id',
      [fam.id]
    );
    if (!termsRows || termsRows.length === 0) {
      return res.status(400).json({ error: 'No active terms in search family to diagnose' });
    }

    const rMatch = fam.base_url.match(/r(\d+)$/);
    const currentRadius = rMatch ? parseInt(rMatch[1], 10) : 30;
    const testRadii = Array.isArray(radii) && radii.length > 0 ? radii : [currentRadius, 100, 200];
    const uniqueRadii = Array.from(new Set(testRadii)).map(Number).filter(r => r > 0).sort((a, b) => a - b);

    const payload = {
      base_url: fam.base_url,
      terms: termsRows.map(t => ({ id: t.id, term: t.term, label: t.label || t.term })),
      radii: uniqueRadii,
      current_radius: currentRadius
    };

    const pythonScript = `
import sys, os, time, json, requests
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'scraper'))})
import result_list, search_url

payload = json.loads(sys.argv[1])
base_url = payload['base_url']
terms = payload['terms']
radii = payload['radii']
current_radius = payload['current_radius']

parts = search_url.parse_tail(base_url)
if not parts or not parts.get('location'):
    print('__RADIUS_PROBE_ERROR__:Could not parse location from base URL')
    sys.exit(0)

location = parts['location']
# The scraper's own headers, not a fourth copy of them.
#
# This probe fires up to 39 requests from the same address, often seconds after
# the crawler's. Announcing a different browser than the crawler does is worse
# against a bot protection that already trips after a handful of fetches, not
# better -- and PROPOSALS F-3 already counts three copies of this string.
from scraper import HEADERS as headers

radius_totals = {r: 0 for r in radii}
term_details = []

for term_info in terms:
    t_term = term_info['term']
    t_label = term_info.get('label') or t_term
    term_counts = {}
    for r in radii:
        time.sleep(1.05)
        url = search_url.with_location(search_url.with_query(base_url, t_term), location, r)
        try:
            resp = requests.get(url, headers=headers, timeout=12)
            resp.encoding = 'utf-8'
            if result_list.is_empty_result_page(resp.text):
                cnt = 0
            else:
                tot = result_list.total_results(resp.text)
                cnt = tot if tot is not None else len(result_list.parse(resp.text))
        except Exception:
            cnt = 0
        term_counts[str(r)] = cnt
        radius_totals[r] += cnt
    term_details.append({
        'id': term_info.get('id'),
        'term': t_term,
        'label': t_label,
        'counts': term_counts
    })

options = [{'radius': r, 'count': radius_totals[r]} for r in radii]
result = {
    'current_radius': current_radius,
    'measured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'options': options,
    'terms': term_details
}
print('__RADIUS_PROBE__:' + json.dumps(result))
`;

    const pythonExecutable = findPython();
    const python = spawn(
      pythonExecutable,
      ['-c', pythonScript, JSON.stringify(payload)],
      {
        env: {
          ...process.env,
          PYTHONPATH: path.join(__dirname, '..', 'scraper')
        }
      }
    );

    if (res) {
      res.on('close', () => {
        if (!res.writableFinished) python.kill();
      });
    }

    let stdout = '';
    let stderr = '';
    python.stdout.on('data', data => { stdout += data; });
    python.stderr.on('data', data => { stderr += data; });

    python.on('close', (code) => {
      const errMarker = readMarker(stdout, 'RADIUS_PROBE_ERROR');
      if (errMarker) return res.status(400).json({ error: errMarker });

      const probeMarker = readMarker(stdout, 'RADIUS_PROBE');
      if (!probeMarker) {
        console.error('Radius probe failed:', stdout, stderr);
        return res.status(500).json({ error: 'Radius probe returned no results' });
      }

      try {
        const data = JSON.parse(probeMarker);
        try {
          const dir = path.dirname(diagPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(diagPath, JSON.stringify(data, null, 2));
        } catch (e) {}
        res.json(data);
      } catch (err) {
        console.error('Failed to parse radius probe output:', err);
        res.status(500).json({ error: 'Invalid radius probe output' });
      }
    });

  } catch (error) {
    console.error('Error in radius diagnosis:', error);
    res.status(500).json({ error: 'Failed to diagnose radius' });
  }
});

// API: Give a hunt a corridor after it was made, or take it away.
//
// The hunt keeps its terms, requirements and verdicts; only where it looks
// changes. The caller starts a crawl afterwards, which also works out the
// detours.
app.put('/api/search-families/:id/route', async (req, res) => {
  const { origin, destination, radius_km, corridor_km } = req.body || {};
  if (!origin || !destination) {
    return res.status(400).json({ error: 'Missing origin or destination' });
  }
  const args = ['--mode', 'family-route', '--family-id', String(req.params.id),
    '--from', String(origin), '--to', String(destination)];
  if (radius_km) args.push('--radius-km', String(radius_km));
  if (corridor_km) args.push('--corridor-km', String(corridor_km));
  try {
    // No `res`: a buyer who closes the tab must not stop a half-written change.
    const result = await runPlanner(args);
    const refused = readMarker(result.stdout, 'FAMILY_ROUTE_ERROR');
    if (refused) return res.status(400).json({ error: refused });
    const done = readMarker(result.stdout, 'FAMILY_ROUTE');
    if (!done) {
      console.error('Family route produced nothing:', result.stdout, result.stderr);
      const reason = (result.stderr.match(/ValueError: (.+)/) || [])[1];
      return res.status(500).json({ error: reason || 'Could not plan this corridor.' });
    }
    res.json(JSON.parse(done));
  } catch (error) {
    console.error('Could not set the family route:', error);
    res.status(500).json({ error: 'Could not plan this corridor.' });
  }
});

app.delete('/api/search-families/:id/route', async (req, res) => {
  try {
    const result = await runPlanner(
      ['--mode', 'family-route-clear', '--family-id', String(req.params.id)]
    );
    const refused = readMarker(result.stdout, 'FAMILY_ROUTE_ERROR');
    if (refused) return res.status(400).json({ error: refused });
    res.json({ success: true });
  } catch (error) {
    console.error('Could not clear the family route:', error);
    res.status(500).json({ error: 'Could not remove the corridor.' });
  }
});

// API: Get current schedule config
app.get('/api/schedule', (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    const defaultConfig = {
      interval: 0,
      fullFetchOnStartup: false,
      delayBetweenPages: 0.25,
      delayBetweenListings: 0.25
    };
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json({ ...defaultConfig, ...config });
  } catch (error) {
    console.error('Error reading schedule config:', error);
    res.status(500).json({ error: 'Failed to load schedule config' });
  }
});

// API: Save schedule config and dynamically update timers
app.post('/api/schedule', (req, res) => {
  try {
    const { interval, fullFetchOnStartup, delayBetweenPages, delayBetweenListings } = req.body;
    if (interval === undefined) {
      return res.status(400).json({ error: 'Missing interval field' });
    }

    const parsedInterval = parseInt(interval, 10);
    if (isNaN(parsedInterval) || parsedInterval < 0) {
      return res.status(400).json({ error: 'Interval must be a non-negative integer' });
    }
    
    let pagesDelay = parseFloat(delayBetweenPages !== undefined ? delayBetweenPages : 0.25);
    let listingsDelay = parseFloat(delayBetweenListings !== undefined ? delayBetweenListings : 0.25);
    if (isNaN(pagesDelay) || pagesDelay < 0) {
      pagesDelay = 0.25;
    }
    if (isNaN(listingsDelay) || listingsDelay < 0) {
      listingsDelay = 0.25;
    }
    
    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    const newConfig = {
      interval: parsedInterval,
      fullFetchOnStartup: !!fullFetchOnStartup,
      delayBetweenPages: pagesDelay,
      delayBetweenListings: listingsDelay
    };
    
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    
    // Apply changes dynamically
    setupScheduledScraping();
    
    res.json({ success: true, config: newConfig });
  } catch (error) {
    console.error('Error saving schedule config:', error);
    res.status(500).json({ error: 'Failed to save schedule config' });
  }
});

let activeScraperProcess = null;

// API: Check scraper execution status and progress
app.get('/api/scrape/status', (req, res) => {
  const progressFile = path.join(__dirname, '..', 'data', 'scraper_progress.json');
  let progress = { phase: 'idle', current: 0, total: 0, status: 'No active scraping session' };
  
  if (activeScraperProcess !== null) {
    if (fs.existsSync(progressFile)) {
      try {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      } catch (e) {
        progress = { phase: 'running', current: 0, total: 0, status: 'Active scraping session running...' };
      }
    } else {
      progress = { phase: 'running', current: 0, total: 0, status: 'Active scraping session running...' };
    }
  } else {
    if (fs.existsSync(progressFile)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        if (Date.now() / 1000 - fileData.timestamp > 600) {
          progress = { phase: 'idle', current: 0, total: 0, status: 'Scraper is idle' };
        } else {
          progress = fileData;
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  
  res.json({
    active: activeScraperProcess !== null,
    progress
  });
});

// API: Get recent scraper logs for live display
app.get('/api/logs', (req, res) => {
  const logFile = path.join(__dirname, '..', 'data', 'scraper.log');
  if (!fs.existsSync(logFile)) {
    return res.json({ logs: 'No logs available yet.' });
  }
  
  try {
    const logsContent = fs.readFileSync(logFile, 'utf8');
    const lines = logsContent.split('\n');
    const lastLines = lines.slice(-80).join('\n');
    res.json({ logs: lastLines });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// API: Trigger scraper execution (asynchronous data fetching)
app.post('/api/scrape', (req, res) => {
  try {
    if (activeScraperProcess !== null) {
      return res.status(400).json({ error: 'Scraper is already running' });
    }

    const { interval, campaignId } = req.body;

    // Not `if (interval)`: zero is falsy, and zero is the value that turns
    // scheduled scraping off. Written that way, the one request that asks for
    // the scraper to stop was the one request that did nothing — no config
    // written, timers left running.
    if (interval !== undefined && interval !== null && interval !== '') {
      const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
      let currentConfig = {};
      try {
        if (fs.existsSync(configPath)) {
          currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch (e) {}
      const updatedConfig = {
        ...currentConfig,
        interval: parseInt(interval, 10)
      };
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
      setupScheduledScraping();
    }
    
    // Clear old progress file
    const progressFile = path.join(__dirname, '..', 'data', 'scraper_progress.json');
    if (fs.existsSync(progressFile)) {
      try { fs.unlinkSync(progressFile); } catch (e) {}
    }
    
    // Crawl, then resolve and read what was found into the graph: a crawl
    // without it would show every new offer as "not read yet".
    const pythonExecutable = findPython();
    const args = [
      path.join(__dirname, '..', 'scraper', 'main.py'),
      '--mode', 'both'
    ];
    if (campaignId) {
      args.push('--campaign-id', String(campaignId));
    }
    const python = spawn(pythonExecutable, args, {
      env: { ...process.env }
    });
    
    activeScraperProcess = python;
    console.log('Background scraper spawned');
    
    python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
    python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
    
    python.on('close', (code) => {
      console.log(`Python scraper exited with code ${code}`);
      activeScraperProcess = null;
      // Fresh offers deserve a fresh comparison (about 0.004 USD a run).
      if (code === 0) afterCrawl(campaignId ? [Number(campaignId)] : null);
    });
    
    res.json({ success: true, message: 'Scraping started' });
    
  } catch (error) {
    console.error('Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scraping' });
  }
});

// API: Trigger deep description updates for all existing listings
app.post('/api/scrape/update-all', (req, res) => {
  try {
    if (activeScraperProcess !== null) {
      return res.status(400).json({ error: 'Scraper or update process is already running' });
    }
    
    const { campaignId } = req.body || {};
    
    // Clear old progress file
    const progressFile = path.join(__dirname, '..', 'data', 'scraper_progress.json');
    if (fs.existsSync(progressFile)) {
      try { fs.unlinkSync(progressFile); } catch (e) {}
    }
    
    // Spawn scraper execution in 'update-all' mode
    const pythonExecutable = findPython();
    const args = [
      path.join(__dirname, '..', 'scraper', 'main.py'),
      '--mode', 'update-all'
    ];
    if (campaignId) {
      args.push('--campaign-id', String(campaignId));
    }
    const python = spawn(pythonExecutable, args, {
      env: { ...process.env }
    });
    
    activeScraperProcess = python;
    console.log('Background deep update scraper spawned');
    
    python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
    python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
    
    python.on('close', (code) => {
      console.log(`Python scraper exited with code ${code}`);
      activeScraperProcess = null;
    });
    
    res.json({ success: true, message: 'Deep description update started' });
    
  } catch (error) {
    console.error('Error triggering deep update:', error);
    res.status(500).json({ error: 'Failed to trigger deep description update' });
  }
});

// Serve UI pages
app.get('/', (req, res) => {
  const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

let scheduledScrapeInterval = null;
let startupScrapeTimeout = null;

// Scheduled Scrape configuration helper
function setupScheduledScraping() {
  try {
    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    const defaultConfig = {
      interval: 0,
      fullFetchOnStartup: false
    };
    
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
    
    let config = defaultConfig;
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...defaultConfig, ...fileConfig };
    } catch (e) {
      console.error('Error parsing schedule config, overwriting with default:', e);
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }

    const rawInterval = config && config.interval !== undefined && config.interval !== null ? parseInt(config.interval, 10) : 0;
    const intervalMinutes = isNaN(rawInterval) || rawInterval <= 0 ? 0 : rawInterval;
    const fullFetchOnStartup = !!config.fullFetchOnStartup;
    
    // Clear any existing timers
    if (startupScrapeTimeout) {
      clearTimeout(startupScrapeTimeout);
      startupScrapeTimeout = null;
    }
    if (scheduledScrapeInterval) {
      clearInterval(scheduledScrapeInterval);
      scheduledScrapeInterval = null;
    }

    if (intervalMinutes === 0) {
      console.log('Scheduled scraping is off (interval is 0 or absent). Timers disarmed.');
      return;
    }

    console.log(`Scheduled scraping setup: every ${intervalMinutes} minutes.`);
    
    if (fullFetchOnStartup) {
      console.log('Immediate startup crawl scheduled in 10s');
      startupScrapeTimeout = setTimeout(() => {
        runScraper();
      }, 10000);
    } else {
      console.log('Skipping immediate startup crawl (fullFetchOnStartup is false)');
    }
    
    scheduledScrapeInterval = setInterval(() => {
      runScraper();
    }, intervalMinutes * 60 * 1000);
    
  } catch (error) {
    console.error('Error setting up scheduled scraping:', error);
  }
}

function runScraper() {
  console.log('Running scheduled scrape...');
  
  const pythonExecutable = findPython();
  const python = spawn(pythonExecutable, [
    path.join(__dirname, '..', 'scraper', 'main.py'),
    '--mode', 'both'
  ], {
    env: { ...process.env }
  });
  // An unhandled 'error' on a ChildProcess ends the Node process. This file
  // already says so at the route-planner spawn, in a comment written when it
  // was fixed there — and this is the one spawn that fires unattended, so a
  // missing venv during a deploy would take the API down every interval and
  // systemd would restart it straight back into the same failure.
  python.on('error', err => {
    console.error('Scheduled scrape could not start:', err.message);
  });
  python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
  python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
  // The schedule is the crawl that runs while nobody has the app open: its
  // finds must be judged and ranked by the time someone does.
  python.on('close', code => {
    if (code === 0) afterCrawl(null);
  });
}

/**
 * What follows every finished crawl: the crawl already resolved and read its
 * listings (main.py, graph processing), so verdicts are current on read. The
 * comparison ranks each hunt it touched anew.
 */
function afterCrawl(campaignIds) {
  const run = async () => {
    const ids = campaignIds || (await query('SELECT DISTINCT campaign_id AS id FROM hunt_targets')).map(r => Number(r.id));
    for (const id of ids) require('./compare_api').startCompare(id);
  };
  run().catch(error => console.error('After-crawl comparison failed:', error));
}

app.listen(port, () => {
  console.log(`Multi-Domain Scraper App listening at http://localhost:${port}`);
  setupScheduledScraping();
});