// Rate limiting constants
const CHAT_LIMIT = 30; // requests per minute (increased from 10)
const REALTIME_LIMIT = 20; // requests per minute (increased from 5)
const SPEECH_LIMIT = 50; // requests per minute (increased from 20)

// Import database functions
import { getDB, get, query } from './db/db.js';
import { initDatabase } from './db/init.js';

// Ensure database is initialized
initDatabase();

/**
 * Check if a request is allowed based on rate limiting (database-backed)
 * @param {string} identifier - Client IP address or session ID
 * @param {number} limit - Maximum requests per minute
 * @param {string} endpoint - API endpoint name (e.g., 'chat', 'realtime', 'speech')
 * @returns {Promise<{ allowed: boolean, remaining: number, resetAt: Date }>}
 */
export async function rateLimit(identifier, limit, endpoint = 'default') {
  const prisma = getDB();
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  
  // Get or create rate limit record using Prisma
  let record = await prisma.rateLimit.findUnique({
    where: {
      identifier_endpoint: {
        identifier,
        endpoint,
      },
    },
  });
  
  if (!record) {
    // Create new record
    const resetAt = new Date(now + windowMs);
    const id = `${identifier}_${endpoint}_${now}`;
    record = await prisma.rateLimit.create({
      data: {
        id,
        identifier,
        endpoint,
        count: 0,
        resetAt,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  } else {
    // Check if window expired
    const resetAtTimestamp = record.resetAt.getTime();
    if (resetAtTimestamp <= now) {
      // Reset window
      const newResetAt = new Date(now + windowMs);
      record = await prisma.rateLimit.update({
        where: {
          identifier_endpoint: {
            identifier,
            endpoint,
          },
        },
        data: {
          count: 0,
          resetAt: newResetAt,
          updatedAt: new Date(now),
        },
      });
    }
  }
  
  // Check if limit exceeded
  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }
  
  // Increment count
  record = await prisma.rateLimit.update({
    where: {
      identifier_endpoint: {
        identifier,
        endpoint,
      },
    },
    data: {
      count: { increment: 1 },
      updatedAt: new Date(now),
    },
  });
  
  return {
    allowed: true,
    remaining: limit - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Get client IP from request headers
 * @param {Request} request - Next.js request object
 * @returns {string} - Client IP address
 */
export function getClientIP(request) {
  // Check common headers for client IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback to a default if no IP found (shouldn't happen in production)
  return 'unknown';
}

// Export constants for use in API routes
export { CHAT_LIMIT, REALTIME_LIMIT, SPEECH_LIMIT };
