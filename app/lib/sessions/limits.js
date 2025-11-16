import { getDB } from '../db/db.js';
import { randomUUID } from 'crypto';

const FREE_DAILY_LIMIT = 20;
const PAID_DAILY_LIMIT = Infinity; // Unlimited for paid users

/**
 * Check if daily limit is exceeded for a session
 * @param {string} sessionId - Session ID (Better Auth session ID or anonymous)
 * @param {string|null} userId - User ID from Better Auth (optional)
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date, tier: string}>}
 */
export async function checkDailyLimit(sessionId, userId = null) {
  const prisma = getDB();
  
  // For logged-in users, track by userId to persist limit across sessions
  // For anonymous users, track by sessionId
  let sessionLimit = null;
  
  if (userId) {
    // Look up by userId first (user might have multiple sessionLimit records from before fix)
    const userLimits = await prisma.sessionLimit.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
    
    if (userLimits.length > 0) {
      // Use the most recently used limit record
      sessionLimit = userLimits[0];
      
      // If there are multiple records, we could merge them, but for now just use the most recent
      // This handles the case where a user logged in/out multiple times before this fix
    }
  } else {
    // Anonymous user - look up by sessionId
    sessionLimit = await prisma.sessionLimit.findUnique({
      where: { sessionId },
    });
  }
  
  // If no session limit exists, create one
  if (!sessionLimit) {
    const resetAt = new Date(getNextMidnightUTC());
    // Use the actual sessionId (must be unique), but we'll look up by userId for logged-in users
    sessionLimit = await prisma.sessionLimit.create({
      data: {
        id: randomUUID(),
        sessionId, // Keep sessionId unique as required by schema
        ipAddress: 'unknown',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        dailyUsageResetAt: resetAt,
        dailyUsageCount: 0,
        userId,
      },
    });
  }
  
  // Get user subscription info if userId provided
  let tier = 'free';
  let subscriptionStatus = 'free';
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true, subscriptionStatus: true },
    });
    if (user) {
      tier = user.subscriptionTier || 'free';
      subscriptionStatus = user.subscriptionStatus || 'free';
    }
  }
  
  const isPaid = tier === 'paid' && subscriptionStatus === 'active';
  const dailyLimit = isPaid ? PAID_DAILY_LIMIT : FREE_DAILY_LIMIT;
  
  // Check if we need to reset daily counter
  const now = Date.now();
  const resetAtTimestamp = sessionLimit.dailyUsageResetAt.getTime();
  if (resetAtTimestamp <= now) {
    // Reset counter and increment for current request
    const nextReset = new Date(getNextMidnightUTC());
    const updateWhere = userId 
      ? { id: sessionLimit.id } // Update by ID for logged-in users
      : { sessionId }; // Update by sessionId for anonymous users
    sessionLimit = await prisma.sessionLimit.update({
      where: updateWhere,
      data: {
        dailyUsageCount: 1, // Reset to 0, then increment to 1 for current request
        dailyUsageResetAt: nextReset,
        lastUsedAt: new Date(),
      },
    });
    
    const remaining = dailyLimit === Infinity 
      ? Infinity 
      : dailyLimit - 1;
    
    return {
      allowed: true,
      remaining,
      used: dailyLimit === Infinity ? 0 : 1,
      limit: dailyLimit,
      resetAt: nextReset,
      tier,
    };
  }
  
  // Check if limit exceeded
  if (dailyLimit !== Infinity && sessionLimit.dailyUsageCount >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      used: sessionLimit.dailyUsageCount,
      limit: dailyLimit,
      resetAt: sessionLimit.dailyUsageResetAt,
      tier,
    };
  }
  
  // Increment usage count
  const updateWhere = userId 
    ? { id: sessionLimit.id } // Update by ID for logged-in users
    : { sessionId }; // Update by sessionId for anonymous users
  sessionLimit = await prisma.sessionLimit.update({
    where: updateWhere,
    data: {
      dailyUsageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
  
  const remaining = dailyLimit === Infinity 
    ? Infinity 
    : dailyLimit - sessionLimit.dailyUsageCount;
  
  return {
    allowed: true,
    remaining,
    used: dailyLimit === Infinity ? 0 : sessionLimit.dailyUsageCount,
    limit: dailyLimit,
    resetAt: sessionLimit.dailyUsageResetAt,
    tier,
  };
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
 * Log usage for analytics and bot detection
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID (optional)
 * @param {string} endpoint - API endpoint name
 * @param {string} ipAddress - Client IP address
 * @param {boolean} suspicious - Whether this usage is suspicious
 */
export async function logUsage(sessionId, userId, endpoint, ipAddress, suspicious = false) {
  const prisma = getDB();
  try {
    await prisma.usageLog.create({
      data: {
        sessionId,
        userId: userId || null,
        endpoint,
        ipAddress,
        timestamp: new Date(),
        suspicious,
      },
    });
  } catch (error) {
    console.error('Error logging usage:', error);
    // Don't throw - logging failures shouldn't break the app
  }
}
