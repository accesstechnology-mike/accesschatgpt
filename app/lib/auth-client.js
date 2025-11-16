"use client";

import { createAuthClient } from "better-auth/react";

// Auto-detect base URL from current origin if env var not set
// This prevents CORS errors in production when env vars aren't configured
function getBaseURL() {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }
  
  // In browser, use current origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // Fallback for SSR (shouldn't happen for client component)
  return "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  basePath: "/api/auth",
});

