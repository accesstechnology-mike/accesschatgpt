import { randomUUID } from 'crypto';
import { getDB, get, query } from '../db/db.js';
import { getClientIP } from '../rateLimit.js';

const SESSION_COOKIE_NAME = 'access_session_id';
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a new session ID
 * @returns {string} Session ID
 */
export function generateSessionId() {
  return randomUUID();
}

/**
 * Get session ID from request cookies
 * @param {Request} request - Next.js request object
 * @returns {string|null} Session ID or null
 */
export function getSessionIdFromRequest(request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  
  if (!sessionCookie) return null;
  
  return sessionCookie.split('=')[1];
}

/**
 * Get or create session for a request
 * @param {Request} request - Next.js request object
 * @returns {Promise<{sessionId: string, isNew: boolean}>}
 */
export async function getOrCreateSession(request) {
  const db = getDB();
  const clientIP = getClientIP(request);
  
  // Try to get existing session from cookie
  let sessionId = getSessionIdFromRequest(request);
  let isNew = false;
  
  if (sessionId) {
    // Validate session exists and is not blocked
    const session = get(
      'SELECT id, is_blocked, blocked_until FROM sessions WHERE id = ?',
      [sessionId]
    );
    
    if (session) {
      // Check if session is blocked
      if (session.is_blocked && session.blocked_until) {
        const now = Date.now();
        if (session.blocked_until > now) {
          // Still blocked
          return { sessionId, isNew: false, isBlocked: true };
        } else {
          // Block expired, unblock it
          query(
            'UPDATE sessions SET is_blocked = 0, blocked_until = NULL WHERE id = ?',
            [sessionId]
          );
        }
      }
      
      // Update last_used_at
      query(
        'UPDATE sessions SET last_used_at = ? WHERE id = ?',
        [Date.now(), sessionId]
      );
      
      return { sessionId, isNew: false, isBlocked: false };
    }
  }
  
  // Create new session
  sessionId = generateSessionId();
  isNew = true;
  
  const now = Date.now();
  const resetAt = getNextMidnightUTC();
  
  query(
    `INSERT INTO sessions (id, ip_address, created_at, last_used_at, daily_usage_reset_at)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, clientIP, now, now, resetAt]
  );
  
  return { sessionId, isNew: true, isBlocked: false };
}

/**
 * Get next midnight UTC timestamp
 * @returns {number} Timestamp in milliseconds
 */
function getNextMidnightUTC() {
  const now = new Date();
  const utcNow = new Date(now.toISOString());
  const midnight = new Date(utcNow);
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight.getTime();
}

/**
 * Set session cookie in response headers
 * @param {Headers} headers - Response headers object
 * @param {string} sessionId - Session ID
 */
export function setSessionCookie(headers, sessionId) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieValue = `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_COOKIE_MAX_AGE}${isProduction ? '; Secure' : ''}`;
  headers.set('Set-Cookie', cookieValue);
}

/**
 * Link session to user account
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 */
export function linkSessionToUser(sessionId, userId) {
  query(
    'UPDATE sessions SET user_id = ? WHERE id = ?',
    [userId, sessionId]
  );
}

export { SESSION_COOKIE_NAME };

