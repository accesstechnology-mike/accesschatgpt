/**
 * Database abstraction layer using Prisma
 * Maintains same API as SQLite version for easy migration
 * Works with both SQLite (dev) and Postgres (production)
 */

import { PrismaClient } from '@prisma/client';

// Singleton Prisma instance
let prisma = null;

/**
 * Get Prisma client instance (singleton)
 * @returns {PrismaClient} Prisma client
 */
function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Get database instance (for compatibility - returns Prisma)
 * @returns {PrismaClient} Prisma client
 */
export function getDB() {
  return getPrisma();
}

/**
 * Close database connection
 */
export function closeDB() {
  if (prisma) {
    prisma.$disconnect();
    prisma = null;
  }
}

/**
 * Execute a query (for compatibility - uses Prisma)
 * Note: This is a simplified wrapper. For complex queries, use Prisma directly.
 * @param {string} sql - SQL query (Postgres-compatible)
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result object
 */
export async function query(sql, params = []) {
  const p = getPrisma();
  // Use Prisma's $executeRaw for raw SQL
  try {
    // Convert SQLite-style ? placeholders to Postgres $1, $2, etc.
    let postgresSql = sql;
    const postgresParams = [];
    
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      postgresSql = postgresSql.replace('?', placeholder);
      postgresParams.push(param);
    });
    
    const result = await p.$executeRawUnsafe(postgresSql, ...postgresParams);
    return { changes: result, lastInsertRowid: null };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Get a single row (for compatibility)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Row object or null
 */
export async function get(sql, params = []) {
  const p = getPrisma();
  try {
    // Convert SQLite-style ? placeholders to Postgres $1, $2, etc.
    let postgresSql = sql;
    const postgresParams = [];
    
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      postgresSql = postgresSql.replace('?', placeholder);
      postgresParams.push(param);
    });
    
    const result = await p.$queryRawUnsafe(postgresSql, ...postgresParams);
    return Array.isArray(result) && result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Database get error:', error);
    throw error;
  }
}

/**
 * Get multiple rows (for compatibility)
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of row objects
 */
export async function all(sql, params = []) {
  const p = getPrisma();
  try {
    // Convert SQLite-style ? placeholders to Postgres $1, $2, etc.
    let postgresSql = sql;
    const postgresParams = [];
    
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      postgresSql = postgresSql.replace('?', placeholder);
      postgresParams.push(param);
    });
    
    const result = await p.$queryRawUnsafe(postgresSql, ...postgresParams);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Database all error:', error);
    throw error;
  }
}

/**
 * Execute a transaction (for compatibility)
 * @param {Function} callback - Transaction callback function
 * @returns {Promise<*>} Result of callback
 */
export async function transaction(callback) {
  const p = getPrisma();
  return p.$transaction(callback);
}
