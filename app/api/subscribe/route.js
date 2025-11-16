import { NextResponse } from "next/server";
import { auth } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/subscriptions/stripe';
import { headers } from 'next/headers';

export async function GET(request) {
  try {
    // Get authenticated user from Better Auth
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Please sign in to subscribe" },
        { status: 401 }
      );
    }
    
    const user = session.user;
    
    // Get success and cancel URLs from query params
    const url = new URL(request.url);
    const successUrl = url.searchParams.get('success_url') || `${url.origin}/?subscribed=true`;
    const cancelUrl = url.searchParams.get('cancel_url') || `${url.origin}/?canceled=true`;
    
    // Create Stripe Checkout session
    const checkoutSession = await createCheckoutSession(
      user.id,
      user.email,
      successUrl,
      cancelUrl
    );
    
    // Redirect to Stripe Checkout
    return NextResponse.redirect(checkoutSession.url);
    
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}

