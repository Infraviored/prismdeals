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
const port = 3030;
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

// Database setup
const dbPath = path.join(__dirname, '..', 'data', 'scraper.db');
const db = new sqlite3.Database(dbPath);

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

// Recalculates scores for all listings under a search item (normalized weight schema)
async function recalculateItemScores(searchId, scoringModelStr) {
  let scoringModel;
  try {
    scoringModel = JSON.parse(scoringModelStr);
  } catch (e) {
    console.error('Invalid scoring model JSON:', e);
    return;
  }

  const weights = scoringModel.weights || {};
  const listings = await query('SELECT id, extracted_facts FROM listings WHERE search_id = ?', [searchId]);

  for (const listing of listings) {
    let envelope = {};
    try {
      envelope = JSON.parse(listing.extracted_facts || '{}');
    } catch (e) {
      continue;
    }

    // Support nested envelope from AI analysis
    const facts = (envelope && envelope.criteria) ? envelope.criteria : envelope;

    let score = 0;
    for (const [criterionId, cfg] of Object.entries(weights)) {
      const factValue = facts[criterionId];
      if (factValue === undefined || factValue === null || factValue === 'unknown') continue;
      if (factValue === cfg.satisfied_if) {
        score += cfg.importance;
      }
    }

    score = Math.max(0, Math.min(100, score));
    await run('UPDATE listings SET niceness_score = ?, status = ? WHERE id = ?', [score, 'New', listing.id]);
  }
}

// Helper to execute Python AI Worker tasks (like drafting)
function runPythonWorker(args) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    const python = spawn(pythonExecutable, [path.join(__dirname, '..', 'scraper', 'agent_worker.py'), ...args]);
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => stdout += data);
    python.stderr.on('data', (data) => stderr += data);
    
    python.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Python worker exited with code ${code}`));
      }
    });
  });
}

const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}
app.use(express.json());

// API: Serve the external research agent prompt template
app.get('/api/external-prompt', (req, res) => {
  try {
    const promptPath = path.join(__dirname, '..', 'prompts', 'external_prompt.md');
    const content = fs.readFileSync(promptPath, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(500).json({ error: 'external_prompt.md not found' });
  }
});

// API: Get all listings
app.get('/api/listings', async (req, res) => {
  try {
    const { campaign_id, search_id } = req.query;
    let rows;
    if (search_id) {
      rows = await query(`
        SELECT l.*, s.name as item_name, c.name as campaign_name 
        FROM listings l 
        LEFT JOIN searches s ON l.search_id = s.id 
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        WHERE l.search_id = ? 
        ORDER BY l.niceness_score DESC
      `, [search_id]);
    } else if (campaign_id) {
      rows = await query(`
        SELECT l.*, s.name as item_name, c.name as campaign_name 
        FROM listings l 
        LEFT JOIN searches s ON l.search_id = s.id 
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        WHERE s.campaign_id = ? 
        ORDER BY l.niceness_score DESC
      `, [campaign_id]);
    } else {
      rows = await query(`
        SELECT l.*, s.name as item_name, c.name as campaign_name 
        FROM listings l 
        LEFT JOIN searches s ON l.search_id = s.id 
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        ORDER BY l.niceness_score DESC
      `);
    }
    
    // Parse JSON string fields back to objects
    const listings = rows.map(r => ({
      ...r,
      llm_processed: !!r.llm_processed,
      full_info_obtained: !!r.full_info_obtained,
      extracted_facts: JSON.parse(r.extracted_facts || '{}'),
      details: JSON.parse(r.details || '{}'),
      images: JSON.parse(r.images || '[]')
    }));
    
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to load listings data' });
  }
});

// API: Get campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM campaigns');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// API: Create/Update campaign
app.post('/api/campaigns', async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing campaign name' });
    }
    let campaignId = id;
    if (campaignId) {
      await run('UPDATE campaigns SET name = ? WHERE id = ?', [name, campaignId]);
    } else {
      const result = await run('INSERT INTO campaigns (name) VALUES (?)', [name]);
      campaignId = result.id;
    }
    res.json({ success: true, id: campaignId });
  } catch (error) {
    console.error('Error saving campaign:', error);
    res.status(500).json({ error: 'Failed to save campaign' });
  }
});

// API: Get search items
app.get('/api/search-urls', async (req, res) => {
  try {
    const rows = await query(`
      SELECT s.*, c.name as campaign_name, k.expert_knowledge, k.item_json 
      FROM searches s 
      LEFT JOIN campaigns c ON s.campaign_id = c.id
      LEFT JOIN knowledge_sets k ON s.knowledge_set_id = k.id
    `);
    res.json(rows.map(r => ({ 
      ...r, 
      enabled: !!r.enabled,
      item_json: JSON.parse(r.item_json || '{}')
    })));
  } catch (error) {
    console.error('Error fetching searches:', error);
    res.status(500).json({ error: 'Failed to load searches' });
  }
});

// API: Create / update single search item
app.post('/api/searches', async (req, res) => {
  try {
    const { id, campaign_id, name, url, knowledge_set_id } = req.body;
    if (!campaign_id || !name || !url) {
      return res.status(400).json({ error: 'Missing campaign_id, name, or url' });
    }
    let searchId = id;
    const ksId = knowledge_set_id || null;
    if (searchId) {
      await run('UPDATE searches SET campaign_id = ?, name = ?, url = ?, knowledge_set_id = ? WHERE id = ?', [
        campaign_id, name, url, ksId, searchId
      ]);
    } else {
      const result = await run('INSERT INTO searches (campaign_id, name, url, knowledge_set_id) VALUES (?, ?, ?, ?)', [
        campaign_id, name, url, ksId
      ]);
      searchId = result.id;
    }
    res.json({ success: true, id: searchId });
  } catch (error) {
    console.error('Error saving search item:', error);
    res.status(500).json({ error: 'Failed to save search item' });
  }
});

// API: Delete search item
app.delete('/api/searches/:id', async (req, res) => {
  try {
    await run('DELETE FROM searches WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting search:', error);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// API: Get all reusable knowledge sets
app.get('/api/knowledge-sets', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM knowledge_sets ORDER BY name ASC');
    res.json(rows.map(r => ({
      ...r,
      item_json: JSON.parse(r.item_json || '{}')
    })));
  } catch (error) {
    console.error('Error fetching knowledge sets:', error);
    res.status(500).json({ error: 'Failed to load knowledge sets' });
  }
});

// API: Create / update a knowledge set
app.post('/api/knowledge-sets', async (req, res) => {
  try {
    const { id, name, expert_knowledge, item_json } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing knowledge set name' });
    }

    // Enforce boolean-only planner schema
    if (item_json) {
      const criteria = item_json.extraction_criteria || [];
      const weights = item_json.scoring_model?.weights || {};

      for (const c of criteria) {
        if (c.type !== 'boolean') {
          return res.status(400).json({ 
            error: `Legacy mixed-type criteria detected: Criterion '${c.id}' has type '${c.type}'. Only 'boolean' type is supported. Please recreate or update this profile.` 
          });
        }
      }

      for (const [cid, w] of Object.entries(weights)) {
        if (w && typeof w.satisfied_if !== 'boolean') {
          return res.status(400).json({
            error: `Legacy mixed-type criteria weights detected: Weight '${cid}' has satisfied_if value '${w.satisfied_if}' which is not a boolean. Only boolean expectations are supported.`
          });
        }
      }
    }

    let ksId = id;
    const jsonStr = JSON.stringify(item_json || {});
    const expertStr = expert_knowledge || '';
    if (ksId) {
      await run('UPDATE knowledge_sets SET name = ?, expert_knowledge = ?, item_json = ? WHERE id = ?', [
        name, expertStr, jsonStr, ksId
      ]);
    } else {
      const result = await run('INSERT INTO knowledge_sets (name, expert_knowledge, item_json) VALUES (?, ?, ?)', [
        name, expertStr, jsonStr
      ]);
      ksId = result.id;
    }
    res.json({ success: true, id: ksId });
  } catch (error) {
    console.error('Error saving knowledge set:', error);
    res.status(500).json({ error: 'Failed to save knowledge set' });
  }
});

// API: Delete a knowledge set
app.delete('/api/knowledge-sets/:id', async (req, res) => {
  try {
    await run('DELETE FROM knowledge_sets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting knowledge set:', error);
    res.status(500).json({ error: 'Failed to delete knowledge set' });
  }
});

// API: Live target URL preview count checking
app.post('/api/searches/preview', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing target URL' });
  }

  const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
  const scriptPath = path.join(__dirname, '..', 'scraper', 'main.py');
  
  const python = spawn(pythonExecutable, [scriptPath, '--mode', 'preview', '--urls', url]);
  
  let stdout = '';
  let stderr = '';
  
  python.stdout.on('data', (data) => stdout += data);
  python.stderr.on('data', (data) => stderr += data);
  
  python.on('close', (code) => {
    if (code === 0) {
      const match = stdout.match(/__PREVIEW_COUNT__:(\d+)/);
      if (match) {
        return res.json({ count: parseInt(match[1], 10) });
      }
      const errMatch = stdout.match(/__PREVIEW_ERROR__:(.+)/);
      return res.status(400).json({ error: errMatch ? errMatch[1] : 'Could not parse listing count from page.' });
    } else {
      console.error('Preview error:', stderr || stdout);
      return res.status(500).json({ error: 'Headless browser check failed.' });
    }
  });
});

// API: Recalculate search scores based on updated item JSON scoring weights
app.post('/api/searches/recalculate', async (req, res) => {
  try {
    const { search_id, item_json } = req.body;
    
    await run('UPDATE searches SET item_json = ? WHERE id = ?', [
      JSON.stringify(item_json),
      search_id
    ]);
    
    const scoringModel = item_json.scoring_model || {};
    await recalculateItemScores(search_id, JSON.stringify(scoringModel));
    res.json({ success: true });
  } catch (error) {
    console.error('Error recalculating search item scores:', error);
    res.status(500).json({ error: 'Failed to update and recalculate scores' });
  }
});

// API: Chrome Extension Chat & Conversation Sync
app.post('/api/chats/sync', async (req, res) => {
  try {
    const { listing_id, messages } = req.body;
    if (!listing_id || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    // Ensure listing exists in database. If not, maybe create a placeholder
    const listing = await get('SELECT id FROM listings WHERE id = ?', [listing_id]);
    if (!listing) {
      await run(`
        INSERT INTO listings (id, title, status)
        VALUES (?, ?, 'Contacted')
      `, [listing_id, `Listing ID: ${listing_id}`]);
    }
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO messages (id, listing_id, sender_name, sender_initials, is_outbound, message_text, message_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const msg of messages) {
      stmt.run(
        msg.id,
        listing_id,
        msg.sender_name || null,
        msg.sender_initials || null,
        msg.is_outbound ? 1 : 0,
        msg.message_text || '',
        msg.message_date || null
      );
    }
    stmt.finalize();
    
    // Set status to "Negotiating" if chat sync happened
    await run("UPDATE listings SET status = 'Negotiating' WHERE id = ? AND (status = 'New' OR status = 'Contacted')", [listing_id]);
    
    // Run AI analysis on conversation to resolve unknowns
    try {
      await runPythonWorker(['analyze', listing_id]);
      console.log(`Analyzed conversation for listing ${listing_id}`);
    } catch (e) {
      console.error(`Conversation analysis error for listing ${listing_id}:`, e);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error syncing chats:', error);
    res.status(500).json({ error: 'Failed to sync chats' });
  }
});

// API: Retrieve messages for a listing
app.get('/api/chats/:listing_id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM messages WHERE listing_id = ? ORDER BY message_date ASC', [req.params.listing_id]);
    res.json(rows.map(r => ({ ...r, is_outbound: !!r.is_outbound })));
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// API: Generate AI Outreach Draft Reply for a Listing
app.post('/api/listings/draft', async (req, res) => {
  try {
    const { listing_id } = req.body;
    
    // Fetch listing & profile data
    const listing = await get('SELECT * FROM listings WHERE id = ?', [listing_id]);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    
    if (!listing.profile_id) {
      return res.status(400).json({ error: 'No profile associated with this listing' });
    }
    
    const profile = await get('SELECT * FROM profiles WHERE id = ?', [listing.profile_id]);
    
    // Spawn Python AI Worker to generate the tailored draft outreach
    const result = await runPythonWorker(['draft', listing_id]);
    
    res.json({ draft: result });
  } catch (error) {
    console.error('Error drafting outreach:', error);
    res.status(500).json({ error: error.message || 'Failed to generate draft outreach' });
  }
});

// API: Get current schedule config
app.get('/api/schedule', (req, res) => {
  try {
    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({ interval: 60 }, null, 2));
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json(config);
  } catch (error) {
    console.error('Error reading schedule config:', error);
    res.status(500).json({ error: 'Failed to load schedule config' });
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

    const { interval } = req.body;
    
    if (interval) {
      const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
      fs.writeFileSync(configPath, JSON.stringify({ interval }, null, 2));
    }
    
    // Clear old progress file
    const progressFile = path.join(__dirname, '..', 'data', 'scraper_progress.json');
    if (fs.existsSync(progressFile)) {
      try { fs.unlinkSync(progressFile); } catch (e) {}
    }
    
    // Spawn scraper execution in 'scrape' mode
    const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    const python = spawn(pythonExecutable, [
      path.join(__dirname, '..', 'scraper', 'main.py'),
      '--mode', 'scrape'
    ], {
      env: { ...process.env }
    });
    
    activeScraperProcess = python;
    console.log('Background scraper spawned');
    
    python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
    python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
    
    python.on('close', (code) => {
      console.log(`Python scraper exited with code ${code}`);
      activeScraperProcess = null;
    });
    
    res.json({ success: true, message: 'Scraping started' });
    
  } catch (error) {
    console.error('Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scraping' });
  }
});

// API: Trigger AI matching & scoring interpretation
app.post('/api/process', (req, res) => {
  try {
    const { listing_id } = req.body || {};
    const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    
    const args = [
      path.join(__dirname, '..', 'scraper', 'main.py'),
      '--mode', 'process'
    ];
    
    if (listing_id) {
      args.push('--listing-id', String(listing_id));
    }
    
    const python = spawn(pythonExecutable, args, {
      env: { ...process.env }
    });
    
    python.stdout.on('data', (data) => console.log(`AI worker stdout: ${data}`));
    python.stderr.on('data', (data) => console.error(`AI worker stderr: ${data}`));
    
    python.on('close', (code) => {
      console.log(`AI worker exited with code ${code}`);
      res.json({ success: code === 0, message: 'AI processing completed' });
    });
    
  } catch (error) {
    console.error('Error triggering AI process:', error);
    res.status(500).json({ error: 'Failed to trigger AI matching' });
  }
});

// API: Get current login session status
app.get('/api/session-status', (req, res) => {
  try {
    const statusPath = path.join(__dirname, '..', 'data', 'session_status.json');
    if (fs.existsSync(statusPath)) {
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      return res.json(data);
    }
    res.json({ email: null });
  } catch (error) {
    console.error('Error fetching session status:', error);
    res.status(500).json({ error: 'Failed to read session status' });
  }
});

// API: Trigger interactive manual login session
app.post('/api/login-session', (req, res) => {
  try {
    const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    const python = spawn(pythonExecutable, [
      path.join(__dirname, '..', 'scraper', 'main.py'),
      '--mode', 'scrape',
      '--urls', 'https://www.kleinanzeigen.de/m-meine-anzeigen.html?tab=PROJECTS'
    ], {
      env: {
        ...process.env,
        INTERACTIVE_LOGIN: "1"
      }
    });

    python.stdout.on('data', (data) => console.log(`Login process: ${data}`));
    python.stderr.on('data', (data) => console.error(`Login error: ${data}`));

    python.on('close', (code) => {
      console.log(`Interactive login process exited with code ${code}`);
      res.json({ success: code === 0 });
    });
  } catch (error) {
    console.error('Error launching login session:', error);
    res.status(500).json({ error: 'Failed to trigger login process' });
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

// Scheduled Scrape configuration helper
function setupScheduledScraping() {
  try {
    const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify({ interval: 60 }, null, 2));
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const intervalMinutes = config.interval || 60;
    
    console.log(`Scheduled scraping set every ${intervalMinutes} minutes`);
    
    setTimeout(() => {
      runScraper();
      setInterval(runScraper, intervalMinutes * 60 * 1000);
    }, 10000);
  } catch (error) {
    console.error('Error setting up scheduled scraping:', error);
  }
}

function runScraper() {
  console.log('Running scheduled scrape...');
  const pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python3');
  const python = spawn(pythonExecutable, [
    path.join(__dirname, '..', 'scraper', 'main.py')
  ], {
    env: { ...process.env }
  });
  python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
  python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
}

app.listen(port, () => {
  console.log(`Multi-Domain Scraper App listening at http://localhost:${port}`);
  setupScheduledScraping();
});