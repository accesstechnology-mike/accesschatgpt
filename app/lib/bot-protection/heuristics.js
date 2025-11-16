import { getDB } from '../db/db.js';

const SUSPICIOUS_THRESHOLD = 5; // Number of suspicious patterns to trigger blocking
const BLOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check for suspicious usage patterns (disability-aware)
 * Distinguishes between bot behavior and legitimate disabled user behavior:
 * - Bots: Perfect timing, identical requests, no variation
 * - Disabled users: Variable timing, similar but not identical requests, natural pauses
 * 
 * @param {string} sessionId - Session ID
 * @param {string} endpoint - API endpoint
 * @param {string} ipAddress - Client IP address
 * @param {string} userPrompt - User prompt (optional, for content analysis)
 * @returns {Promise<{isSuspicious: boolean, reason: string, score: number}>}
 */
export async function checkSuspiciousActivity(sessionId, endpoint, ipAddress, userPrompt = null) {
  const prisma = getDB();
  const now = Date.now();
  const oneMinuteAgo = new Date(now - 60 * 1000);
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  
  let suspiciousScore = 0;
  const reasons = [];
  
  // Get recent requests with content for analysis
  const recentRequests = await prisma.usageLog.findMany({
      where: {
        sessionId,
        timestamp: {
          gt: oneHourAgo,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 20,
      select: {
        timestamp: true,
        endpoint: true,
        ipAddress: true,
      },
    });
    
    if (recentRequests.length === 0) {
      // New session - always allow first requests (grace period)
      return {
        isSuspicious: false,
        reason: null,
        score: 0,
      };
    }
    
    // Grace period: First 5 requests always allowed (disabled users may need multiple attempts)
    if (recentRequests.length < 5) {
      return {
        isSuspicious: false,
        reason: null,
        score: 0,
      };
    }
    
    // Check 1: Rapid identical requests (BOTS have perfect timing, humans don't)
    // Bots send requests at exact intervals (e.g., every 500ms)
    // Disabled users have variable timing due to typing, thinking, assistive tech delays
    if (recentRequests.length >= 5) {
      const timeDiffs = [];
      for (let i = 0; i < Math.min(10, recentRequests.length - 1); i++) {
        const timeDiff = recentRequests[i].timestamp.getTime() - 
                         recentRequests[i + 1].timestamp.getTime();
        timeDiffs.push(timeDiff);
      }
      
      // Calculate variance in timing
      const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
      const variance = timeDiffs.reduce((sum, diff) => sum + Math.pow(diff - avgTimeDiff, 2), 0) / timeDiffs.length;
      const stdDev = Math.sqrt(variance);
      
      // Bots have very low variance (consistent timing)
      // Humans have higher variance (natural variation)
      if (stdDev < 100 && avgTimeDiff < 1000) {
        // Very consistent timing under 1 second = likely bot
        suspiciousScore += 3;
        reasons.push('Extremely consistent request timing detected');
      } else if (stdDev < 200 && avgTimeDiff < 2000) {
        // Somewhat consistent = suspicious but not definitive
        suspiciousScore += 1;
      }
      
      // Check for requests less than 200ms apart (too fast for humans)
      const rapidRequests = timeDiffs.filter(diff => diff < 200).length;
      if (rapidRequests >= 3) {
        suspiciousScore += 2;
        reasons.push(`${rapidRequests} requests under 200ms apart`);
      }
    }
    
    // Check 2: Request rate (higher threshold to avoid false positives)
    // Disabled users may make many requests due to:
    // - Perseveration (repetitive behavior)
    // - Slow typing requiring multiple attempts
    // - Assistive tech sending multiple events
    const requestCount = await prisma.usageLog.count({
      where: {
        sessionId,
        timestamp: {
          gt: fiveMinutesAgo,
        },
      },
    });
    
    // Increased threshold: 50 requests in 5 minutes (was 30)
    // This allows for legitimate repetitive behavior
    if (requestCount > 50) {
      suspiciousScore += 2;
      reasons.push(`Very high request rate: ${requestCount} in 5 minutes`);
    } else if (requestCount > 30) {
      // Moderate threshold - just flag, don't block
      suspiciousScore += 1;
    }
    
    // Check 3: Multiple sessions from same IP (potential bot farm)
    // But allow for shared IPs (schools, care homes, libraries)
    const ipSessions = await prisma.usageLog.findMany({
      where: {
        ipAddress,
        timestamp: {
          gt: fiveMinutesAgo,
        },
      },
      select: {
        sessionId: true,
      },
      distinct: ['sessionId'],
    });
    
    const ipSessionCount = ipSessions.length;
    
    // Increased threshold: 20 sessions (was 10) to allow shared IPs
    if (ipSessionCount > 20) {
      suspiciousScore += 3;
      reasons.push(`${ipSessionCount} different sessions from same IP`);
    } else if (ipSessionCount > 10) {
      // Moderate - just flag
      suspiciousScore += 1;
    }
    
    // Check 4: Request content diversity
    // Bots send identical or very similar prompts
    // Disabled users vary their requests even when repetitive
    // Note: This requires storing prompt content in usage_logs
    // For now, we'll skip this check but it could be added later
    
    // Check 5: Session age and activity pattern
    // Legitimate users have longer sessions with breaks
    // Bots have short, intense bursts
    const sessionAge = now - recentRequests[recentRequests.length - 1].timestamp.getTime();
    const sessionDurationHours = sessionAge / (60 * 60 * 1000);
    
    if (sessionDurationHours < 0.1 && requestCount > 20) {
      // Very short session with many requests = suspicious
      suspiciousScore += 2;
      reasons.push('Short session with high activity');
    }
    
    // Only flag as suspicious if score is high enough
    // This prevents false positives for disabled users
    const isSuspicious = suspiciousScore >= 5;
    
  return {
    isSuspicious,
    reason: isSuspicious ? reasons.join('; ') : null,
    score: suspiciousScore,
  };
}

/**
 * Block a session temporarily
 * @param {string} sessionId - Session ID
 * @param {number} durationMs - Block duration in milliseconds
 */
export async function blockSession(sessionId, durationMs = BLOCK_DURATION_MS) {
  const prisma = getDB();
  const blockedUntil = new Date(Date.now() + durationMs);
  
  try {
    await prisma.sessionLimit.update({
      where: { sessionId },
      data: {
        isBlocked: true,
        blockedUntil,
      },
    });
    
    console.log(`Blocked session ${sessionId} until ${blockedUntil}`);
  } catch (error) {
    // Session limit might not exist yet - create it
    try {
      await prisma.sessionLimit.create({
        data: {
          id: `block_${sessionId}_${Date.now()}`,
          sessionId,
          ipAddress: 'unknown',
          createdAt: new Date(),
          lastUsedAt: new Date(),
          dailyUsageResetAt: new Date(),
          isBlocked: true,
          blockedUntil,
        },
      });
    } catch (createError) {
      console.error('Error blocking session:', createError);
    }
  }
}
