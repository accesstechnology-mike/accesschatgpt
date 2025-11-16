/**
 * Validates that required environment variables are present
 * Throws descriptive error if missing
 */
export function validateEnv() {
  const requiredVars = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  const missing = [];
  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please set these in your .env file or environment.`
    );
  }

  return {
    OPENAI_API_KEY: requiredVars.OPENAI_API_KEY,
  };
}

// Validate on import (fail fast)
let validatedEnv;
try {
  validatedEnv = validateEnv();
} catch (error) {
  // Only throw in production - in dev, allow runtime errors for better DX
  if (process.env.NODE_ENV === 'production') {
    throw error;
  }
  // In dev, log warning but don't throw
  console.warn('⚠️  Environment validation warning:', error.message);
  validatedEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  };
}

export default validatedEnv;




