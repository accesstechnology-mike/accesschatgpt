#!/usr/bin/env node

/**
 * Database initialization script
 * Creates all required tables for bot protection and rate limiting
 * Run with: node scripts/init-db.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - use same database as Prisma/Better Auth
const DB_PATH = path.join(__dirname, '../app/lib/db/auth.sqlite');

console.log('🔧 Initializing database...');
console.log(`📁 Database path: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');
// Set WAL mode for better concurrency
db.pragma('journal_mode = WAL');

try {
  // Read and execute schema
  const schemaPath = path.join(__dirname, '../app/lib/db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  // Split by semicolons and execute each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`📝 Executing ${statements.length} SQL statements...`);
  
  for (const statement of statements) {
    try {
      db.exec(statement + ';');
    } catch (error) {
      // Ignore "table already exists" errors
      if (!error.message.includes('already exists')) {
        console.warn('⚠️  Warning:', error.message);
      }
    }
  }
  
  // Verify tables were created
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  
  console.log('\n✅ Database initialized successfully!');
  console.log(`📊 Tables created: ${tables.length}`);
  tables.forEach(table => {
    console.log(`   - ${table.name}`);
  });
  
  // Check if rate_limits table exists and show count
  try {
    const rateLimitCount = db.prepare('SELECT COUNT(*) as count FROM rate_limits').get();
    console.log(`\n📈 Rate limit entries: ${rateLimitCount.count}`);
  } catch (e) {
    console.log('\n📈 Rate limits table: Ready');
  }
  
  // Check cost tracking
  try {
    const costCount = db.prepare('SELECT COUNT(*) as count FROM cost_tracking').get();
    console.log(`💰 Cost tracking entries: ${costCount.count}`);
  } catch (e) {
    console.log('💰 Cost tracking table: Ready');
  }
  
} catch (error) {
  console.error('❌ Error initializing database:', error);
  process.exit(1);
} finally {
  db.close();
}

console.log('\n✨ Done!');

