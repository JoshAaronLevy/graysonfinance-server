import { PrismaClient } from '@prisma/client';
import { clerkClient } from '@clerk/clerk-sdk-node';
import { wrapError, ExternalServiceError } from '../src/errors/index.js';

const prisma = new PrismaClient();

/**
 * Helper function to get user by Clerk ID
 * Creates user if doesn't exist
 * @param {string} clerkUserId - The Clerk user ID from req.auth().userId
 * @returns {Promise<Object>} The user object
 */
export const getUserByClerkId = async (clerkUserId) => {
  try {
    let user = await prisma.user.findUnique({
      where: { authId: clerkUserId }
    });
    
    if (!user) {
      console.log(`[Auth Middleware] 👤 Creating new user for Clerk ID: ${clerkUserId}`);
      
      // Fetch full user data from Clerk before creating user
      let clerkUser = null;
      let email = null;
      let firstName = null;
      
      try {
        clerkUser = await clerkClient.users.getUser(clerkUserId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
        firstName = clerkUser.firstName || null;
        
        // Production-safe logging - avoid logging full email addresses
        const logEmail = process.env.NODE_ENV === 'production'
          ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
          : email;
          
        console.log(`[Auth Middleware] 📥 Fetched Clerk user data:`, {
          clerkUserId,
          email: logEmail,
          firstName,
          emailAddressesLength: clerkUser.emailAddresses?.length || 0
        });
      } catch (clerkError) {
        console.warn(`[Auth Middleware] ⚠️ Failed to fetch Clerk user data for ${clerkUserId}:`, clerkError.message);
        console.warn('[Auth Middleware] ⚠️ Creating user with authId only - webhook will update later');
        // Don't throw here - continue with user creation using authId only
      }
      
      user = await prisma.user.create({
        data: {
          authId: clerkUserId,
          email: email,
          firstName: firstName
        }
      });
      
      console.log(`[Auth Middleware] ✅ User created with data:`, {
        databaseId: user.id,
        authId: user.authId,
        email: user.email ? (process.env.NODE_ENV === 'production' ? user.email.replace(/(.{2}).*@/, '$1***@') : user.email) : 'null',
        firstName: user.firstName
      });
    }
    
    return user;
  } catch (error) {
    throw wrapError('[AuthMiddleware.getUserByClerkId]', error, { clerkUserId });
  }
};

/**
 * Middleware to attach user to request object
 * Requires Clerk's requireAuth() to be applied first
 */
export const attachUser = async (req, res, next) => {
  try {
    if (!req.auth()?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserByClerkId(req.auth().userId);
    req.user = user;
    next();
  } catch (error) {
    const wrappedError = wrapError('[AuthMiddleware.attachUser]', error, {
      userId: req.auth()?.userId
    });
    // TODO(josh): Consider using next(wrappedError) for consistent error handling
    console.error('Error in attachUser middleware:', wrappedError);
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
};

/**
 * Custom auth middleware that ensures JSON responses
 * Use this instead of requireAuth() for API endpoints that need guaranteed JSON
 */
export const requireJsonAuth = () => {
  return async (req, res, next) => {
    try {
      // First check if we have auth
      if (!req.auth || typeof req.auth !== 'function') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const auth = req.auth();
      if (!auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user and attach to request
      const user = await getUserByClerkId(auth.userId);
      req.user = user;
      next();
    } catch (error) {
      const wrappedError = wrapError('[AuthMiddleware.requireJsonAuth]', error, {
        hasAuth: !!req.auth,
        userId: req.auth?.()?.userId
      });
      // TODO(josh): Consider using next(wrappedError) for consistent error handling
      console.error('Error in requireJsonAuth:', wrappedError);
      if (error.message.includes('Unauthorized') || error.message.includes('authentication')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
};