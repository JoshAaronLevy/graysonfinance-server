import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all income sources for user
router.get('/', requireAuth(), async (req, res) => {
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
router.post('/', requireAuth(), async (req, res) => {
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
router.put('/:id', requireAuth(), async (req, res) => {
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

// Delete income source
router.delete('/:id', requireAuth(), async (req, res) => {
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

export default router;