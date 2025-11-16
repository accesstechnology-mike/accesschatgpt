/**
 * Cost monitoring and limits
 * Tracks API spending and prevents runaway costs
 */

import { getDB } from '../db/db.js';

// Cost limits (in USD)
const DAILY_COST_LIMIT = 50.0; // $50 per day
const HOURLY_COST_LIMIT = 10.0; // $10 per hour

// Token cost estimates (approximate, adjust based on your actual costs)
const GPT_5_1_INPUT_COST_PER_1K = 0.01; // $0.01 per 1K input tokens
const GPT_5_1_OUTPUT_COST_PER_1K = 0.03; // $0.03 per 1K output tokens
const GPT_4O_INPUT_COST_PER_1K = 0.005; // $0.005 per 1K input tokens
const GPT_4O_OUTPUT_COST_PER_1K = 0.015; // $0.015 per 1K output tokens

/**
 * Estimate cost for a request
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @param {string} model - Model used (gpt-5.1, gpt-4o, etc.)
 * @returns {number} - Estimated cost in USD
 */
export function estimateCost(inputTokens, outputTokens, model = 'gpt-5.1') {
  if (model === 'gpt-5.1') {
    return (inputTokens / 1000) * GPT_5_1_INPUT_COST_PER_1K + 
           (outputTokens / 1000) * GPT_5_1_OUTPUT_COST_PER_1K;
  } else if (model === 'gpt-4o') {
    return (inputTokens / 1000) * GPT_4O_INPUT_COST_PER_1K + 
           (outputTokens / 1000) * GPT_4O_OUTPUT_COST_PER_1K;
  }
  
  // Default estimate
  return (inputTokens / 1000) * 0.01 + (outputTokens / 1000) * 0.03;
}

/**
 * Track cost for a request
 * @param {number} cost - Cost in USD
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 */
export async function trackCost(cost, inputTokens = 0, outputTokens = 0) {
  const prisma = getDB();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    // Get or create today's cost record
    let record = await prisma.costTracking.findUnique({
      where: { date: today },
    });
    
    if (!record) {
      // Create new record
      await prisma.costTracking.create({
        data: {
          date: today,
          totalCost: cost,
          requestCount: 1,
          tokenCount: inputTokens + outputTokens,
        },
      });
    } else {
      // Update existing record
      await prisma.costTracking.update({
        where: { date: today },
        data: {
          totalCost: { increment: cost },
          requestCount: { increment: 1 },
          tokenCount: { increment: inputTokens + outputTokens },
        },
      });
    }
  } catch (error) {
    console.error('Error tracking cost:', error);
    // Don't throw - cost tracking failures shouldn't break the app
  }
}

/**
 * Check if cost limits are exceeded
 * @returns {Promise<{allowed: boolean, dailyCost: number, limit: number, reason: string}>}
 */
export async function checkCostLimits() {
  const prisma = getDB();
  const today = new Date().toISOString().split('T')[0];
  const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
  
  try {
    // Check daily cost
    const dailyRecord = await prisma.costTracking.findUnique({
      where: { date: today },
      select: { totalCost: true },
    });
    
    const dailyCost = dailyRecord?.totalCost || 0;
  
    if (dailyCost >= DAILY_COST_LIMIT) {
      return {
        allowed: false,
        dailyCost,
        limit: DAILY_COST_LIMIT,
        reason: `Daily cost limit of $${DAILY_COST_LIMIT} exceeded. Current: $${dailyCost.toFixed(2)}`,
      };
    }
    
    // Check hourly cost (last hour of requests)
    // This is approximate - we'd need to track per-request timestamps for accuracy
    // For now, we'll use a simple heuristic: if daily cost is high and recent, slow down
    
    if (dailyCost > HOURLY_COST_LIMIT * 2) {
      // If we've spent more than 2x hourly limit today, check if it's recent
      const recentRequests = await prisma.usageLog.count({
        where: {
          timestamp: {
            gt: oneHourAgo,
          },
        },
      });
      
      if (recentRequests > 100) {
        // High recent activity - might be abuse
        return {
          allowed: true, // Don't block, but log
          dailyCost,
          limit: DAILY_COST_LIMIT,
          reason: 'High recent activity detected',
        };
      }
    }
    
    return {
      allowed: true,
      dailyCost,
      limit: DAILY_COST_LIMIT,
      reason: null,
    };
  } catch (error) {
    console.error('Error checking cost limits:', error);
    // On error, allow the request (fail open)
    return {
      allowed: true,
      dailyCost: 0,
      limit: DAILY_COST_LIMIT,
      reason: null,
    };
  }
}

/**
 * Get cost statistics
 * @returns {Promise<{today: number, thisWeek: number, thisMonth: number}>}
 */
export async function getCostStats() {
  const prisma = getDB();
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  try {
    const todayRecord = await prisma.costTracking.findUnique({
      where: { date: today },
      select: { totalCost: true },
    });
    const todayCost = todayRecord?.totalCost || 0;
    
    const weekRecords = await prisma.costTracking.findMany({
      where: {
        date: {
          gte: weekAgo,
        },
      },
      select: { totalCost: true },
    });
    const weekCost = weekRecords.reduce((sum, r) => sum + r.totalCost, 0);
    
    const monthRecords = await prisma.costTracking.findMany({
      where: {
        date: {
          gte: monthAgo,
        },
      },
      select: { totalCost: true },
    });
    const monthCost = monthRecords.reduce((sum, r) => sum + r.totalCost, 0);
    
    return {
      today: todayCost,
      thisWeek: weekCost,
      thisMonth: monthCost,
    };
  } catch (error) {
    console.error('Error getting cost stats:', error);
    // Return zeros on error
    return {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    };
  }
}

