import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { requireAuth } from '@clerk/express';
import { testConnection, sql, pool } from './db/neon.js';
import clerkWebhookRouter from './routes/webhooks/clerk.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import incomeRoutes from './routes/financial/income.js';
import debtRoutes from './routes/financial/debt.js';
import expensesRoutes from './routes/financial/expenses.js';
import savingsRoutes from './routes/financial/savings.js';
import comprehensiveRoutes from './routes/financial/comprehensive.js';
import { PrismaClient } from '@prisma/client';

const latestVersion = '8.0.0';
const prisma = new PrismaClient();

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
app.use('/v1/webhooks', clerkWebhookRouter);

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

// New conversation and message routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);

// Modular financial routes
app.use('/v1/financial/income', incomeRoutes);
app.use('/v1/financial/debt', debtRoutes);
app.use('/v1/financial/expenses', expensesRoutes);
app.use('/v1/financial/savings', savingsRoutes);
app.use('/v1/financial/all', comprehensiveRoutes);
const APP_ID_MAP = {
  income: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  debt: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  expenses: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  savings: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  chats: process.env.DIFY_GRAYSON_FINANCE_APP_ID
};

const apiKey = process.env.DIFY_API_KEY;

if (!apiKey) {
  console.error('[Startup] ❌ DIFY_API_KEY is missing. Exiting...');
  process.exit(1);
}

app.post('/v1/opening/:type', requireAuth(), async (req, res) => {
  const type = req.params?.type?.toLowerCase();

  const customOpeners = {
    income: `Welcome! My name is Grayson, your personal AI financial assistant. Let's get started.\nWhat is your net monthly income after taxes?`,
    debt: `What does your current debt situation look like (excluding assets like a car or home)?\nYou can give a general response, like "$30,000", or a more detailed breakdown.`,
    expenses: 'Can you describe your typical monthly expenses? You can list categories or just give a ballpark figure.',
    savings: 'Do you currently have any savings? If so, how much and what are they for (e.g., emergency fund, vacation, etc.)?',
    chats: 'Welcome! How can I assist you today? You can ask about anything related to your finances.'
  };

  const opener = customOpeners[type];

  if (!opener) {
    console.warn(`[Server] ⚠️ Unknown prompt type received: "${type}"`);
    return res.status(400).json({ error: `No opening message defined for type "${type}"` });
  }

  try {
    // Get or create user and check for existing conversation
    const user = await getUserByClerkId(req.auth.userId);
    
    // Import services
    const { getConversationByType } = await import('./services/conversationService.js');
    
    // Check if conversation already exists
    const existingConversation = await getConversationByType(user.id, type);
    
    res.json({
      answer: opener,
      hasExistingConversation: !!existingConversation,
      conversationId: existingConversation?.id || null
    });
  } catch (error) {
    console.error('[Server] Error in opening endpoint:', error);
    // Fall back to just returning the opener message
    res.json({ answer: opener });
  }
});

// Protected analyze endpoint - requires authentication and saves chat history
app.post('/v1/analyze/:type', requireAuth(), async (req, res) => {
  const type = req.params?.type?.toLowerCase();
  const userQuery = (req.body.query || '').trim();

  console.log('[Server] 📥 Raw request body:', req.body);

  if (!userQuery || typeof userQuery !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid input: query' });
  }

  const appId = APP_ID_MAP[type];
  if (!appId) {
    return res.status(500).json({ error: `Missing Dify App ID for type "${type}"` });
  }

  try {
    // Get or create user
    const user = await getUserByClerkId(req.auth.userId);
    
    // Import services (we'll need to add these imports at the top)
    const { findOrCreateConversation } = await import('./services/conversationService.js');
    const { addMessagePair } = await import('./services/messageService.js');
    
    // Find or create conversation for this user and chat type
    let conversation = await findOrCreateConversation(user.id, type);
    let difyConversationId = conversation.conversationId;
    
    // If this is a new conversation, difyConversationId might be our generated ID
    // We need to use null for the first Dify call, then update with the returned ID
    const isNewConversation = !conversation.conversationId.includes('dify-');
    
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'x-api-app-id': appId
    };

    console.log('[Server] 🧾 Headers:', headers);

    const response = await axios.post(
      'https://api.dify.ai/v1/chat-messages',
      {
        query: userQuery,
        inputs: {},
        response_mode: 'blocking',
        conversation_id: isNewConversation ? null : difyConversationId,
        user: user.id
      },
      { headers }
    );

    const { answer, outputs = {}, conversation_id } = response.data;

    // If we got a new conversation_id from Dify, update our conversation record
    if (conversation_id && isNewConversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { conversationId: conversation_id }
      });
      difyConversationId = conversation_id;
    }

    // Save both user message and bot response
    await addMessagePair(conversation.id, userQuery, answer);

    const structuredResponse = {
      answer,
      outputs,
      userId: user.id,
      conversation_id: difyConversationId,
      conversationDbId: conversation.id
    };

    console.log('[Server] 📦 Structured Response: ', structuredResponse);

    res.json({
      answer,
      outputs,
      conversation_id: difyConversationId,
      conversationDbId: conversation.id
    });
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

// Helper function to get user by Clerk ID
async function getUserByClerkId(clerkUserId) {
  let user = await prisma.user.findUnique({
    where: { authId: clerkUserId }
  });
  
  if (!user) {
    // Create user if doesn't exist
    user = await prisma.user.create({
      data: { authId: clerkUserId }
    });
  }
  
  return user;
}

// Protected routes using Clerk middleware
app.get('/v1/user/profile', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await getUserByClerkId(clerkUserId);

    res.json({
      user: {
        id: user.id,
        authId: user.authId,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      message: 'User profile retrieved successfully'
    });
  } catch (error) {
    console.error('[Server] Profile retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

app.put('/v1/user/profile', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { email } = req.body;
    
    const user = await prisma.user.update({
      where: { authId: clerkUserId },
      data: {
        ...(email && { email })
      }
    });

    res.json({
      user: {
        id: user.id,
        authId: user.authId,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('[Server] Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Protected financial data routes - redirects to comprehensive financial API
app.get('/v1/user/financial-data', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await getUserByClerkId(clerkUserId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    ]);
    
    // Calculate totals
    const totalIncome = incomeSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalDebt = debtSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalExpenses = expenseSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalSavings = savingsSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);

    res.json({
      message: 'User financial data retrieved successfully',
      userId: clerkUserId,
      summary: {
        totalIncome,
        totalDebt,
        totalExpenses,
        totalSavings,
        netCashFlow: totalIncome - totalExpenses
      },
      data: {
        income: incomeSources,
        debt: debtSources,
        expenses: expenseSources,
        savings: savingsSources
      }
    });
  } catch (error) {
    console.error('[Server] Financial data error:', error);
    res.status(500).json({ error: 'Failed to retrieve financial data' });
  }
});

app.get('/v1/status', async (req, res) => {
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
    message: 'Grayson Finance Dify proxy is running',
    version: latestVersion,
    database: dbStatus,
    authentication: 'clerk',
    supportedEndpoints: Object.keys(APP_ID_MAP).map((t) => `/v1/analyze/${t}`)
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
  console.log(`🚀 Server running version ${latestVersion} on http://localhost:${PORT}`)
);
