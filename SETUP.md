# Setup Guide

This guide will help you set up the application for local development and production deployment.

## Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd access-chatgpt
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

4. **Set up the database**
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

5. **Run the development server**
   ```bash
   pnpm dev
   ```

## Production Deployment (Vercel)

### Required Environment Variables

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add each variable for **Production**, **Preview**, and **Development**:

#### 1. Neon Postgres Database

**Name:** `POSTGRES_PRISMA_URL`  
**Value:**
```
postgresql://user:password@host-pooler.region.aws.neon.tech/database?connect_timeout=15&sslmode=require
```

**Name:** `POSTGRES_URL_NON_POOLING`  
**Value:**
```
postgresql://user:password@host.region.aws.neon.tech/database?sslmode=require
```

#### 2. OpenAI

**Name:** `OPENAI_API_KEY`  
**Value:** (Your OpenAI API key from OpenAI dashboard)

#### 3. Stripe

**Name:** `STRIPE_SECRET_KEY`  
**Value:** (Your Stripe secret key from Stripe dashboard)

**Name:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  
**Value:** (Your Stripe publishable key from Stripe dashboard)

**Name:** `STRIPE_WEBHOOK_SECRET`  
**Value:** (Get from Stripe Dashboard → Webhooks → Your webhook → Signing secret)

#### 4. Better Auth

**Name:** `BETTER_AUTH_SECRET`  
**Value:** (Generate with: `openssl rand -base64 32`)

**Name:** `BETTER_AUTH_URL`  
**Value:** `https://your-app-name.vercel.app` (Update after first deploy)

**Name:** `NEXT_PUBLIC_BETTER_AUTH_URL`  
**Value:** `https://your-app-name.vercel.app` (Same as above)

#### 5. Resend Email (for password reset)

**Name:** `RESEND_API_KEY`  
**Value:** (Your Resend API key from Resend dashboard)

**Name:** `RESEND_FROM_EMAIL`  
**Value:** `noreply@yourdomain.com`

### Generate Better Auth Secret

Run this command locally:
```bash
openssl rand -base64 32
```

Copy the output and use it for `BETTER_AUTH_SECRET`.

### After Adding Variables

1. **Redeploy** your app (or push a new commit)
2. **Check build logs** - should see Prisma migrations running
3. **Test** - sign up/login should work

### Environment Scope

Set all variables for:
- ✅ **Production** (required)
- ✅ **Preview** (recommended)
- ✅ **Development** (optional, for Vercel preview deployments)

## Additional Setup Guides

- [Email Setup](./EMAIL_SETUP.md) - Configure password reset emails
- [Social Login Setup](./SOCIAL_LOGIN_SETUP.md) - Configure OAuth providers (Google, Apple, Facebook)

