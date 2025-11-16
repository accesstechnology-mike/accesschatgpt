/**
 * Simple logger for request tracking and usage monitoring
 * Logs to console in dev, can be extended with external service later
 */

export function logRequest({ ip, endpoint, method, status, responseTime, tokenUsage, error, dailyLimit }) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    ip,
    endpoint,
    method,
    status,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
    tokenUsage: tokenUsage ? `~${tokenUsage} tokens` : undefined,
    error: error ? error.message : undefined,
    dailyLimit: dailyLimit ? dailyLimit : undefined,
  };

  // Filter out undefined values
  const filtered = Object.fromEntries(
    Object.entries(logEntry).filter(([_, v]) => v !== undefined)
  );

  if (status >= 400) {
    console.error('[API Error]', filtered);
  } else {
    console.log('[API Request]', filtered);
  }

  // In the future, this could send to an external logging service
  // e.g., Sentry, LogRocket, or a custom analytics endpoint
}

export function logUsage({ endpoint, model, inputTokens, outputTokens }) {
  const totalTokens = inputTokens + outputTokens;
  console.log(`[Usage] ${endpoint} - Model: ${model}, Input: ~${inputTokens}, Output: ~${outputTokens}, Total: ~${totalTokens}`);
}



