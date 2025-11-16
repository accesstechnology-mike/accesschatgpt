/**
 * Database initialization module
 * 
 * NOTE: With Prisma, table creation is handled by migrations.
 * This function is kept for backwards compatibility but does nothing.
 * Tables are created via: pnpm prisma db push (dev) or prisma migrate deploy (prod)
 */

let initialized = false;

/**
 * Initialize database schema
 * 
 * With Prisma + Postgres, this is handled by migrations.
 * This function is a no-op for backwards compatibility.
 */
export function initDatabase() {
  if (initialized) {
    return;
  }

  // Prisma handles schema management via migrations
  // No manual initialization needed
  initialized = true;
}

// Auto-initialize on import (but only once)
if (typeof window === 'undefined') {
  // Only run on server-side
  initDatabase();
}

