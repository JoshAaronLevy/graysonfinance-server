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

// Get all savings sources for user
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.put('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
router.delete('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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

export default router;