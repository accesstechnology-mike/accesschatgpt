#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../app/lib/db/auth.sqlite');

console.log('🔧 Creating missing tables...\n');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const statements = [
  `CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    reset_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(identifier, endpoint)
  )`,
  
  `CREATE TABLE IF NOT EXISTS request_fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    session_id TEXT,
    user_agent TEXT,
    accept_language TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    request_count INTEGER DEFAULT 1,
    UNIQUE(fingerprint)
  )`,
  
  `CREATE TABLE IF NOT EXISTS cost_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_cost REAL DEFAULT 0.0,
    request_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(date)
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, endpoint)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at)`,
  `CREATE INDEX IF NOT EXISTS idx_fingerprints_fingerprint ON request_fingerprints(fingerprint)`,
  `CREATE INDEX IF NOT EXISTS idx_fingerprints_ip ON request_fingerprints(ip_address)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_tracking_date ON cost_tracking(date)`,
];

for (const statement of statements) {
  try {
    db.exec(statement);
    console.log(`✅ Executed: ${statement.substring(0, 50)}...`);
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`⏭️  Skipped (already exists)`);
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

console.log('\n✅ Done! Verifying...\n');

const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name IN ('rate_limits', 'request_fingerprints', 'cost_tracking')
`).all();

tables.forEach(table => {
  console.log(`  ✅ ${table.name}`);
});

db.close();

