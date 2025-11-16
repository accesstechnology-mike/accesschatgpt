/**
 * Request fingerprinting for bot detection
 * Creates a privacy-preserving fingerprint from request headers
 * Used to detect bot farms using multiple IPs
 */

import { getDB } from '../db/db.js';

/**
 * Create a fingerprint from request headers
 * Privacy-preserving - doesn't include IP address
 * @param {Request} request - Next.js request object
 * @returns {string} - Fingerprint hash
 */
export function createFingerprint(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const acceptLanguage = request.headers.get('accept-language') || '';
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const accept = request.headers.get('accept') || '';
  
  // Create fingerprint from browser characteristics
  // This helps detect bot farms even when IPs change
  const fingerprintData = [
    userAgent,
    acceptLanguage,
    acceptEncoding,
    accept,
  ].join('|');
  
  // Simple hash function (for production, consider crypto.createHash)
  let hash = 0;
  for (let i = 0; i < fingerprintData.length; i++) {
    const char = fingerprintData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Track a fingerprint and check for suspicious patterns
 * @param {string} fingerprint - Request fingerprint
 * @param {string} ipAddress - Client IP address
 * @param {string} sessionId - Session ID (optional)
 * @returns {Promise<{isSuspicious: boolean, reason: string, ipCount: number}>}
 */
export async function trackFingerprint(fingerprint, ipAddress, sessionId = null) {
  const prisma = getDB();
  const now = new Date();
  const oneDayAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
  
  try {
    // Get or create fingerprint record
    let record = await prisma.requestFingerprint.findUnique({
      where: { fingerprint },
    });
    
    if (!record) {
      // Create new record
      await prisma.requestFingerprint.create({
        data: {
          fingerprint,
          ipAddress,
          sessionId,
          userAgent: 'unknown',
          firstSeen: now,
          lastSeen: now,
          requestCount: 1,
        },
      });
      
      return {
        isSuspicious: false,
        reason: null,
        ipCount: 1,
      };
    }
    
    // Update record
    await prisma.requestFingerprint.update({
      where: { fingerprint },
      data: {
        requestCount: { increment: 1 },
        lastSeen: now,
      },
    });
    
    // Check for suspicious patterns
    // Count unique IPs using this fingerprint in last 24 hours
    const uniqueIPs = await prisma.requestFingerprint.findMany({
      where: {
        fingerprint,
        lastSeen: {
          gt: oneDayAgo,
        },
      },
      select: { ipAddress: true },
      distinct: ['ipAddress'],
    });
    
    const ipCount = uniqueIPs.length || 1;
    
    // If same fingerprint used from 50+ different IPs = bot farm
    if (ipCount >= 50) {
      return {
        isSuspicious: true,
        reason: `Fingerprint used from ${ipCount} different IPs`,
        ipCount,
      };
    }
    
    return {
      isSuspicious: false,
      reason: null,
      ipCount,
    };
  }
}

/**
 * Check request fingerprint for bot detection
 * @param {Request} request - Next.js request object
 * @param {string} sessionId - Session ID
 * @param {string} clientIP - Client IP address
 * @returns {Promise<{isSuspicious: boolean, reason: string}>}
 */
export async function checkRequestFingerprint(request, sessionId, clientIP) {
  const fingerprint = createFingerprint(request);
  const result = await trackFingerprint(fingerprint, clientIP, sessionId);
  return {
    isSuspicious: result.isSuspicious,
    reason: result.reason,
  };
}
