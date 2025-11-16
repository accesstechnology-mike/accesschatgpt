import { NextResponse } from "next/server";
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { stripe } from '@/lib/subscriptions/stripe';
import { getStripeCustomerId } from '@/lib/subscriptions/stripe';

export async function GET(request) {
  try {
    // Get authenticated user
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.user) {
      // Not logged in - redirect to subscription page
      const url = new URL(request.url);
      return NextResponse.redirect(`${url.origin}/api/subscribe`);
    }
    
    const userId = session.user.id;
    
    // Get Stripe customer ID
    const customerId = await getStripeCustomerId(userId);
    
    if (!customerId) {
      // User doesn't have a subscription yet - redirect to subscribe
      const url = new URL(request.url);
      return NextResponse.redirect(`${url.origin}/api/subscribe`);
    }
    
    // Create Customer Portal session
    const url = new URL(request.url);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: url.origin,
    });
    
    // Redirect to portal
    return NextResponse.redirect(portalSession.url);
    
  } catch (error) {
    console.error("Error creating portal session:", error);
    return NextResponse.json(
      { error: "Failed to access account management. Please try again." },
      { status: 500 }
    );
  }
}

