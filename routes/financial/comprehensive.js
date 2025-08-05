import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all financial data for user (for LLM context)
router.get('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    
    const [incomeSources, debtSources, expenseSources, savingsSources] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.debtSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.expenseSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.savingsSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
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
        savings: savingsSources
      }
    });
  } catch (error) {
    console.error('Error fetching all financial data:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

export default router;