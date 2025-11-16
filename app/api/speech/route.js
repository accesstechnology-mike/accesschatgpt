import { NextResponse } from "next/server";
import OpenAI from 'openai';
import { rateLimit, getClientIP, SPEECH_LIMIT } from '@/lib/rateLimit';
import { validateEnv } from '@/lib/env';
import { logRequest } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { checkDailyLimit, logUsage as logDailyUsage } from '@/lib/sessions/limits';
import { checkBlocked } from '@/lib/bot-protection/blocking';
import { checkSuspiciousActivity, blockSession } from '@/lib/bot-protection/heuristics';

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
    
    // IP-based rate limiting (second layer) - database-backed
    const rateLimitResult = await rateLimit(clientIP, SPEECH_LIMIT, 'speech');
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': SPEECH_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }
    
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // Use gpt-4o-mini-tts for fast generation with British English accent support
    // Opus format is smaller and faster than MP3
    const speechResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts", // Fast model that supports instructions
      voice: "nova", // Clear, friendly voice
      input: text,
      instructions: "Speak with a British English accent. Use clear, natural pronunciation suitable for accessibility.", // British English accent
      response_format: "opus", // Opus is smaller and faster than MP3
      speed: 1.0, // Normal speed
    });

    // Stream the audio response for fastest playback
    const stream = speechResponse.body;
    
    const responseTime = Date.now() - startTime;
    const dailyLimitStr = dailyLimitResult.remaining === Infinity 
      ? 'Daily: unlimited' 
      : `Daily: ${dailyLimitResult.used}/${dailyLimitResult.limit} used (${dailyLimitResult.remaining} remaining)`;
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/speech', 
      method: 'POST', 
      status: 200, 
      responseTime,
      dailyLimit: dailyLimitStr
    });
    
    // Check for suspicious activity and log usage
    const suspiciousCheck = await checkSuspiciousActivity(sessionId, 'speech', clientIP);
    
    if (suspiciousCheck.isSuspicious) {
      await blockSession(sessionId);
      logDailyUsage(sessionId, userId, 'speech', clientIP, true);
      return NextResponse.json(
        { error: "Suspicious activity detected. Your session has been temporarily blocked." },
        { status: 403 }
      );
    }
    
    logDailyUsage(sessionId, userId, 'speech', clientIP, false);
    
    // Return streaming audio response
    const responseHeaders = new Headers({
      'Content-Type': 'audio/opus',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
      'X-RateLimit-Limit': SPEECH_LIMIT.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
      'X-DailyLimit-Limit': dailyLimitResult.tier === 'paid' ? 'unlimited' : '20',
      'X-DailyLimit-Remaining': dailyLimitResult.remaining === Infinity ? 'unlimited' : dailyLimitResult.remaining.toString(),
      'X-DailyLimit-Reset': dailyLimitResult.resetAt.toISOString(),
    });
    
    return new NextResponse(stream, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("Error in speech API route:", error);
    
    let errorMessage = "Failed to generate speech";
    let statusCode = 500;
    
    if (error instanceof OpenAI.APIError) {
      statusCode = error.status || 500;
      errorMessage = `API Error: ${error.message || error.name}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/speech', 
      method: 'POST', 
      status: statusCode, 
      responseTime,
      error 
    });
    
    return NextResponse.json(
      {
        error: "Failed to generate speech",
        message: errorMessage,
      },
      { status: statusCode }
    );
  }
}

