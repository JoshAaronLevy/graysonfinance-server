import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import { auth } from './auth.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';
import { testConnection, sql } from './db/neon.js';

dotenv.config();

const app = express();
app.use(cors({
  credentials: true,
  origin: [
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean)
}));
app.use(express.json());
app.use(cookieParser());

// Better Auth routes
app.use('/api/auth', auth.handler);

const APP_ID_MAP = {
  income: process.env.DIFY_MONEYBUDDY_APP_ID,
  debt: process.env.DIFY_MONEYBUDDY_APP_ID,
  expenses: process.env.DIFY_MONEYBUDDY_APP_ID,
  savings: process.env.DIFY_MONEYBUDDY_APP_ID,
  chats: process.env.DIFY_MONEYBUDDY_APP_ID
};

const apiKey = process.env.DIFY_API_KEY;

if (!apiKey) {
  console.error('[Startup] ❌ DIFY_API_KEY is missing. Exiting...');
  process.exit(1);
} else {
  console.log(`[Startup] ✅ DIFY_API_KEY loaded (starts with: ${apiKey.slice(0, 6)}...)`);
}

app.post('/api/opening/:type', async (req, res) => {
  const type = req.params?.type?.toLowerCase();

  const customOpeners = {
    income: `Welcome to MoneyBuddy! Let's get started.\nWhat is your net monthly income after taxes?`,
    debt: `What does your current debt situation look like (excluding assets like a car or home)?\nYou can give a general response, like "$30,000", or a more detailed breakdown.`,
    expenses: 'Can you describe your typical monthly expenses? You can list categories or just give a ballpark figure.',
    savings: 'Do you currently have any savings? If so, how much and what are they for (e.g., emergency fund, vacation, etc.)?',
    chats: 'Welcome to MoneyBuddy! How can I assist you today? You can ask about anything related to your finances.'
  };

  const opener = customOpeners[type];

  if (!opener) {
    console.warn(`[Server] ⚠️ Unknown prompt type received: "${type}"`);
    return res.status(400).json({ error: `No opening message defined for type "${type}"` });
  }

  console.log(`[Server] 🚀 Sending custom opener for type "${type}": ${opener}`);
  res.json({ answer: opener });
});

// Authentication routes
app.get('/api/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  res.json({
    user: req.user,
    session: {
      id: req.session.id,
      expiresAt: req.session.expiresAt
    }
  });
});

app.post('/api/analyze/:type', optionalAuth, async (req, res) => {
  const type = req.params?.type?.toLowerCase();
  const userQuery = (req.body.query || '').trim();
  const userId = req.user?.id || uuidv4(); // Use authenticated user ID or generate fresh one

  console.log(`\n[Server] 📝 Received request for type: ${type}`);
  console.log('[Server] 📥 Raw request body:', req.body);
  console.log(`[Server] 🧑‍💻 User ID: ${userId} ${req.user ? '(authenticated)' : '(anonymous)'}`);

  if (!userQuery || typeof userQuery !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input: query' });
  }

  const appId = APP_ID_MAP[type];
  if (!appId) {
    return res.status(500).json({ error: `Missing Dify App ID for type "${type}"` });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'x-api-app-id': appId
  };

  try {
    console.log(`[Server] 📤 Forwarding query to Dify (App ID: ${appId})`);
    console.log('[Server] 🧾 Headers:', headers);

    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: null,
        user: userId
      },
      { headers }
    );

    const { answer, outputs = {}, conversation_id } = response.data;

    console.log('[Server] 💬 Answer:', answer);
    console.log('[Server] 📦 Outputs:', outputs);
    console.log(`[Server] 🧑‍💻 Returned user ID: ${userId}`);
    console.log(`[Server] 🧵 Returned conversation ID: ${conversation_id}`);

    res.json({ answer, outputs });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error(`[Server] ❌ Error for Dify type "${type}":`, error.message);
    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

// Protected user routes
app.get('/api/user/profile', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    message: 'User profile retrieved successfully'
  });
});

app.put('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Here you would update the user in your database
    // For now, we'll just return the updated user data
    res.json({
      user: { ...req.user, name, email },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('[Server] Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Protected financial data routes (require authentication)
app.get('/api/user/financial-data', requireAuth, (req, res) => {
  res.json({
    message: 'This would return user-specific financial data',
    userId: req.user.id,
    data: {
      // This is where you'd fetch user's financial data from database
      income: [],
      expenses: [],
      savings: [],
      debt: []
    }
  });
});

app.get('/api/status', optionalAuth, async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const dbResult = await sql`SELECT 1 as test`;
    dbStatus = dbResult[0]?.test === 1 ? 'connected' : 'error';
  } catch (error) {
    dbStatus = 'error';
    console.error('Database status check failed:', error);
  }

  res.json({
    status: 'ok',
    message: 'MoneyBuddy Dify proxy is running',
    version: '5.1.2',
    database: dbStatus,
    authenticated: !!req.user,
    user: req.user ? { id: req.user.id, email: req.user.email } : null,
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/api/analyze/${t}`),
    authEndpoints: [
      '/api/auth/sign-in',
      '/api/auth/sign-up',
      '/api/auth/sign-out',
      '/api/me',
      '/api/user/profile',
      '/api/user/financial-data'
    ]
  });
});

const PORT = process.env.PORT || 3000;

// Test database connection on startup
testConnection().then((success) => {
  if (!success) {
    console.warn('⚠️ Server starting without database connection');
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Dify proxy server running on http://localhost:${PORT}`)
);
