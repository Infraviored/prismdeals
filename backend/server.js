const express = require('express');
const fs = require('fs');
const path = require('path');
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

// Recalculates scores for all listings under a profile
async function recalculateProfileScores(profileId, scoringModelStr) {
  let scoringModel;
  try {
    scoringModel = JSON.parse(scoringModelStr);
  } catch (e) {
    console.error('Invalid scoring model JSON:', e);
    return;
  }
  
  const baseScore = scoringModel.base_score !== undefined ? scoringModel.base_score : 50;
  const listings = await query('SELECT id, extracted_facts FROM listings WHERE profile_id = ?', [profileId]);
  
  for (const listing of listings) {
    let facts = {};
    try {
      facts = JSON.parse(listing.extracted_facts || '{}');
    } catch (e) {
      continue;
    }
    
    let score = baseScore;
    let isDealbreakerTriggered = false;
    
    if (scoringModel.rules) {
      for (const rule of scoringModel.rules) {
        const factValue = facts[rule.criterion_id];
        if (factValue === rule.value) {
          if (rule.is_dealbreaker) {
            isDealbreakerTriggered = true;
          }
          score += rule.weight;
        }
      }
    }
    
    let status = 'New';
    if (isDealbreakerTriggered) {
      score = -9999;
      status = 'Dealbreaker';
    }
    
    await run('UPDATE listings SET niceness_score = ?, status = ? WHERE id = ?', [score, status, listing.id]);
  }
}

// Helper to execute Python AI Worker tasks (like drafting)
function runPythonWorker(args) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [path.join(__dirname, '..', 'scraper', 'agent_worker.py'), ...args]);
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

// API: Get all listings
app.get('/api/listings', async (req, res) => {
  try {
    const { profile_id } = req.query;
    let rows;
    if (profile_id) {
      rows = await query(`
        SELECT l.*, p.domain as profile_domain 
        FROM listings l 
        LEFT JOIN profiles p ON l.profile_id = p.id 
        WHERE l.profile_id = ? 
        ORDER BY l.niceness_score DESC
      `, [profile_id]);
    } else {
      rows = await query(`
        SELECT l.*, p.domain as profile_domain 
        FROM listings l 
        LEFT JOIN profiles p ON l.profile_id = p.id 
        ORDER BY l.niceness_score DESC
      `);
    }
    
    // Parse JSON string fields back to objects
    const listings = rows.map(r => ({
      ...r,
      llm_processed: !!r.llm_processed,
      full_info_obtained: !!r.full_info_obtained,
      extracted_facts: JSON.parse(r.extracted_facts || '{}')
    }));
    
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to load listings data' });
  }
});

// API: Get search URLs
app.get('/api/search-urls', async (req, res) => {
  try {
    const rows = await query(`
      SELECT s.*, p.domain as profile_domain 
      FROM searches s 
      LEFT JOIN profiles p ON s.profile_id = p.id
    `);
    res.json(rows.map(r => ({ ...r, enabled: !!r.enabled })));
  } catch (error) {
    console.error('Error fetching search URLs:', error);
    res.status(500).json({ error: 'Failed to load search URLs' });
  }
});

// API: Update/save search URLs
app.post('/api/search-urls', async (req, res) => {
  try {
    const searchUrls = req.body; // Expects array of search url objects
    
    // Delete existing ones and re-insert to keep list in sync
    await run('DELETE FROM searches');
    
    const stmt = db.prepare(`
      INSERT INTO searches (url, name, enabled, profile_id)
      VALUES (?, ?, ?, ?)
    `);
    
    for (const item of searchUrls) {
      stmt.run(item.url, item.name || 'Search URL', item.enabled ? 1 : 0, item.profile_id || null);
    }
    stmt.finalize();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating search URLs:', error);
    res.status(500).json({ error: 'Failed to update search URLs' });
  }
});

// API: Get all Expert Profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM profiles');
    const profiles = rows.map(r => ({
      ...r,
      extraction_criteria: JSON.parse(r.extraction_criteria || '[]'),
      scoring_model: JSON.parse(r.scoring_model || '{}'),
      outreach_strategy: JSON.parse(r.outreach_strategy || '{}')
    }));
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// API: Ingest Researcher AI profile JSON
app.post('/api/profiles/ingest', async (req, res) => {
  try {
    const profile = req.body;
    if (!profile.product_domain || !profile.extraction_criteria || !profile.scoring_model) {
      return res.status(400).json({ error: 'Invalid profile format. Missing key fields.' });
    }
    
    const existing = await get('SELECT id FROM profiles WHERE domain = ?', [profile.product_domain]);
    
    let profileId;
    if (existing) {
      profileId = existing.id;
      await run(`
        UPDATE profiles 
        SET extraction_criteria = ?, scoring_model = ?, outreach_strategy = ? 
        WHERE id = ?
      `, [
        JSON.stringify(profile.extraction_criteria),
        JSON.stringify(profile.scoring_model),
        JSON.stringify(profile.outreach_strategy || {}),
        profileId
      ]);
    } else {
      const result = await run(`
        INSERT INTO profiles (domain, extraction_criteria, scoring_model, outreach_strategy)
        VALUES (?, ?, ?, ?)
      `, [
        profile.product_domain,
        JSON.stringify(profile.extraction_criteria),
        JSON.stringify(profile.scoring_model),
        JSON.stringify(profile.outreach_strategy || {})
      ]);
      profileId = result.id;
    }
    
    // Recalculate listing scores for the updated profile
    await recalculateProfileScores(profileId, JSON.stringify(profile.scoring_model));
    
    res.json({ success: true, profile_id: profileId });
  } catch (error) {
    console.error('Error ingesting profile:', error);
    res.status(500).json({ error: 'Failed to ingest profile' });
  }
});

// API: Save customized profile slider weights & recalculate
app.post('/api/profiles/recalculate', async (req, res) => {
  try {
    const { profile_id, scoring_model } = req.body;
    
    await run('UPDATE profiles SET scoring_model = ? WHERE id = ?', [
      JSON.stringify(scoring_model),
      profile_id
    ]);
    
    await recalculateProfileScores(profile_id, JSON.stringify(scoring_model));
    res.json({ success: true });
  } catch (error) {
    console.error('Error recalculating weights:', error);
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

// API: Trigger scraper execution
app.post('/api/scrape', (req, res) => {
  try {
    const { interval } = req.body;
    
    if (interval) {
      const configPath = path.join(__dirname, '..', 'data', 'schedule_config.json');
      fs.writeFileSync(configPath, JSON.stringify({ interval }, null, 2));
    }
    
    // Spawn scraper execution
    const python = spawn('python3', [path.join(__dirname, '..', 'scraper', 'main.py')]);
    
    python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
    python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
    
    python.on('close', (code) => {
      console.log(`Python scraper exited with code ${code}`);
      res.json({ success: true, message: 'Scraping completed' });
    });
    
  } catch (error) {
    console.error('Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scraping' });
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
  const python = spawn('python3', [path.join(__dirname, '..', 'scraper', 'main.py')]);
  python.stdout.on('data', (data) => console.log(`Python stdout: ${data}`));
  python.stderr.on('data', (data) => console.error(`Python stderr: ${data}`));
}

app.listen(port, () => {
  console.log(`Multi-Domain Scraper App listening at http://localhost:${port}`);
  setupScheduledScraping();
});