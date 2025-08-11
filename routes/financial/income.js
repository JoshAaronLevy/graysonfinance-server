import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../../src/errors/index.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all income sources for user
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const incomeSources = await prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: incomeSources });
  } catch (error) {
    return next(wrapError('[GET /v1/financial/income] fetch income sources', error, {
      userId: req.auth().userId
    }));
  }
}));

// Create new income source
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      throw new ValidationError('Missing required fields: sourceName, amount, frequency', {
        provided: { sourceName: !!sourceName, amount: !!amount, frequency: !!frequency }
      });
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
    return next(wrapError('[POST /v1/financial/income] create income source', error, {
      userId: req.auth().userId,
      sourceName: req.body.sourceName
    }));
  }
}));

// Update income source
router.put('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[PUT /v1/financial/income/${req.params.id}] update income source`, error, {
      userId: req.auth().userId,
      incomeSourceId: req.params.id
    }));
  }
}));

// Delete income source
router.delete('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[DELETE /v1/financial/income/${req.params.id}] delete income source`, error, {
      userId: req.auth().userId,
      incomeSourceId: req.params.id
    }));
  }
}));

export default router;