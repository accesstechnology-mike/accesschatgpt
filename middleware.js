import { NextResponse } from "next/server";

export async function middleware(request) {
  // Simple middleware that passes all requests through
  // We're keeping the structure in case we need to add ChatGPT-specific middleware later
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*', // Match all paths but we'll filter in the middleware if needed
};
