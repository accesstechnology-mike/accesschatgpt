import { getDB } from '../db/db.js';

/**
 * Check if a session is currently blocked
 * @param {string} sessionId - Session ID
 * @returns {Promise<{isBlocked: boolean, blockedUntil: Date|null}>}
 */
export async function checkBlocked(sessionId) {
  const prisma = getDB();
  
  const sessionLimit = await prisma.sessionLimit.findUnique({
    where: { sessionId },
    select: {
      isBlocked: true,
      blockedUntil: true,
    },
  });
  
  if (!sessionLimit) {
    return { isBlocked: false, blockedUntil: null };
  }
  
  if (!sessionLimit.isBlocked || !sessionLimit.blockedUntil) {
    return { isBlocked: false, blockedUntil: null };
  }
  
  const now = new Date();
  if (sessionLimit.blockedUntil <= now) {
    // Block expired, unblock it
    await prisma.sessionLimit.update({
      where: { sessionId },
      data: {
        isBlocked: false,
        blockedUntil: null,
      },
    });
    return { isBlocked: false, blockedUntil: null };
  }
  
  return {
    isBlocked: true,
    blockedUntil: sessionLimit.blockedUntil,
  };
}
