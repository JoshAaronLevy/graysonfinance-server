import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

interface AuthRequest extends Request {
  auth(): { userId: string };
}

// Get all expense sources for user
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.put('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.delete('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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

export default router;