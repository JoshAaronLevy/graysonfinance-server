import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { requireAuth } from '@clerk/express';
import { testConnection, sql, pool } from './db/neon.js';
import clerkWebhookRouter from './routes/webhooks/clerk.js';

const latestVersion = '6.1.0';

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

// Raw body for Clerk webhook (must be before express.json())
app.use('/api/webhooks', clerkWebhookRouter);

// JSON parsing for everything else
app.use(express.json());

// Custom auth error handling middleware
const handleAuthError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    // Check if this is an auth error (typically HTML content from Clerk)
    if (res.statusCode === 401 || res.statusCode === 403) {
      return res.status(res.statusCode).json({
        error: res.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: 'Authentication required to access this resource'
      });
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    // Ensure auth errors are properly formatted
    if ((res.statusCode === 401 || res.statusCode === 403) && !data.error) {
      return originalJson.call(this, {
        error: res.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: 'Authentication required to access this resource'
      });
    }
    return originalJson.call(this, data);
  };
  
  next();
};

// Apply auth error handling to all routes
app.use(handleAuthError);
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

  res.json({ answer: opener });
});

// Public analyze endpoint - no authentication required for basic functionality
app.post('/api/analyze/:type', async (req, res) => {
  const type = req.params?.type?.toLowerCase();
  const userQuery = (req.body.query || '').trim();
  const userId = req.body.userId || 'anonymous';

  console.log('[Server] 📥 Raw request body:', req.body);

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

    const structuredResponse = {
      answer,
      outputs,
      userId,
      conversation_id
    };

    console.log('[Server] 📦 Structured Response: ', structuredResponse);

    res.json({ answer, outputs });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

// Protected routes using Clerk middleware
app.get('/api/user/profile', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const result = await pool.query(
      "SELECT id, clerk_user_id, email, name, created_at FROM users WHERE clerk_user_id = $1",
      [clerkUserId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: result.rows[0],
      message: 'User profile retrieved successfully'
    });
  } catch (error) {
    console.error('[Server] Profile retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

app.put('/api/user/profile', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { name, email } = req.body;
    
    const result = await pool.query(
      "UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE clerk_user_id = $3 RETURNING id, clerk_user_id, email, name, created_at, updated_at",
      [name, email, clerkUserId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: result.rows[0],
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('[Server] Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Protected financial data routes
app.get('/api/user/financial-data', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    
    res.json({
      message: 'This would return user-specific financial data',
      userId: clerkUserId,
      data: {
        // This is where you'd fetch user's financial data from database
        income: [],
        expenses: [],
        savings: [],
        debt: []
      }
    });
  } catch (error) {
    console.error('[Server] Financial data error:', error);
    res.status(500).json({ error: 'Failed to retrieve financial data' });
  }
});

app.get('/api/status', async (req, res) => {
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
    version: latestVersion,
    database: dbStatus,
    authentication: 'clerk',
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/api/analyze/${t}`)
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
  console.log(`🚀 Dify proxy server running version ${latestVersion} on http://localhost:${PORT}`)
);
