/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { requireAuth } from '@clerk/express';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { testConnection } from './db/neon.js';
import clerkWebhookRouter from './routes/webhooks/clerk.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import incomeRoutes from './routes/financial/income.js';
import debtRoutes from './routes/financial/debt.js';
import expensesRoutes from './routes/financial/expenses.js';
import savingsRoutes from './routes/financial/savings.js';
import comprehensiveRoutes from './routes/financial/comprehensive.js';
import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';

const latestVersion = '2.0.0'; // Update this with each release, and in the package.json, using semantic versioning

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});

dotenv.config();

process.on('uncaughtException', (error: Error) => {
  console.error('[Server] 💥 Uncaught Exception:', error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('[Server] 💥 Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('[Server] 🛑 SIGTERM received, shutting down gracefully');
  void prisma.$disconnect().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] 🛑 SIGINT received, shutting down gracefully');
  void prisma.$disconnect().then(() => {
    process.exit(0);
  });
});

interface AuthRequest extends Request {
  auth(): { userId: string };
}

const app = express();
app.use(cors({
  credentials: true,
  origin: [
    'http://localhost:4200',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    process.env.FRONTEND_URL
  ].filter((url): url is string => Boolean(url))
}));

app.use('/v1/webhooks', clerkWebhookRouter);

app.use(express.json());

const handleAuthError = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data: unknown) {
    if (res.statusCode === 401 || res.statusCode === 403) {
      return res.status(res.statusCode).json({
        error: res.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        message: 'Authentication required to access this resource'
      });
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data: unknown) {
    if ((res.statusCode === 401 || res.statusCode === 403) && !(data as Record<string, unknown>)?.error) {
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

// Mount route modules
app.use('/v1/conversations', conversationRoutes);
app.use('/v1/messages', requireAuth(), messageRoutes);
app.use('/v1/financial/income', incomeRoutes);
app.use('/v1/financial/debt', debtRoutes);
app.use('/v1/financial/expenses', expensesRoutes);
app.use('/v1/financial/savings', savingsRoutes);
app.use('/v1/financial/all', comprehensiveRoutes);

// Add income-sources alias endpoints for backward compatibility
app.post('/v1/income-sources', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  // Reuse the existing income routes handler
  req.url = '/';
  incomeRoutes(req, res, next);
});
app.get('/v1/income-sources', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  // Reuse the existing income routes handler
  req.url = '/';
  incomeRoutes(req, res, next);
});
app.put('/v1/income-sources/:id', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  // Reuse the existing income routes handler - preserve the :id param
  req.url = `/${req.params.id}`;
  incomeRoutes(req, res, next);
});
app.delete('/v1/income-sources/:id', requireAuth(), (req: Request, res: Response, next: NextFunction) => {
  // Reuse the existing income routes handler - preserve the :id param
  req.url = `/${req.params.id}`;
  incomeRoutes(req, res, next);
});


interface AppIdMap {
  [key: string]: string | undefined;
}

const APP_ID_MAP: AppIdMap = {
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

app.post('/v1/opening/:type', requireAuth(), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const type = req.params?.type?.toLowerCase();

  interface CustomOpeners {
    [key: string]: string;
  }

  const customOpeners: CustomOpeners = {
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
    const user = await getUserByClerkId(authReq.auth().userId);
    
    const { getConversationByType } = await import('./services/conversationService.js');
    
    const existingConversation = await getConversationByType(user.id, type);
    
    res.json({
      answer: opener,
      hasExistingConversation: !!existingConversation,
      conversationId: existingConversation?.id || null
    });
  } catch (error) {
    console.error('[Server] Error in opening endpoint:', error);
    
    if (error instanceof Error && (error.message.includes('Database connection lost') || (error as any).code === 'P1017')) {
      console.warn('[Server] Database unavailable for conversation check, returning opener only');
    }
    
    res.json({
      answer: opener,
      hasExistingConversation: false,
      conversationId: null
    });
  }
});

app.post('/v1/conversations/:type', requireAuth(), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
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
    const user = await getUserByClerkId(authReq.auth().userId);
    
    const { findOrCreateConversation } = await import('./services/conversationService.js');
    const { addMessagePair } = await import('./services/messageService.js');
    
    const conversation = await findOrCreateConversation(user.id, type);
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
  } catch (error: any) {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data || error.message;

    console.error('[Server] 🔥 Full error object:', error);
    console.error('[Server] 🔥 Error response data:', errorData);

    res.status(statusCode).json({ error: errorData });
  }
});

async function getUserByClerkId(clerkUserId: string): Promise<User> {
  try {
    let user = await prisma.user.findUnique({
      where: { authId: clerkUserId }
    });
    
    if (!user) {
      console.log(`[Server] 👤 Creating new user for Clerk ID: ${clerkUserId}`);
      
      // Fetch full user data from Clerk before creating user
      let clerkUser = null;
      let email: string | null = null;
      let firstName: string | null = null;
      
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
        const errorMessage = clerkError instanceof Error ? clerkError.message : 'Unknown error';
        console.warn(`[Server] ⚠️ Failed to fetch Clerk user data for ${clerkUserId}:`, errorMessage);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: string }).code;
    console.error('[Server] 💥 Database error in getUserByClerkId:', error);
    
    if (errorCode === 'P1017' || errorMessage.includes('Server has closed the connection')) {
      throw new Error('Database connection lost. Please check your database connection and try again.');
    }
    
    throw error;
  }
}

app.get('/v1/user/me', requireAuth(), async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  res.json({ auth: authReq.auth() });
});

app.get('/v1/user/profile', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const clerkUserId = authReq.auth().userId;
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Server] ❌ Profile retrieval error:', error);

    if (errorMessage.includes('Database connection lost')) {
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

app.put('/v1/user/profile', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
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

    const clerkUserId = authReq.auth().userId;
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: string }).code;
    console.error('[Server] ❌ Profile update error:', error);

    if (errorCode === 'P1017' || errorMessage.includes('Server has closed the connection')) {
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

app.get('/v1/user/financial-data', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const clerkUserId = authReq.auth().userId;
    const user = await getUserByClerkId(clerkUserId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    ]);
    
    const totalIncome = incomeSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalDebt = debtSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalExpenses = expenseSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalSavings = savingsSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: string }).code;
    console.error('[Server] Financial data error:', error);
    
    if (errorMessage.includes('Database connection lost') || errorCode === 'P1017') {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve financial data' });
    }
  }
});

app.get('/v1/user-data', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const clerkUserId = authReq.auth().userId;
    const user = await getUserByClerkId(clerkUserId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    ]);
    
    const totalIncome = incomeSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalDebt = debtSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalExpenses = expenseSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);
    const totalSavings = savingsSources.reduce((sum, source) => sum + parseFloat(source.amount.toString()), 0);

    res.json({
      success: true,
      user: {
        id: user.id,
        clerkUserId: user.authId,
        email: user.email,
        firstName: user.firstName,
        modelPreference: user.modelPreference
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
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as { code?: string }).code;
    console.error('[Server] User data error:', error);
    
    if (errorMessage.includes('Database connection lost') || errorCode === 'P1017') {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issue. Please try again in a moment.'
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve user data' });
    }
  }
});

app.get('/v1/status', (req: Request, res: Response) => {
  res.json({
    status: 'running',
    version: latestVersion,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/v1/health', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    version: latestVersion,
    supportedEndpoints: [
      'GET /v1/health',
      'GET /v1/user/me',
      'GET /v1/user/profile',
      'PUT /v1/user/profile',
      'GET /v1/user/financial-data',
      'GET /v1/user-data',
      'POST /v1/opening/:type',
      'POST /v1/conversations/:type',
      'GET /v1/conversations',
      'POST /v1/conversations',
      'GET /v1/conversations/:id',
      'GET /v1/conversations/income',
      'POST /v1/conversations/income',
      'GET /v1/conversations/:conversationId/messages',
      'PATCH /v1/conversations/:conversationId/messages',
      'POST /v1/messages',
      'GET /v1/messages/:id',
      'PUT /v1/messages/:id',
      'DELETE /v1/messages/:id',
      'POST /v1/financial/income',
      'GET /v1/financial/income',
      'PUT /v1/financial/income/:id',
      'DELETE /v1/financial/income/:id'
    ]
  });
});

// 404 handler - using proper Express catch-all syntax
app.use((req: Request, res: Response) => {
  if (req.originalUrl.startsWith('/v1/')) {
    return res.status(422).json({
      error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      suggestion: 'Check /v1/health for supported endpoints'
    });
  }
  res.status(404).json({ error: 'Not found' });
});

// Generic error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server] 💥 Unhandled error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT) || 3000;
  
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('[Server] ⚠️  Database connection failed, but starting server anyway...');
    } else {
      console.log('[Server] ✅ Database connection successful');
    }
    
    // Start the server
    app.listen(port, () => {
      console.log(`[Server] 🚀 Server running on port ${port}`);
      console.log(`[Server] 🌐 Health check: http://localhost:${port}/v1/health`);
      console.log(`[Server] 📖 Version: ${latestVersion}`);
      console.log(`[Server] 🗃️  Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('[Server] 💥 Failed to start server:', error);
    process.exit(1);
  }
}

// Only start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    console.error('[Server] 💥 Server startup failed:', error);
    process.exit(1);
  });
}

export default app;