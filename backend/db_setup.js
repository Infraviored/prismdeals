const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'scraper.db');

// Delete existing database file to ensure a clean schema transition
if (fs.existsSync(dbPath)) {
  console.log('Removing old database for schema transition...');
  fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Create Campaigns Table
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )
  `);

  // 2. Create Knowledge Sets Table
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      expert_knowledge TEXT,
      item_json TEXT
    )
  `);

  // 3. Create Searches (Items) Table
  db.run(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT,
      url TEXT UNIQUE,
      enabled INTEGER DEFAULT 1,
      knowledge_set_id INTEGER REFERENCES knowledge_sets(id) ON DELETE SET NULL
    )
  `);

  // 3. Create Listings Table
  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      title TEXT,
      price TEXT,
      location TEXT,
      url TEXT,
      short_description TEXT,
      detailed_description TEXT,
      llm_processed INTEGER DEFAULT 0,
      llm_processed_time TEXT,
      full_info_obtained INTEGER DEFAULT 0,
      extracted_facts TEXT,
      niceness_score INTEGER DEFAULT 50,
      status TEXT DEFAULT 'New',
      search_id INTEGER REFERENCES searches(id) ON DELETE CASCADE,
      details TEXT,
      images TEXT
    )
  `);

  // 4. Create Messages Table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
      sender_name TEXT,
      sender_initials TEXT,
      is_outbound INTEGER,
      message_text TEXT,
      message_date TEXT
    )
  `);

  console.log('Database schema successfully initialized under the Campaign-Item hierarchy.');
});

db.close();
