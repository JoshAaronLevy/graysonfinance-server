import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../../src/errors/index.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all debt sources for user
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const debtSources = await prisma.debtSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: debtSources });
  } catch (error) {
    return next(wrapError('[GET /v1/financial/debt] fetch debt sources', error, {
      userId: req.auth().userId
    }));
  }
}));

// Create new debt source
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { sourceName, amount, frequency, interestRate, minPayment, notes } = req.body;
    
    if (!sourceName || !amount || !frequency || !interestRate) {
      throw new ValidationError('Missing required fields: sourceName, amount, frequency, interestRate', {
        provided: {
          sourceName: !!sourceName,
          amount: !!amount,
          frequency: !!frequency,
          interestRate: !!interestRate
        }
      });
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
    return next(wrapError('[POST /v1/financial/debt] create debt source', error, {
      userId: req.auth().userId,
      sourceName: req.body.sourceName
    }));
  }
}));

// Update debt source
router.put('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[PUT /v1/financial/debt/${req.params.id}] update debt source`, error, {
      userId: req.auth().userId,
      debtSourceId: req.params.id
    }));
  }
}));

// Delete debt source
router.delete('/:id', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError(`[DELETE /v1/financial/debt/${req.params.id}] delete debt source`, error, {
      userId: req.auth().userId,
      debtSourceId: req.params.id
    }));
  }
}));

export default router;