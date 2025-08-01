# Better-Auth Setup for MoneyBuddy Server

## Overview
Better-auth has been successfully integrated into your MoneyBuddy server. This document outlines the authentication endpoints and how to test them.

## Authentication Endpoints

### Core Auth Endpoints (handled by better-auth)
- `POST /api/auth/sign-up` - Register a new user
- `POST /api/auth/sign-in` - Sign in an existing user
- `POST /api/auth/sign-out` - Sign out the current user
- `GET /api/auth/session` - Get current session info

### Custom Endpoints
- `GET /api/me` - Get current user info (protected)
- `GET /api/user/profile` - Get user profile (protected)
- `PUT /api/user/profile` - Update user profile (protected)
- `GET /api/user/financial-data` - Get user's financial data (protected)
- `GET /api/status` - Server status (includes auth info)

## Testing the Authentication

### 1. Start the Server
```bash
npm start
```

### 2. Test Registration
```bash
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### 3. Test Sign In
```bash
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 4. Test Protected Route
```bash
curl -X GET http://localhost:3000/api/me \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

### 5. Test Status Endpoint
```bash
curl -X GET http://localhost:3000/api/status \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

## Frontend Integration

When integrating with a frontend, make sure to:

1. **Enable credentials in requests:**
```javascript
fetch('/api/auth/sign-in', {
  method: 'POST',
  credentials: 'include', // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});
```

2. **Configure your frontend URL in CORS:**
   - Add your frontend URL to the `trustedOrigins` array in `auth.js`
   - Make sure your frontend URL is in the CORS origin array in `index.js`

## Database

The authentication system uses SQLite with Prisma. The database file (`dev.db`) is created automatically when you first run the server.

## Environment Variables

Make sure these are set in your `.env` file:
- `BETTER_AUTH_SECRET` - ✅ Already configured
- `DATABASE_URL` - ✅ Already configured

Optional social login variables:
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

## Modified Routes

- `/api/analyze/:type` - Now uses optional authentication (works for both authenticated and anonymous users)
- `/api/status` - Now shows authentication status

## Security Features

- Session-based authentication
- Secure cookie handling
- CORS protection
- Password hashing (handled by better-auth)
- Session expiration (7 days)

## Next Steps

1. Test the authentication endpoints
2. Integrate with your frontend
3. Configure social login providers (optional)
4. Add role-based access control if needed
5. Implement password reset functionality