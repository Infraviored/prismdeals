const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'scraper.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE,
      extraction_criteria TEXT,
      scoring_model TEXT,
      outreach_strategy TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      name TEXT,
      enabled INTEGER DEFAULT 1,
      profile_id INTEGER REFERENCES profiles(id)
    )
  `);

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
      profile_id INTEGER REFERENCES profiles(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      listing_id TEXT REFERENCES listings(id),
      sender_name TEXT,
      sender_initials TEXT,
      is_outbound INTEGER,
      message_text TEXT,
      message_date TEXT
    )
  `);

  console.log('Database tables initialized.');

  // 2. Perform Migration
  migrateSearchUrls();
  migrateListings();
});

function migrateSearchUrls() {
  const searchUrlsPath = path.join(__dirname, '..', 'data', 'search_urls.json');
  if (!fs.existsSync(searchUrlsPath)) {
    // Insert default search url
    db.run(`
      INSERT OR IGNORE INTO searches (url, name, enabled)
      VALUES ('https://www.kleinanzeigen.de/s-notebooks/preis::1400/rtx4060/k0c278', 'RTX 4060 Laptops under 1400€', 1)
    `);
    return;
  }

  try {
    const searchUrls = JSON.parse(fs.readFileSync(searchUrlsPath, 'utf8'));
    console.log(`Migrating ${searchUrls.length} search URLs...`);
    
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO searches (url, name, enabled)
      VALUES (?, ?, ?)
    `);

    searchUrls.forEach(item => {
      stmt.run(item.url, item.name || 'Search URL', item.enabled ? 1 : 0);
    });
    stmt.finalize();
    console.log('Search URLs migrated.');
  } catch (error) {
    console.error('Error migrating search URLs:', error);
  }
}

function migrateListings() {
  const listingsPath = path.join(__dirname, '..', 'data', 'listings.json');
  if (!fs.existsSync(listingsPath)) {
    return;
  }

  try {
    const listings = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));
    console.log(`Migrating ${listings.length} listings...`);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO listings (
        id, title, price, location, url, short_description, detailed_description,
        llm_processed, llm_processed_time, full_info_obtained, extracted_facts,
        niceness_score, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    listings.forEach(item => {
      if (!item.id) return; // Skip invalid entries

      // Separate custom extracted fields into a single facts JSON object
      const customFacts = {
        RAM_more: item.RAM_more !== undefined ? item.RAM_more : 'unknown',
        screen_small: item.screen_small !== undefined ? item.screen_small : 'unknown',
        screen_highres: item.screen_highres !== undefined ? item.screen_highres : 'unknown'
      };

      // Laptop custom scoring
      let score = 50;
      if (item.RAM_more === true) score += 20;
      if (item.screen_small === true) score += 10;
      if (item.screen_highres === true) score += 20;

      stmt.run(
        item.id,
        item.title || '',
        item.price || '',
        item.location || '',
        item.url || '',
        item.short_description || '',
        item.detailed_description || '',
        item.llm_processed ? 1 : 0,
        item.llm_processed_time || null,
        item.full_info_obtained ? 1 : 0,
        JSON.stringify(customFacts),
        score,
        'New'
      );
    });
    stmt.finalize();
    console.log('Listings migrated successfully.');
  } catch (error) {
    console.error('Error migrating listings:', error);
  }
}

db.close();
