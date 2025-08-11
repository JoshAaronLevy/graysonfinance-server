import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';
import { clerkClient } from '@clerk/clerk-sdk-node';
import type { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  auth(): { userId: string };
  user?: User;
}

/**
 * Helper function to get user by Clerk ID
 * Creates user if doesn't exist
 * @param clerkUserId - The Clerk user ID from req.auth().userId
 * @returns The user object
 */
export const getUserByClerkId = async (clerkUserId: string): Promise<User> => {
  let user = await prisma.user.findUnique({
    where: { authId: clerkUserId }
  });
  
  if (!user) {
    console.log(`[Auth Middleware] 👤 Creating new user for Clerk ID: ${clerkUserId}`);
    
    // Fetch full user data from Clerk before creating user
    let clerkUser = null;
    let email: string | null = null;
    let firstName: string | null = null;
    
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
      const errorMessage = clerkError instanceof Error ? clerkError.message : 'Unknown error';
      console.warn(`[Auth Middleware] ⚠️ Failed to fetch Clerk user data for ${clerkUserId}:`, errorMessage);
      console.warn('[Auth Middleware] ⚠️ Creating user with authId only - webhook will update later');
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
};

/**
 * Middleware to attach user to request object
 * Requires Clerk's requireAuth() to be applied first
 */
export const attachUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.auth()?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserByClerkId(req.auth().userId);
    req.user = user;
    next();
  } catch (error) {
    console.error('Error in attachUser middleware:', error);
    res.status(500).json({ error: 'Failed to authenticate user' });
  }
};

/**
 * Custom auth middleware that ensures JSON responses
 * Use this instead of requireAuth() for API endpoints that need guaranteed JSON
 */
export const requireJsonAuth = () => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // First check if we have auth
      if (!req.auth || typeof req.auth !== 'function') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      
      const auth = req.auth();
      if (!auth?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get user and attach to request
      const user = await getUserByClerkId(auth.userId);
      req.user = user;
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in requireJsonAuth:', error);
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      res.status(500).json({ error: 'Authentication failed' });
    }
  };
};

export type { AuthRequest };