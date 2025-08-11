import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { requireAuth } from '@clerk/express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { testConnection, sql } from './db/neon.js';
import clerkWebhookRouter from './routes/webhooks/clerk.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import incomeRoutes from './routes/financial/income.js';
import debtRoutes from './routes/financial/debt.js';
import expensesRoutes from './routes/financial/expenses.js';
import savingsRoutes from './routes/financial/savings.js';
import comprehensiveRoutes from './routes/financial/comprehensive.js';
import { PrismaClient } from '@prisma/client';

const latestVersion = '1.25.2';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});

dotenv.config();

process.on('uncaughtException', (error) => {
  console.error('[Server] 💥 Uncaught Exception:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] 💥 Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('[Server] 🛑 SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] 🛑 SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

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

app.use('/v1/webhooks', clerkWebhookRouter);

app.use(express.json());

const handleAuthError = (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    if (res.statusCode === 401 || res.statusCode === 403) {
      return res.status(res.statusCode).json({
        error: res.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: 'Authentication required to access this resource'
      });
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
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

app.use(handleAuthError);

// Import income conversation routes
import incomeConversationRoutes from './routes/conversations/income.js';

app.use('/v1/conversations', conversationRoutes);
app.use('/v1/conversations/income', incomeConversationRoutes);

// Mount message routes under both prefixes with auth protection
app.use(['/v1/messages', '/v1/conversations'], requireAuth(), messageRoutes);

app.use('/v1/financial/income', incomeRoutes);

// Add income-sources alias endpoint
app.post('/v1/income-sources', requireAuth(), (req, res, next) => {
  // Reuse the existing income routes handler
  req.url = '/';
  incomeRoutes(req, res, next);
});
app.get('/v1/income-sources', requireAuth(), (req, res, next) => {
  // Reuse the existing income routes handler
  req.url = '/';
  incomeRoutes(req, res, next);
});
app.put('/v1/income-sources/:id', requireAuth(), (req, res, next) => {
  // Reuse the existing income routes handler - preserve the :id param
  req.url = `/${req.params.id}`;
  incomeRoutes(req, res, next);
});
app.delete('/v1/income-sources/:id', requireAuth(), (req, res, next) => {
  // Reuse the existing income routes handler - preserve the :id param
  req.url = `/${req.params.id}`;
  incomeRoutes(req, res, next);
});
app.use('/v1/financial/debt', debtRoutes);
app.use('/v1/financial/expenses', expensesRoutes);
app.use('/v1/financial/savings', savingsRoutes);
app.use('/v1/financial/all', comprehensiveRoutes);

const APP_ID_MAP = {
  income: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  debt: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  expenses: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  savings: process.env.DIFY_GRAYSON_FINANCE_APP_ID,
  chat: process.env.DIFY_GRAYSON_FINANCE_APP_ID
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
    chat: 'Welcome! How can I assist you today? You can ask about anything related to your finances.'
  };

  const opener = customOpeners[type];

  if (!opener) {
    console.warn(`[Server] ⚠️ Unknown prompt type received: "${type}"`);
    return res.status(400).json({ error: `No opening message defined for type "${type}"` });
  }

  try {
    const user = await getUserByClerkId(req.auth().userId);
    
    const { getConversationByType } = await import('./services/conversationService.js');
    
    const existingConversation = await getConversationByType(user.id, type);
    
    res.json({
      answer: opener,
      hasExistingConversation: !!existingConversation,
      conversationId: existingConversation?.id || null
    });
  } catch (error) {
    console.error('[Server] Error in opening endpoint:', error);
    
    if (error.message.includes('Database connection lost') || error.code === 'P1017') {
      console.warn('[Server] Database unavailable for conversation check, returning opener only');
    }
    
    res.json({
      answer: opener,
      hasExistingConversation: false,
      conversationId: null
    });
  }
});

app.post('/v1/conversations/:type', requireAuth(), async (req, res) => {
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
    const user = await getUserByClerkId(req.auth().userId);
    
    const { findOrCreateConversation } = await import('./services/conversationService.js');
    const { addMessagePair } = await import('./services/messageService.js');
    
    let conversation = await findOrCreateConversation(user.id, type);
    let difyConversationId = conversation.conversationId;
    
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

    if (conversation_id && isNewConversation) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { conversationId: conversation_id }
      });
      difyConversationId = conversation_id;
    }

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

async function getUserByClerkId(clerkUserId) {
  try {
    let user = await prisma.user.findUnique({
      where: { authId: clerkUserId }
    });
    
    if (!user) {
      console.log(`[Server] 👤 Creating new user for Clerk ID: ${clerkUserId}`);
      
      // Fetch full user data from Clerk before creating user
      let clerkUser = null;
      let email = null;
      let firstName = null;
      
      try {
        clerkUser = await clerkClient.users.getUser(clerkUserId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
        firstName = clerkUser.firstName || null;
        
        // Production-safe logging - avoid logging full email addresses
        const logEmail = process.env.NODE_ENV === 'production'
          ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
          : email;
          
        console.log(`[Server] 📥 Fetched Clerk user data:`, {
          clerkUserId,
          email: logEmail,
          firstName,
          emailAddressesLength: clerkUser.emailAddresses?.length || 0
        });
      } catch (clerkError) {
        console.warn(`[Server] ⚠️ Failed to fetch Clerk user data for ${clerkUserId}:`, clerkError.message);
        console.warn('[Server] ⚠️ Creating user with authId only - webhook will update later');
      }
      
      user = await prisma.user.create({
        data: {
          authId: clerkUserId,
          email: email,
          firstName: firstName
        }
      });
      
      console.log(`[Server] ✅ User created with data:`, {
        databaseId: user.id,
        authId: user.authId,
        email: user.email ? (process.env.NODE_ENV === 'production' ? user.email.replace(/(.{2}).*@/, '$1***@') : user.email) : 'null',
        firstName: user.firstName
      });
    }
    
    return user;
  } catch (error) {
    console.error('[Server] 💥 Database error in getUserByClerkId:', error);
    
    if (error.code === 'P1017' || error.message.includes('Server has closed the connection')) {
      throw new Error('Database connection lost. Please check your database connection and try again.');
    }
    
    throw error;
  }
}

app.get('/v1/user/me', requireAuth(), async (req, res) => {
  res.json({ auth: req.auth() });
});

app.get('/v1/user/profile', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth().userId;
    // console.log('[Server] 📥 Clerk user ID: ', clerkUserId);

    const user = await getUserByClerkId(clerkUserId);
    // console.log('[Server] 📥 User found: ', user);

    res.status(200).json({
      user: {
        id: user.id,
        clerkUserId: user.authId,
        email: user.email,
        firstName: user.firstName,
        modelPreference: user.modelPreference,
        currentSubscriptionId: user.currentSubscriptionId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      message: 'User profile retrieved successfully'
    });
  } catch (error) {
    console.error('[Server] ❌ Profile retrieval error:', error);

    if (error.message.includes('Database connection lost')) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({
        error: 'Failed to retrieve user profile'
      });
    }
  }
});

app.put('/v1/user/profile', requireAuth(), async (req, res) => {
  try {
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Denver',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    console.log(`[Server] 📥 Requesting user profile update at: ${timestamp}`);
    // console.log('[Server] 📥 Update user/profile req: ', req.body);

    const clerkUserId = req.auth().userId;
    // console.log('[Server] 📥 Clerk user ID: ', clerkUserId);

    const { email, firstName } = req.body;

    const user = await prisma.user.update({
      where: { authId: clerkUserId },
      data: {
        ...(email && { email }),
        ...(firstName && { firstName })
      }
    });

    // console.log('[Server] 📥 User updated: ', user);

    res.status(200).json({
      user: {
        id: user.id,
        clerkUserId: user.authId,
        email: user.email,
        firstName: user.firstName,
        modelPreference: user.modelPreference,
        currentSubscriptionId: user.currentSubscriptionId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      message: 'User profile updated successfully'
    });
  } catch (error) {
    console.error('[Server] ❌ Profile update error:', error);

    if (error.code === 'P1017' || error.message.includes('Server has closed the connection')) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({
        error: 'Failed to update user profile'
      });
    }
  }
});

app.get('/v1/user/financial-data', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth().userId;
    const user = await getUserByClerkId(clerkUserId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    ]);
    
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
    
    if (error.message.includes('Database connection lost') || error.code === 'P1017') {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve financial data' });
    }
  }
});

app.get('/v1/user-data', requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth().userId;
    const user = await getUserByClerkId(clerkUserId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    ]);
    
    const totalIncome = incomeSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalDebt = debtSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalExpenses = expenseSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalSavings = savingsSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);

    res.json({
      user: {
        id: user.id,
        authId: user.authId,
        email: user.email,
        firstName: user.firstName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
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
      },
      message: 'User data retrieved successfully'
    });
  } catch (error) {
    console.error('[Server] User data error:', error);
    
    if (error.message.includes('Database connection lost') || error.code === 'P1017') {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve user data' });
    }
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
    supportedEndpoints: [
      // Conversation endpoints
      ...Object.keys(APP_ID_MAP).map((t) => `/v1/conversations/${t}`),
      // Opening endpoints
      ...Object.keys(APP_ID_MAP).map((t) => `/v1/opening/${t}`),
      // User endpoints
      '/v1/user/profile',
      '/v1/user/financial-data',
      '/v1/user-data',
      // Financial endpoints
      '/v1/financial/income',
      '/v1/financial/debt',
      '/v1/financial/expenses',
      '/v1/financial/savings',
      '/v1/financial/all',
      // Message & Conversation API endpoints
      '/v1/conversations',
      '/v1/messages',
      // Status endpoint
      '/v1/status',
      // Webhook endpoints
      '/v1/webhooks'
    ]
  });
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err);
  
  // Handle Clerk auth errors
  if (err.message?.includes('Unauthorized') || err.status === 401) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError' || err.status === 422) {
    return res.status(422).json({
      error: 'Validation failed',
      details: err.details || err.message
    });
  }
  
  // Generic server error
  res.status(500).json({ error: 'Internal server error' });
});

// Global 404 handler - MUST be after all route definitions
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.warn('[Server] ⚠️ Database connection failed - server will start but some features may not work');
      console.warn('[Server] ⚠️ Please check your DATABASE_URL environment variable');
    } else {
      console.log('[Server] ✅ Database connection successful');
    }
    
    try {
      await prisma.$connect();
      console.log('[Server] ✅ Prisma client connected');
    } catch (error) {
      console.error('[Server] ❌ Prisma connection failed:', error.message);
      console.warn('[Server] ⚠️ Server will continue but database features may not work');
    }
    
    const server = app.listen(PORT, () => {
      console.log(`[Server] 🚀 ${process.env.NODE_ENV || 'development'} server running version ${latestVersion} on http://localhost:${PORT}`);
    });
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[Server] ❌ Port ${PORT} is already in use. Please use a different port or kill the process using this port.`);
        process.exit(1);
      } else {
        console.error('[Server] ❌ Server error:', error);
      }
    });
    
    return server;
  } catch (error) {
    console.error('[Server] 💥 Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('[Server] 💥 Server startup failed:', error);
  process.exit(1);
});
