import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Helper function to get user by Clerk ID
 * Creates user if doesn't exist
 * @param {string} clerkUserId - The Clerk user ID from req.auth().userId
 * @returns {Promise<Object>} The user object
 */
export const getUserByClerkId = async (clerkUserId) => {
  let user = await prisma.user.findUnique({
    where: { authId: clerkUserId }
  });
  
  if (!user) {
    // Create user if doesn't exist
    user = await prisma.user.create({
      data: { authId: clerkUserId }
    });
  }
  
  return user;
};

/**
 * Middleware to attach user to request object
 * Requires Clerk's requireAuth() to be applied first
 */
export const attachUser = async (req, res, next) => {
  try {
    if (!req.auth()?.userId) {
      return res.status(401).json({ error: 'Unauthorized - No Clerk user ID found' });
    }

    const user = await getUserByClerkId(req.auth().userId);
    req.user = user;
    next();
  } catch (error) {
    console.error('Error in attachUser middleware:', error);
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
};