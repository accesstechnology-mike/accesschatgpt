import Stripe from 'stripe';
import { getDB } from '../db/db.js';

let stripeInstance = null;

function getStripe() {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    });
  }
  return stripeInstance;
}

export const stripe = new Proxy({}, {
  get(target, prop) {
    return getStripe()[prop];
  }
});

const SUBSCRIPTION_PRICE_ID = process.env.STRIPE_PRICE_ID;
const SUBSCRIPTION_AMOUNT = 499; // £4.99 in pence

/**
 * Create a Stripe Checkout session for subscription
 * @param {string} userId - User ID
 * @param {string} userEmail - User email
 * @param {string} successUrl - Success redirect URL
 * @param {string} cancelUrl - Cancel redirect URL
 * @returns {Promise<Stripe.Checkout.Session>} Checkout session
 */
export async function createCheckoutSession(userId, userEmail, successUrl, cancelUrl) {
  // First, get or create Stripe customer
  let customerId = await getStripeCustomerId(userId);
  
  if (!customerId) {
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        userId: userId,
      },
    });
    
    customerId = customer.id;
    
    // Save customer ID to database using Prisma
    const prisma = getDB();
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }
  
  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'access: chatgpt',
            description: 'Unlimited access to access: chatgpt',
          },
          recurring: {
            interval: 'month',
          },
          unit_amount: SUBSCRIPTION_AMOUNT,
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: userId,
    },
  });
  
  return session;
}

/**
 * Get Stripe customer ID for a user
 * @param {string} userId - User ID
 * @returns {string|null} Stripe customer ID or null
 */
export async function getStripeCustomerId(userId) {
  const prisma = getDB();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  return user?.stripeCustomerId || null;
}

/**
 * Update user subscription status from Stripe event
 * @param {string} customerId - Stripe customer ID
 * @param {string} status - Subscription status
 */
export async function updateSubscriptionStatus(customerId, status) {
  const prisma = getDB();
  
  // Get user by Stripe customer ID from Better Auth user table
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  });
  
  if (!user) {
    console.error(`User not found for Stripe customer: ${customerId}`);
    return;
  }
  
  // Map Stripe status to our status
  let subscriptionStatus = 'free';
  let subscriptionTier = 'free';
  
  if (status === 'active' || status === 'trialing') {
    subscriptionStatus = 'active';
    subscriptionTier = 'paid';
  } else if (status === 'past_due' || status === 'unpaid') {
    subscriptionStatus = 'past_due';
    subscriptionTier = 'free'; // Revoke access
  } else {
    subscriptionStatus = 'canceled';
    subscriptionTier = 'free';
  }
  
  // Update user using Prisma
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus,
      subscriptionTier,
    },
  });
  
  console.log(`Updated subscription for user ${user.id}: ${subscriptionStatus}/${subscriptionTier}`);
}

