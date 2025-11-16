#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../app/lib/db/auth.sqlite');

const db = new Database(DB_PATH);

console.log('📊 Current tables in database:\n');

const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

tables.forEach(table => {
  console.log(`  - ${table.name}`);
});

console.log(`\n✅ Total: ${tables.length} tables`);

// Check for required tables
const required = ['rate_limits', 'request_fingerprints', 'cost_tracking'];
console.log('\n🔍 Checking required tables:');
required.forEach(table => {
  const exists = tables.some(t => t.name === table);
  console.log(`  ${exists ? '✅' : '❌'} ${table}`);
});

db.close();

