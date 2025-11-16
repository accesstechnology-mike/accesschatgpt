import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Initialize Resend if API key is provided
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Custom email sending function for password reset
const sendResetPassword = async ({ user, url, token }) => {
  if (!resend) {
    console.error("Resend not configured - email cannot be sent");
    throw new Error("Email service not configured. Please set RESEND_API_KEY environment variable.");
  }

  // Use verified domain if available, otherwise fallback to test domain
  // Note: Domain must be verified in Resend to send to any recipient
  let from = (process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev").trim();
  
  // If using custom domain but it's not verified, Resend will only allow sending to your verified email
  // For now, we'll use the from address as configured
  const subject = "Reset your password";
  const html = `
    <h2>Reset Your Password</h2>
    <p>Click the link below to reset your password:</p>
    <p><a href="${url}">Reset Password</a></p>
    <p>Or copy and paste this URL into your browser:</p>
    <p>${url}</p>
    <p>This link will expire in 1 hour.</p>
  `;
  const text = `Reset your password by clicking this link: ${url}\n\nThis link will expire in 1 hour.`;

  try {
    const result = await resend.emails.send({
      from,
      to: user.email,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("Resend error:", result.error);
      throw new Error(result.error.message || "Failed to send email");
    }

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    console.error("Email send error:", error);
    throw error;
  }
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || "change-this-in-production",
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: false, // Keep it simple for disabled users
    minPasswordLength: 6,
    autoSignIn: true,
    sendResetPassword: sendResetPassword, // Required for forgot password functionality
  },
  account: {
    accountLinking: {
      enabled: true,
      // Trusted providers - automatically link accounts even without email verification
      // Google, Apple, and Facebook are generally trusted providers
      trustedProviders: ["google", "apple", "facebook"],
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!process.env.GOOGLE_CLIENT_ID, // Only enable if credentials are provided
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID || "",
      clientSecret: process.env.APPLE_CLIENT_SECRET || "",
      enabled: !!process.env.APPLE_CLIENT_ID, // Only enable if credentials are provided
    },
    facebook: {
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
      enabled: !!process.env.FACEBOOK_CLIENT_ID, // Only enable if credentials are provided
    },
  },
  plugins: [
    nextCookies(), // Must be last plugin
  ],
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  basePath: "/api/auth",
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  ],
});
