import { getDB, closeDB } from '../app/lib/db/db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('Starting database migration...');
  
  const db = getDB();
  
  try {
    // Check if users table exists and has stripe_customer_id column
    try {
      const usersInfo = db.prepare("PRAGMA table_info(users)").all();
      const hasStripeColumn = usersInfo.some(col => col.name === 'stripe_customer_id');
      
      if (usersInfo.length > 0 && !hasStripeColumn) {
        console.log('Adding missing stripe_customer_id column to users table...');
        db.exec('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT');
      }
    } catch (error) {
      // Table doesn't exist yet, will be created
    }
    
    // Read schema file
    const schemaPath = path.join(__dirname, '../app/lib/db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        // Remove comments from statement
        const cleanStatement = statement
          .split('\n')
          .map(line => {
            const commentIndex = line.indexOf('--');
            return commentIndex >= 0 ? line.substring(0, commentIndex).trim() : line.trim();
          })
          .filter(line => line.length > 0)
          .join(' ');
        
        if (cleanStatement.length > 0) {
          db.exec(cleanStatement + ';');
          console.log('Executed:', cleanStatement.substring(0, 60) + '...');
        }
      } catch (error) {
        // Ignore "table already exists" and "index already exists" errors
        if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
          console.error('Error executing statement:', error.message);
          console.error('Statement:', statement.substring(0, 100));
          throw error;
        }
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    closeDB();
  }
}

migrate();

