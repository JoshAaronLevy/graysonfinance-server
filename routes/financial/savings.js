import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../../src/errors/index.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all savings sources for user
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const savingsSources = await prisma.savingsSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: savingsSources });
  } catch (error) {
    return next(wrapError('[GET /v1/financial/savings] fetch savings sources', error, {
      userId: req.auth().userId
    }));
  }
}));

// Create new savings source
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, notes } = req.body;
    
    if (!sourceName || !amount || !frequency) {
      throw new ValidationError('Missing required fields: sourceName, amount, frequency', {
        provided: { sourceName: !!sourceName, amount: !!amount, frequency: !!frequency }
      });
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
    return next(wrapError('[POST /v1/financial/savings] create savings source', error, {
      userId: req.auth().userId,
      sourceName: req.body.sourceName
    }));
  }
}));

// Update savings source
router.put('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[PUT /v1/financial/savings/${req.params.id}] update savings source`, error, {
      userId: req.auth().userId,
      savingsSourceId: req.params.id
    }));
  }
}));

// Delete savings source
router.delete('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[DELETE /v1/financial/savings/${req.params.id}] delete savings source`, error, {
      userId: req.auth().userId,
      savingsSourceId: req.params.id
    }));
  }
}));

export default router;