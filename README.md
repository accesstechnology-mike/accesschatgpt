# access: technology - ChatGPT Interface

An accessible web interface for interacting with ChatGPT, designed with accessibility and assistive technologies in mind.

## Features

- **Accessible Design**: Built with keyboard navigation, screen reader support, and assistive technology compatibility
- **Real-time Chat**: Interactive conversations with OpenAI's ChatGPT models
- **Voice Input/Output**: Speech-to-text and text-to-speech capabilities
- **Subscription Management**: Stripe integration for premium features
- **User Authentication**: Email/password and social login (Google, Apple, Facebook)
- **Bot Protection**: Accessibility-aware rate limiting and abuse prevention

## Tech Stack

- **Framework**: Next.js 16
- **Database**: PostgreSQL (via Prisma)
- **Authentication**: Better Auth
- **Payments**: Stripe
- **Email**: Resend
- **AI**: OpenAI API

## Getting Started

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### Quick Start

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and configure
4. Set up database: `pnpm db:generate && pnpm db:push`
5. Run dev server: `pnpm dev`

## Documentation

- [Setup Guide](./SETUP.md) - Local development and production setup
- [Email Setup](./EMAIL_SETUP.md) - Password reset configuration
- [Social Login Setup](./SOCIAL_LOGIN_SETUP.md) - OAuth provider configuration
- [Bot Protection Summary](./PROTECTION_SUMMARY.md) - Security and rate limiting features
- [Bot Protection Accessibility](./BOT_PROTECTION_ACCESSIBLE.md) - Accessibility considerations for bot protection

## License

[Add your license here]
