import { PrismaClient } from '@prisma/client';
import { clerkClient } from '@clerk/clerk-sdk-node';

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