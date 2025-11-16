import { NextResponse } from "next/server";

export async function proxy(request) {
  // Simple proxy that passes all requests through
  // We're keeping the structure in case we need to add ChatGPT-specific proxy logic later
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*', // Match all paths but we'll filter in the proxy if needed
};

