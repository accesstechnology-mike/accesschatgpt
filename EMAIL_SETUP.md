# Email Setup for Password Reset

Password reset functionality is now configured using **Resend** for sending emails.

## Setup Steps

### 1. Create a Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### 2. Get Your API Key

1. Go to **API Keys** in the Resend dashboard
2. Click **Create API Key**
3. Give it a name (e.g., "Password Reset")
4. Copy the API key (starts with `re_`)

### 3. Set Up Your Domain (Optional but Recommended)

**For Production:**
1. Go to **Domains** in Resend dashboard
2. Add your domain (e.g., `yourdomain.com`)
3. Add the DNS records Resend provides to your domain
4. Wait for verification (usually a few minutes)

**For Testing:**
- You can use Resend's test domain: `onboarding@resend.dev`
- This works for development but has limitations

### 4. Add Environment Variables

Add these to your `.env` file (local) and Vercel environment variables:

```bash
# Resend Email (for password reset)
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**For local development (using test domain):**
```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**For production:**
```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### 5. Update Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
3. Set for **Production**, **Preview**, and **Development**
4. Redeploy your app

## How It Works

- When a user clicks "Forgot Password?", they enter their email
- Better Auth generates a reset token
- An email is sent via Resend with a reset link
- User clicks the link and is taken to `/reset-password?token=...`
- User enters a new password
- Password is updated and user can sign in

## Testing

1. Start your dev server: `pnpm dev`
2. Click the logo to open the user management modal
3. Click "Forgot Password?"
4. Enter an email address
5. Check the email inbox (or Resend dashboard → Logs for test emails)
6. Click the reset link
7. Set a new password

## Troubleshooting

**Email not sending:**
- Check that `RESEND_API_KEY` is set correctly
- Verify `RESEND_FROM_EMAIL` matches your verified domain (or use `onboarding@resend.dev` for testing)
- Check Resend dashboard → Logs for error messages

**404 Error on `/api/auth/forgot-password`:**
- Make sure `RESEND_API_KEY` is set
- Restart your dev server after adding environment variables

**Email goes to spam:**
- Use a verified domain (not the test domain)
- Set up SPF/DKIM records in Resend dashboard
- Consider using a subdomain like `noreply@mail.yourdomain.com`

## Resend Limits

**Free Tier:**
- 3,000 emails/month
- 100 emails/day
- Perfect for password resets!

**Paid Plans:**
- Start at $20/month for 50,000 emails
- See [resend.com/pricing](https://resend.com/pricing)


