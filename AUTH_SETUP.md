# Clerk Authentication Setup for MoneyBuddy Server

## Overview
Clerk authentication has been successfully integrated into your MoneyBuddy server. This document outlines the authentication endpoints and setup process.

## Authentication Endpoints

### Protected Routes (require Clerk authentication)
- `GET /api/user/profile` - Get current user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/financial-data` - Get user's financial data

### Public Routes
- `POST /api/analyze/:type` - Analyze financial data (public)
- `GET /api/opening/:type` - Get opening messages (public)
- `GET /api/status` - Server status (public)

### Webhook Endpoints
- `POST /api/webhooks/clerk` - Clerk webhook for user lifecycle events

## Environment Variables

Required environment variables in your `.env` file:

```env
# Dify API Configuration
DIFY_API_KEY=your_dify_api_key_here
DIFY_GRAYSON_FINANCE_APP_ID=your_dify_app_id_here
DIFY_GRAYSON_FINANCE_PRO_APP_ID=your_dify_app_id_here

# Server Configuration
BASE_URL=https://moneybuddy-server.onrender.com
FRONTEND_URL=https://graysonfinance.vercel.app
DATABASE_URL=your_neon_postgres_connection_string

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

## Database Schema

The users table has been updated for Clerk:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  clerk_user_id VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified TIMESTAMP,
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Database Management Scripts

Use these npm scripts for database management:

```bash
# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Reset database (drops and recreates tables)
npm run db:reset
```

## Clerk Webhook Setup

1. **In your Clerk Dashboard:**
   - Go to Webhooks
   - Add endpoint: `https://your-domain.com/api/webhooks/clerk`
   - Select events: `user.created`, `user.updated`, `user.deleted`
   - Copy the webhook secret to `CLERK_WEBHOOK_SECRET`

2. **Webhook handles:**
   - `user.created` - Automatically creates user record in database
   - `user.updated` - Updates user record when profile changes
   - `user.deleted` - Removes user record from database

## Frontend Integration

When integrating with a frontend using Clerk:

1. **Install Clerk in your frontend:**
```bash
npm install @clerk/nextjs  # for Next.js
# or
npm install @clerk/react   # for React
```

2. **Configure Clerk provider:**
```javascript
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </ClerkProvider>
  )
}
```

3. **Make authenticated requests:**
```javascript
import { useAuth } from '@clerk/nextjs'

function MyComponent() {
  const { getToken } = useAuth()
  
  const fetchUserProfile = async () => {
    const token = await getToken()
    const response = await fetch('/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    return response.json()
  }
}
```

## Testing Authentication

### 1. Start the Server
```bash
npm start
```

### 2. Test Public Endpoints
```bash
# Test status endpoint
curl http://localhost:3000/api/status

# Test analyze endpoint
curl -X POST http://localhost:3000/api/analyze/income \
  -H "Content-Type: application/json" \
  -d '{"query": "I make $5000 per month"}'
```

### 3. Test Protected Endpoints
Protected endpoints require a valid Clerk session token. These should be tested through your frontend application after implementing Clerk authentication.

## Migration from Previous Auth System

The following changes were made during migration:

1. **Removed:**
   - JWT/bcrypt authentication
   - Sessions table
   - Password field from users table
   - Old auth middleware
   - Cookie-based authentication

2. **Added:**
   - Clerk Express middleware
   - Clerk webhook handler
   - `clerk_user_id` field to users table
   - `updated_at` field to users table

## Security Features

- Bearer token authentication via Clerk
- Automatic user synchronization via webhooks
- Session management handled by Clerk
- No password storage (handled by Clerk)
- Secure webhook verification

## Next Steps

1. Configure Clerk in your dashboard
2. Set up webhooks
3. Update your frontend to use Clerk
4. Test the complete authentication flow
5. Deploy and verify webhook endpoint is accessible