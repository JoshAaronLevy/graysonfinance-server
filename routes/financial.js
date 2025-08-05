import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

async function getUserByClerkId(clerkUserId) {
  let user = await prisma.user.findUnique({
    where: { authId: clerkUserId }
  });
  
  if (!user) {
    user = await prisma.user.create({
      data: { authId: clerkUserId }
    });
  }
  
  return user;
}

// ============== INCOME SOURCES ==============

router.get('/income', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: incomeSources });
  } catch (error) {
    console.error('Error fetching income sources:', error);
    res.status(500).json({ error: 'Failed to fetch income sources' });
  }
});

// Create new income source
router.post('/income', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      return res.status(400).json({ error: 'Missing required fields: sourceName, amount, frequency' });
    }
    
    const incomeSource = await prisma.incomeSource.create({
      data: {
        userId: user.id,
        sourceName,
        amount: parseFloat(amount),
        frequency,
        notes: notes || null
      }
    });
    
    res.status(201).json({ success: true, data: incomeSource });
  } catch (error) {
    console.error('Error creating income source:', error);
    res.status(500).json({ error: 'Failed to create income source' });
  }
});

// Update income source
router.put('/income/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    const { sourceName, amount, frequency, notes } = req.body;
    
    const incomeSource = await prisma.incomeSource.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(sourceName && { sourceName }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(frequency && { frequency }),
        ...(notes !== undefined && { notes })
      }
    });
    
    if (incomeSource.count === 0) {
      return res.status(404).json({ error: 'Income source not found' });
    }
    
    const updatedSource = await prisma.incomeSource.findUnique({ where: { id } });
    res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error('Error updating income source:', error);
    res.status(500).json({ error: 'Failed to update income source' });
  }
});

router.delete('/income/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    
    const deleted = await prisma.incomeSource.deleteMany({
      where: { id, userId: user.id }
    });
    
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Income source not found' });
    }
    
    res.json({ success: true, message: 'Income source deleted successfully' });
  } catch (error) {
    console.error('Error deleting income source:', error);
    res.status(500).json({ error: 'Failed to delete income source' });
  }
});

// ============== DEBT SOURCES ==============

// Get all debt sources for user
router.get('/debt', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const debtSources = await prisma.debtSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: debtSources });
  } catch (error) {
    console.error('Error fetching debt sources:', error);
    res.status(500).json({ error: 'Failed to fetch debt sources' });
  }
});

// Create new debt source
router.post('/debt', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, interestRate, minPayment, notes } = req.body;
    
    if (!sourceName || !amount || !frequency || !interestRate) {
      return res.status(400).json({ error: 'Missing required fields: sourceName, amount, frequency, interestRate' });
    }
    
    const debtSource = await prisma.debtSource.create({
      data: {
        userId: user.id,
        sourceName,
        amount: parseFloat(amount),
        frequency,
        interestRate: parseFloat(interestRate),
        minPayment: minPayment ? parseFloat(minPayment) : null,
        notes: notes || null
      }
    });
    
    res.status(201).json({ success: true, data: debtSource });
  } catch (error) {
    console.error('Error creating debt source:', error);
    res.status(500).json({ error: 'Failed to create debt source' });
  }
});

router.put('/debt/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    const { sourceName, amount, frequency, interestRate, minPayment, notes } = req.body;
    
    const debtSource = await prisma.debtSource.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(sourceName && { sourceName }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(frequency && { frequency }),
        ...(interestRate && { interestRate: parseFloat(interestRate) }),
        ...(minPayment !== undefined && { minPayment: minPayment ? parseFloat(minPayment) : null }),
        ...(notes !== undefined && { notes })
      }
    });
    
    if (debtSource.count === 0) {
      return res.status(404).json({ error: 'Debt source not found' });
    }
    
    const updatedSource = await prisma.debtSource.findUnique({ where: { id } });
    res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error('Error updating debt source:', error);
    res.status(500).json({ error: 'Failed to update debt source' });
  }
});

// Delete debt source
router.delete('/debt/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    
    const deleted = await prisma.debtSource.deleteMany({
      where: { id, userId: user.id }
    });
    
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Debt source not found' });
    }
    
    res.json({ success: true, message: 'Debt source deleted successfully' });
  } catch (error) {
    console.error('Error deleting debt source:', error);
    res.status(500).json({ error: 'Failed to delete debt source' });
  }
});

// ============== EXPENSE SOURCES ==============

// Get all expense sources for user
router.get('/expenses', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const expenseSources = await prisma.expenseSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: expenseSources });
  } catch (error) {
    console.error('Error fetching expense sources:', error);
    res.status(500).json({ error: 'Failed to fetch expense sources' });
  }
});

// Create new expense source
router.post('/expenses', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      return res.status(400).json({ error: 'Missing required fields: sourceName, amount, frequency' });
    }
    
    const expenseSource = await prisma.expenseSource.create({
      data: {
        userId: user.id,
        sourceName,
        amount: parseFloat(amount),
        frequency,
        notes: notes || null
      }
    });
    
    res.status(201).json({ success: true, data: expenseSource });
  } catch (error) {
    console.error('Error creating expense source:', error);
    res.status(500).json({ error: 'Failed to create expense source' });
  }
});

// Update expense source
router.put('/expenses/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    const { sourceName, amount, frequency, notes } = req.body;
    
    const expenseSource = await prisma.expenseSource.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(sourceName && { sourceName }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(frequency && { frequency }),
        ...(notes !== undefined && { notes })
      }
    });
    
    if (expenseSource.count === 0) {
      return res.status(404).json({ error: 'Expense source not found' });
    }
    
    const updatedSource = await prisma.expenseSource.findUnique({ where: { id } });
    res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error('Error updating expense source:', error);
    res.status(500).json({ error: 'Failed to update expense source' });
  }
});

// Delete expense source
router.delete('/expenses/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    
    const deleted = await prisma.expenseSource.deleteMany({
      where: { id, userId: user.id }
    });
    
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Expense source not found' });
    }
    
    res.json({ success: true, message: 'Expense source deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense source:', error);
    res.status(500).json({ error: 'Failed to delete expense source' });
  }
});

// ============== SAVINGS SOURCES ==============

// Get all savings sources for user
router.get('/savings', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const savingsSources = await prisma.savingsSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: savingsSources });
  } catch (error) {
    console.error('Error fetching savings sources:', error);
    res.status(500).json({ error: 'Failed to fetch savings sources' });
  }
});

// Create new savings source
router.post('/savings', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      return res.status(400).json({ error: 'Missing required fields: sourceName, amount, frequency' });
    }
    
    const savingsSource = await prisma.savingsSource.create({
      data: {
        userId: user.id,
        sourceName,
        amount: parseFloat(amount),
        frequency,
        notes: notes || null
      }
    });
    
    res.status(201).json({ success: true, data: savingsSource });
  } catch (error) {
    console.error('Error creating savings source:', error);
    res.status(500).json({ error: 'Failed to create savings source' });
  }
});

// Update savings source
router.put('/savings/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    const { sourceName, amount, frequency, notes } = req.body;
    
    const savingsSource = await prisma.savingsSource.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(sourceName && { sourceName }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(frequency && { frequency }),
        ...(notes !== undefined && { notes })
      }
    });
    
    if (savingsSource.count === 0) {
      return res.status(404).json({ error: 'Savings source not found' });
    }
    
    const updatedSource = await prisma.savingsSource.findUnique({ where: { id } });
    res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error('Error updating savings source:', error);
    res.status(500).json({ error: 'Failed to update savings source' });
  }
});

// Delete savings source
router.delete('/savings/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { id } = req.params;
    
    const deleted = await prisma.savingsSource.deleteMany({
      where: { id, userId: user.id }
    });
    
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Savings source not found' });
    }
    
    res.json({ success: true, message: 'Savings source deleted successfully' });
  } catch (error) {
    console.error('Error deleting savings source:', error);
    res.status(500).json({ error: 'Failed to delete savings source' });
  }
});

// ============== COMPREHENSIVE DATA ==============

// Get all financial data for user (for LLM context)
router.get('/all', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources, chats] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.chat.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    
    // Calculate totals
    const totalIncome = incomeSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalDebt = debtSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalExpenses = expenseSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    const totalSavings = savingsSources.reduce((sum, source) => sum + parseFloat(source.amount), 0);
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          authId: user.authId,
          email: user.email
        },
        summary: {
          totalIncome,
          totalDebt,
          totalExpenses,
          totalSavings,
          netCashFlow: totalIncome - totalExpenses
        },
        income: incomeSources,
        debt: debtSources,
        expenses: expenseSources,
        savings: savingsSources,
        recentChats: chats
      }
    });
  } catch (error) {
    console.error('Error fetching all financial data:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

// ============== CHAT MESSAGES ==============

router.get('/chat/:chatType', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { chatType } = req.params;
    const { limit = 50 } = req.query;
    
    const chats = await prisma.chat.findMany({
      where: { 
        userId: user.id,
        chatType: chatType.toUpperCase()
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    
    res.json({ success: true, data: chats });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Add new chat message
router.post('/chat', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { chatType, message, response, conversationId } = req.body;
    
    if (!chatType || !message || !response || !conversationId) {
      return res.status(400).json({ error: 'Missing required fields: chatType, message, response, conversationId' });
    }
    
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        chatType: chatType.toUpperCase(),
        message,
        response,
        conversationId
      }
    });
    
    res.status(201).json({ success: true, data: chat });
  } catch (error) {
    console.error('Error creating chat message:', error);
    res.status(500).json({ error: 'Failed to create chat message' });
  }
});

export default router;