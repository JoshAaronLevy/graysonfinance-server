import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../../src/errors/index.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all expense sources for user
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const expenseSources = await prisma.expenseSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: expenseSources });
  } catch (error) {
    return next(wrapError('[GET /v1/financial/expenses] fetch expense sources', error, {
      userId: req.auth().userId
    }));
  }
}));

// Create new expense source
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      throw new ValidationError('Missing required fields: sourceName, amount, frequency', {
        provided: { sourceName: !!sourceName, amount: !!amount, frequency: !!frequency }
      });
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
    return next(wrapError('[POST /v1/financial/expenses] create expense source', error, {
      userId: req.auth().userId,
      sourceName: req.body.sourceName
    }));
  }
}));

// Update expense source
router.put('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[PUT /v1/financial/expenses/${req.params.id}] update expense source`, error, {
      userId: req.auth().userId,
      expenseSourceId: req.params.id
    }));
  }
}));

// Delete expense source
router.delete('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[DELETE /v1/financial/expenses/${req.params.id}] delete expense source`, error, {
      userId: req.auth().userId,
      expenseSourceId: req.params.id
    }));
  }
}));

export default router;