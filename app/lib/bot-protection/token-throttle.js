/**
 * Token request throttling
 * Prevents token farming attacks by limiting token request frequency
 */

import { getDB } from '../db/db.js';

const TOKEN_REQUEST_MIN_INTERVAL_MS = 5000; // 5 seconds between token requests (reduced from 30s for better UX)
const TOKEN_REQUEST_WINDOW_MS = 60 * 1000; // 1 minute window

/**
 * Check if token request is allowed
 * @param {string} sessionId - Session ID
 * @returns {Promise<{allowed: boolean, retryAfter: number}>}
 */
export async function checkTokenRequestThrottle(sessionId) {
  const prisma = getDB();
  const now = Date.now();
  
  // Check recent token requests for this session
  // We'll use the rate_limits table with endpoint 'token'
  let record = await prisma.rateLimit.findUnique({
      where: {
        identifier_endpoint: {
          identifier: sessionId,
          endpoint: 'token',
        },
      },
    });
    
    if (!record) {
      // First token request - allow it
      const resetAt = new Date(now + TOKEN_REQUEST_WINDOW_MS);
      const id = `${sessionId}_token_${now}`;
      await prisma.rateLimit.create({
        data: {
          id,
          identifier: sessionId,
          endpoint: 'token',
          count: 1,
          resetAt,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      
      return {
        allowed: true,
        retryAfter: 0,
      };
    }
    
    // Check if window expired
    const resetAtTimestamp = record.resetAt.getTime();
    if (resetAtTimestamp <= now) {
      // Reset window
      const newResetAt = new Date(now + TOKEN_REQUEST_WINDOW_MS);
      await prisma.rateLimit.update({
        where: {
          identifier_endpoint: {
            identifier: sessionId,
            endpoint: 'token',
          },
        },
        data: {
          count: 1,
          resetAt: newResetAt,
          updatedAt: new Date(now),
        },
      });
      
      return {
        allowed: true,
        retryAfter: 0,
      };
    }
    
    // Check time since last request
    const timeSinceLastRequest = now - (resetAtTimestamp - TOKEN_REQUEST_WINDOW_MS);
    
    if (timeSinceLastRequest < TOKEN_REQUEST_MIN_INTERVAL_MS) {
      const retryAfter = Math.ceil((TOKEN_REQUEST_MIN_INTERVAL_MS - timeSinceLastRequest) / 1000);
      return {
        allowed: false,
        retryAfter,
      };
    }
    
    // Update count
    await prisma.rateLimit.update({
      where: {
        identifier_endpoint: {
          identifier: sessionId,
          endpoint: 'token',
        },
      },
      data: {
        count: { increment: 1 },
        updatedAt: new Date(now),
      },
    });
    
  return {
    allowed: true,
    retryAfter: 0,
  };
}
