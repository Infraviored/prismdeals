#!/usr/bin/env node
/**
 * Build a fixture database from db/schema.sql, then seed it with synthetic
 * data for UI screenshots: a user here, the hunt and its listings through the
 * graph (scripts/seed_fixture_graph.py).
 *
 * Usage:
 *   node scripts/seed_fixture_db.js <output-path>
 *
 * NEVER copies production data — everything is synthetic.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const backendModules = path.join(__dirname, '..', 'backend', 'node_modules');
const sqlite3 = require(path.join(backendModules, 'sqlite3')).verbose();
const bcrypt = require(path.join(backendModules, 'bcrypt'));
const { applySchema } = require(path.join(__dirname, '..', 'backend', 'db', 'schema'));

const outPath = process.argv[2];
if (!outPath) {
  console.error('Usage: node scripts/seed_fixture_db.js <output.db>');
  process.exit(1);
}

// Remove if exists to start clean
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

const db = new sqlite3.Database(outPath);

const EMAIL = 'ui-shots@localhost';
const PASSWORD = 'ui-shots-only';

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function main() {
  // The schema is db/schema.sql, applied the way the server applies it.
  await applySchema(db);
  const hash = await bcrypt.hash(PASSWORD, 10);
  await run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", [EMAIL, hash]);
  db.close();
  // The hunt and its listings go through the graph itself (Python, no model).
  execFileSync('python3', [path.join(__dirname, 'seed_fixture_graph.py'), outPath], { stdio: 'inherit' });
  console.log(`Fixture database seeded: ${outPath}`);
  console.log(`  User: ${EMAIL} / ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
