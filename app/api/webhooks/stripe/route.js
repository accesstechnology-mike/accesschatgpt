import { NextResponse } from "next/server";
import { stripe, updateSubscriptionStatus } from '@/lib/subscriptions/stripe';
import { headers } from 'next/headers';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');
  
  if (!signature || !webhookSecret) {
    console.error('Missing Stripe signature or webhook secret');
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        
        if (session.mode === 'subscription' && customerId) {
          await updateSubscriptionStatus(customerId, 'active');
        }
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await updateSubscriptionStatus(subscription.customer, subscription.status);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await updateSubscriptionStatus(subscription.customer, 'canceled');
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await updateSubscriptionStatus(subscription.customer, subscription.status);
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          await updateSubscriptionStatus(subscription.customer, subscription.status);
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

