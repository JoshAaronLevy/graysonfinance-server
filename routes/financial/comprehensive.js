import express from 'express';
import { requireAuth } from '@clerk/express';
import { PrismaClient } from '@prisma/client';
import { getUserByClerkId } from '../../middleware/auth.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';
import { wrapError } from '../../src/errors/index.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all financial data for user (for LLM context)
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
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
    return next(wrapError('[GET /v1/financial/all] fetch comprehensive financial data', error, {
      userId: req.auth().userId
    }));
  }
}));

export default router;