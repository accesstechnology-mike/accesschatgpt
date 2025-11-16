# Social Login Setup Guide

This guide will help you set up Google, Apple, and Facebook OAuth logins for your application.

## Overview

Social logins are already configured in the code. You just need to:
1. Get API credentials from each provider
2. Add them to your environment variables
3. Set up redirect URLs

## 1. Google OAuth Setup

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable **Google+ API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (for local dev)
     - `https://your-domain.vercel.app/api/auth/callback/google` (for production)
   - Copy the **Client ID** and **Client Secret**

### Step 2: Add to Environment Variables

Add to your `.env` file:
```bash
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
```

## 2. Facebook OAuth Setup

### Step 1: Create Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Choose **Consumer** as the app type
4. Fill in app details and create the app
5. Go to **Settings** → **Basic**:
   - Add your domain to **App Domains**
   - Add **Privacy Policy URL** and **Terms of Service URL** (required)
6. Go to **Facebook Login** → **Settings**:
   - Add **Valid OAuth Redirect URIs**:
     - `http://localhost:3000/api/auth/callback/facebook` (for local dev)
     - `https://your-domain.vercel.app/api/auth/callback/facebook` (for production)
7. Copy the **App ID** and **App Secret** from **Settings** → **Basic**

### Step 2: Add to Environment Variables

Add to your `.env` file:
```bash
FACEBOOK_CLIENT_ID=your-facebook-app-id-here
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret-here
```

## 3. Apple Sign In Setup

### Step 1: Create Apple Service ID

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Go to **Certificates, Identifiers & Profiles**
3. Create a **Services ID**:
   - Click **Identifiers** → **+**
   - Select **Services IDs** → **Continue**
   - Enter description and identifier (e.g., `com.yourdomain.app`)
   - Enable **Sign in with Apple**
   - Configure: Add your domain and redirect URLs:
     - `http://localhost:3000/api/auth/callback/apple` (for local dev)
     - `https://your-domain.vercel.app/api/auth/callback/apple` (for production)
4. Create a **Key**:
   - Go to **Keys** → **+**
   - Enable **Sign in with Apple**
   - Download the key file (`.p8`) - you can only download it once!
   - Note the **Key ID**
5. Get your **Team ID** from the top right of the Apple Developer portal

### Step 2: Add to Environment Variables

Add to your `.env` file:
```bash
APPLE_CLIENT_ID=your-services-id-here (e.g., com.yourdomain.app)
APPLE_CLIENT_SECRET=your-apple-client-secret-here
APPLE_TEAM_ID=your-team-id-here
APPLE_KEY_ID=your-key-id-here
APPLE_PRIVATE_KEY=your-private-key-content-here
```

**Note:** For Apple, the `APPLE_CLIENT_SECRET` is a JWT token. Better Auth may handle this automatically, but you might need to generate it. The private key should be the content of the `.p8` file.

## 4. Vercel Environment Variables

After setting up all providers, add these to your Vercel Dashboard:

### Google
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Facebook
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`

### Apple
- `APPLE_CLIENT_ID`
- `APPLE_CLIENT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

## 5. Testing

1. Start your dev server: `npm run dev`
2. Click the logo to open the user management modal
3. You should see Google, Apple, and Facebook buttons
4. Click each one to test the OAuth flow

## Important Notes

- **Redirect URLs must match exactly** - Make sure the redirect URLs in your provider settings match exactly what Better Auth expects
- **Apple requires HTTPS** - Apple Sign In only works with HTTPS in production
- **Facebook requires Privacy Policy** - You must have a privacy policy URL set in Facebook app settings
- **Providers are auto-enabled** - The code automatically enables providers when credentials are present

## Troubleshooting

- **404 errors**: Check that redirect URLs are set correctly in provider settings
- **"Provider not enabled"**: Make sure environment variables are set correctly
- **Apple errors**: Apple Sign In is more complex - ensure all Apple credentials are correct

## Security

- Never commit `.env` files to git
- Keep `CLIENT_SECRET` values secure
- Use different credentials for development and production
- Rotate secrets regularly

