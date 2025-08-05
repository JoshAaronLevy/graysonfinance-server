import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all debt sources for user
router.get('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
router.post('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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

// Update debt source
router.put('/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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

export default router;