import { NextResponse } from "next/server";
import OpenAI from 'openai';
import { rateLimit, getClientIP, CHAT_LIMIT } from '@/lib/rateLimit';
import { validateEnv } from '@/lib/env';
import { logRequest, logUsage } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { checkDailyLimit, logUsage as logDailyUsage } from '@/lib/sessions/limits';
import { checkBlocked } from '@/lib/bot-protection/blocking';
import { checkSuspiciousActivity, blockSession } from '@/lib/bot-protection/heuristics';
import { getTextOnlyPrompt } from '@/lib/prompts';
import { checkCostLimits, trackCost, estimateCost } from '@/lib/bot-protection/cost-monitor';

// Validate environment variables
try {
  validateEnv();
} catch (error) {
  console.error('Environment validation failed:', error.message);
}

// Instantiate the OpenAI client.
// It will automatically pick up the OPENAI_API_KEY environment variable.
const openai = new OpenAI();

// Configuration constants
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_TOKENS = 10000;
const MAX_PROMPT_LENGTH = 10000;
const API_TIMEOUT_MS = 30000;

// Rough estimate: ~4 characters per token
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Truncate history to keep last N messages OR last M tokens (whichever is smaller)
function truncateHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // First, limit by message count
  let truncated = messages.slice(-MAX_HISTORY_MESSAGES);
  
  // Then, limit by token count (count tokens from oldest to newest)
  let totalTokens = 0;
  const result = [];
  
  for (let i = truncated.length - 1; i >= 0; i--) {
    const msg = truncated[i];
    const msgTokens = estimateTokens(msg.content || '');
    
    if (totalTokens + msgTokens > MAX_HISTORY_TOKENS) {
      break;
    }
    
    result.unshift(msg);
    totalTokens += msgTokens;
  }
  
  return result;
}

// System prompt optimized for accessibility - simple, child-friendly language
const systemPrompt = getTextOnlyPrompt();

// Function to strip any markdown that might still come through
function stripMarkdown(text) {
  if (!text) return text;
  return text
    // Replace code blocks (both ```language and ```)
    .replace(/```[\s\S]*?```/g, content => {
      // Extract the code content without the backticks
      const code = content.replace(/```(?:\w+)?\n([\s\S]*?)```/g, '$1').trim();
      return `Code: ${code}`;
    })
    // Replace inline code
    .replace(/`([^`]+)`/g, '$1')
    // Replace headers
    .replace(/^#+\s+(.*)$/gm, '$1')
    // Replace bold/italic
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Replace bullet lists (simplify to plain text)
    .replace(/^[\s-]*[-*+]\s+(.*)$/gm, '• $1')
    // Replace numbered lists
    .replace(/^\s*\d+\.\s+(.*)$/gm, '• $1')
    // Replace links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    // Replace any other potential markdown elements as needed
    .trim();
}

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
    
    // Check cost limits FIRST (prevent runaway costs)
    const costCheck = await checkCostLimits();
    if (!costCheck.allowed) {
      console.warn(`⚠️  Cost limit exceeded: ${costCheck.reason}`);
      return NextResponse.json(
        { 
          error: "Service temporarily unavailable due to high demand. Please try again later.",
          limitReached: true,
        },
        { status: 503 }
      );
    }
    
    // Check daily limit BEFORE IP rate limiting
    const dailyLimitResult = await checkDailyLimit(sessionId, userId);
    
    if (!dailyLimitResult.allowed) {
      const retryAfter = Math.ceil((dailyLimitResult.resetAt.getTime() - Date.now()) / 1000);
      const response = NextResponse.json(
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
      
      return response;
    }
    
    // IP-based rate limiting (second layer) - database-backed
    const rateLimitResult = await rateLimit(clientIP, CHAT_LIMIT, 'chat');
    
    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': CHAT_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }
    
    const body = await request.json();
    const userPrompt = body.prompt;
    // Ensure history is always an array, even if not provided
    const history = Array.isArray(body.history) ? body.history : []; 

    if (!userPrompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Input validation
    if (userPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (history.length > 100) {
      return NextResponse.json(
        { error: "History array exceeds maximum size of 100 items" },
        { status: 400 }
      );
    }

    // Filter and truncate history before sending
    const filteredHistory = history.filter(msg => msg.role && msg.content);
    const truncatedHistory = truncateHistory(filteredHistory);

    // Construct the message history for the API call
    const messagesForApi = [
      { role: "system", content: systemPrompt },
      ...truncatedHistory,
      { role: "user", content: userPrompt },
    ];

    // --- Make the actual OpenAI API call --- 
    // Using GPT-5.1 with fallback to gpt-4o if unavailable
    // Using none reasoning_effort for fastest responses (supported values: 'none', 'low', 'medium', 'high')
    // Note: GPT-5.1 does NOT support max_tokens, temperature, top_p, or logprobs
    // Use verbosity: "low" to control response length instead
    
    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    
    let chatCompletion;
    let modelUsed = 'gpt-5.1';
    
    try {
      chatCompletion = await openai.chat.completions.create({
        messages: messagesForApi,
        model: "gpt-5.1",
        reasoning_effort: "none",
        verbosity: "low",
      }, {
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout
      if (error.name === 'AbortError') {
        return NextResponse.json(
          { error: "Request timed out. Please try again." },
          { status: 408 }
        );
      }
      
      // Try fallback model if gpt-5.1 is unavailable
      if (error instanceof OpenAI.APIError && 
          (error.code === 'model_not_found' || error.message?.includes('gpt-5.1'))) {
        console.log('GPT-5.1 unavailable, falling back to gpt-4o');
        try {
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), API_TIMEOUT_MS);
          
          chatCompletion = await openai.chat.completions.create({
            messages: messagesForApi,
            model: "gpt-4o",
            max_tokens: 500, // Limit response length for cost control
          }, {
            signal: fallbackController.signal,
          });
          
          clearTimeout(fallbackTimeoutId);
          modelUsed = 'gpt-4o';
        } catch (fallbackError) {
          clearTimeout(fallbackTimeoutId);
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }
    
    clearTimeout(timeoutId);

    // Extract the response content and strip any markdown
    const rawResponse = chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    const aiResponse = stripMarkdown(rawResponse);
    
    // Log usage for monitoring (approximate token usage)
    const inputTokens = estimateTokens(messagesForApi.map(m => m.content).join(' '));
    const outputTokens = estimateTokens(aiResponse);
    const totalTokens = inputTokens + outputTokens;
    
    // Track cost
    const estimatedCost = estimateCost(inputTokens, outputTokens, modelUsed);
    await trackCost(estimatedCost, inputTokens, outputTokens);
    
    const responseTime = Date.now() - startTime;
    logUsage({ endpoint: '/api/chat', model: modelUsed, inputTokens, outputTokens });
    const dailyLimitStr = dailyLimitResult.remaining === Infinity 
      ? 'Daily: unlimited' 
      : `Daily: ${dailyLimitResult.used}/${dailyLimitResult.limit} used (${dailyLimitResult.remaining} remaining)`;
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/chat', 
      method: 'POST', 
      status: 200, 
      responseTime,
      tokenUsage: totalTokens,
      dailyLimit: dailyLimitStr
    });
    
    // Check for suspicious activity and log usage
    const suspiciousCheck = await checkSuspiciousActivity(sessionId, 'chat', clientIP);
    
    if (suspiciousCheck.isSuspicious) {
      await blockSession(sessionId);
      logDailyUsage(sessionId, userId, 'chat', clientIP, true);
      return NextResponse.json(
        { error: "Suspicious activity detected. Your session has been temporarily blocked." },
        { status: 403 }
      );
    }
    
    logDailyUsage(sessionId, userId, 'chat', clientIP, false);
    // -----------------------------------------

    // Add rate limit headers to successful response
    return NextResponse.json(
      { response: aiResponse },
      {
        headers: {
          'X-RateLimit-Limit': CHAT_LIMIT.toString(),
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
    
    // Handle timeout errors
    if (error.name === 'AbortError') {
      logRequest({ 
        ip: clientIP, 
        endpoint: '/api/chat', 
        method: 'POST', 
        status: 408, 
        responseTime,
        error 
      });
      return NextResponse.json(
        { error: "Request timed out. Please try again." },
        { status: 408 }
      );
    }
    
    console.error("Error in chat API route:", error);
    console.error("Error details:", {
      message: error.message,
      status: error instanceof OpenAI.APIError ? error.status : undefined,
      code: error instanceof OpenAI.APIError ? error.code : undefined,
    });
    
    // Provide more specific error feedback if possible
    let errorMessage = "Failed to get response from AI";
    let statusCode = 500;
    
    if (error instanceof OpenAI.APIError) {
      statusCode = error.status || 500;
      if (error.code === 'model_not_found' || error.message?.includes('gpt-5.1')) {
        errorMessage = "The requested model is not available. Please try again.";
      } else if (error.status === 429) {
        errorMessage = "Rate limit exceeded. Please try again later.";
      } else {
        // Don't expose internal error details to client
        errorMessage = "An error occurred while processing your request. Please try again.";
      }
    } else if (error.message) {
      // Don't expose internal error details
      errorMessage = "An error occurred while processing your request. Please try again.";
    }
    
    logRequest({ 
      ip: clientIP, 
      endpoint: '/api/chat', 
      method: 'POST', 
      status: statusCode, 
      responseTime,
      error 
    });
    
    return NextResponse.json(
      {
        error: "Failed to get response from AI",
        message: errorMessage,
      },
      { status: statusCode } 
    );
  }
} 