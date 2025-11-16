import { NextResponse } from "next/server";
import OpenAI from 'openai';
import { rateLimit, getClientIP, REALTIME_LIMIT } from '@/lib/rateLimit';
import { validateEnv } from '@/lib/env';
import { logRequest } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { checkDailyLimit, logUsage as logDailyUsage } from '@/lib/sessions/limits';
import { checkBlocked } from '@/lib/bot-protection/blocking';
import { checkSuspiciousActivity, blockSession } from '@/lib/bot-protection/heuristics';
import { getVoicePrompt } from '@/lib/prompts';
import { checkTokenRequestThrottle } from '@/lib/bot-protection/token-throttle';

// Validate environment variables
try {
  validateEnv();
} catch (error) {
  console.error('Environment validation failed:', error.message);
}

// Instantiate the OpenAI client
const openai = new OpenAI();

export async function POST(request) {
  const startTime = Date.now();
  const clientIP = getClientIP(request);
  
  try {
    // Get Better Auth session
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    // Get or create anonymous session ID for tracking (even if not logged in)
    let sessionId = session?.session?.id || `anon_${clientIP}`;
    let userId = session?.user?.id || null;
    
    // Check if session is blocked (for anonymous sessions)
    if (!session?.user) {
      const blockedCheck = await checkBlocked(sessionId);
      if (blockedCheck.isBlocked && blockedCheck.blockedUntil && blockedCheck.blockedUntil.getTime() > Date.now()) {
        return NextResponse.json(
          { error: "Your session has been temporarily blocked due to suspicious activity. Please try again later." },
          { status: 403 }
        );
      }
    }
    
    // Check daily limit BEFORE IP rate limiting
    const dailyLimitResult = await checkDailyLimit(sessionId, userId);
    
    if (!dailyLimitResult.allowed) {
      const retryAfter = Math.ceil((dailyLimitResult.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { 
          error: "Daily limit reached. Please subscribe for unlimited access or try again tomorrow.",
          limitReached: true,
          tier: dailyLimitResult.tier
        },
        { 
          status: 429,
          headers: {
            'X-DailyLimit-Limit': dailyLimitResult.tier === 'paid' ? 'unlimited' : '20',
            'X-DailyLimit-Remaining': '0',
            'X-DailyLimit-Reset': dailyLimitResult.resetAt.toISOString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }
    
    // Token request throttling (prevent token farming)
    const tokenThrottle = await checkTokenRequestThrottle(sessionId);
    if (!tokenThrottle.allowed) {
      return NextResponse.json(
        { 
          error: `Please wait ${tokenThrottle.retryAfter} seconds before requesting a new token.`,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': tokenThrottle.retryAfter.toString(),
          },
        }
      );
    }
    
    // IP-based rate limiting (second layer) - database-backed
    const rateLimitResult = await rateLimit(clientIP, REALTIME_LIMIT, 'realtime');
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': REALTIME_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }
    
    // Validate request body size (prevent huge payloads)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 100000) { // 100KB max
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }
    // Create an ephemeral client secret for Realtime API
    // This allows the client to connect without exposing API keys
    const fetchResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: {
          anchor: 'created_at',
          seconds: 600, // 10 minutes
        },
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          instructions: getVoicePrompt(),
          audio: {
            output: {
              voice: 'alloy', // Supported voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
            },
          },
        },
      }),
    });

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json().catch(() => ({}));
      throw new Error(`Failed to create client secret: ${fetchResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await fetchResponse.json();

    const responseTime = Date.now() - startTime;
    const dailyLimitStr = dailyLimitResult.remaining === Infinity 
      ? 'Daily: unlimited' 
      : `Daily: ${dailyLimitResult.used}/${dailyLimitResult.limit} used (${dailyLimitResult.remaining} remaining)`;
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/realtime-token', 
      method: 'POST', 
      status: 200, 
      responseTime,
      dailyLimit: dailyLimitStr
    });
    
    // Check for suspicious activity and log usage
    const suspiciousCheck = await checkSuspiciousActivity(sessionId, 'realtime', clientIP);
    
    if (suspiciousCheck.isSuspicious) {
      await blockSession(sessionId);
      logDailyUsage(sessionId, userId, 'realtime', clientIP, true);
      return NextResponse.json(
        { error: "Suspicious activity detected. Your session has been temporarily blocked." },
        { status: 403 }
      );
    }
    
    logDailyUsage(sessionId, userId, 'realtime', clientIP, false);

    return NextResponse.json(
      { 
        token: data.value,
        expires_at: data.expires_at,
      },
      {
        headers: {
          'X-RateLimit-Limit': REALTIME_LIMIT.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
          'X-DailyLimit-Limit': dailyLimitResult.tier === 'paid' ? 'unlimited' : '20',
          'X-DailyLimit-Remaining': dailyLimitResult.remaining === Infinity ? 'unlimited' : dailyLimitResult.remaining.toString(),
          'X-DailyLimit-Reset': dailyLimitResult.resetAt.toISOString(),
        },
      }
    );

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("Error creating Realtime session token:", error);
    
    let errorMessage = "Failed to create session token";
    let statusCode = 500;
    
    if (error instanceof OpenAI.APIError) {
      statusCode = error.status || 500;
      errorMessage = `API Error: ${error.message || error.name}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/realtime-token', 
      method: 'POST', 
      status: statusCode, 
      responseTime,
      error 
    });
    
    return NextResponse.json(
      {
        error: "Failed to create session token",
        message: errorMessage,
      },
      { status: statusCode }
    );
  }
}

