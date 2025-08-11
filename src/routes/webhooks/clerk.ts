/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Request, Response } from 'express';
import { Webhook } from 'svix';

const router = express.Router();

router.post('/clerk', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const startTime = Date.now();
  let evt: any = undefined;

  try {
    // Validate request has body
    if (!req.body || req.body.length === 0) {
      console.error('[Clerk Webhook] ❌ Empty request body');
      return res.status(400).json({ error: 'Request body is required' });
    }

    // Extract and validate webhook headers
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    const missingHeaders = [];
    if (!svix_id) missingHeaders.push('svix-id');
    if (!svix_timestamp) missingHeaders.push('svix-timestamp');
    if (!svix_signature) missingHeaders.push('svix-signature');

    if (missingHeaders.length > 0) {
      console.error(`[Clerk Webhook] ❌ Missing webhook headers: ${missingHeaders.join(', ')}`);
      return res.status(400).json({
        error: 'Missing required webhook headers',
        missingHeaders
      });
    }

    // Validate environment configuration
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Clerk Webhook] ❌ CLERK_WEBHOOK_SECRET not configured in environment');
      return res.status(500).json({ error: 'Server configuration error: webhook secret missing' });
    }

    // Verify webhook signature with enhanced error handling
    const wh = new Webhook(webhookSecret);

    try {
      const payload = req.body.toString();

      // Add basic payload validation
      if (!payload || payload.length < 10) {
        console.error('[Clerk Webhook] ❌ Invalid payload: too short or empty');
        return res.status(400).json({ error: 'Invalid payload format' });
      }

      evt = wh.verify(payload, {
        'svix-id': svix_id as string,
        'svix-timestamp': svix_timestamp as string,
        'svix-signature': svix_signature as string
      });
    } catch (err: any) {
      console.error('[Clerk Webhook] ❌ Webhook verification failed:', {
        error: err.message,
        errorCode: err.code || 'VERIFICATION_FAILED',
        svixId: svix_id
      });
      return res.status(401).json({ error: 'Webhook verification failed' });
    }

    // Validate event structure
    if (!evt || typeof evt !== 'object') {
      console.error('[Clerk Webhook] ❌ Invalid event structure after verification');
      return res.status(400).json({ error: 'Invalid event data structure' });
    }

    if (!evt.type || !evt.data) {
      console.error('[Clerk Webhook] ❌ Event missing required fields:', {
        hasType: !!evt.type,
        hasData: !!evt.data
      });
      return res.status(400).json({ error: 'Event missing required fields' });
    }

    console.log(`[Clerk Webhook] 📨 Received event: ${evt.type} (svix-id: ${svix_id})`);

    // Only handle specific user events
    const supportedEvents = ['user.created', 'user.updated', 'user.deleted'];
    if (!supportedEvents.includes(evt.type)) {
      console.log(`[Clerk Webhook] ℹ️ Event ignored: ${evt.type} (not in supported events: ${supportedEvents.join(', ')})`);
      return res.status(200).json({ message: 'Event type not handled', eventType: evt.type });
    }

    if (evt.type === 'user.created') {
      const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;

      // Extract data with comprehensive logging for debugging
      const email = email_addresses?.[0]?.email_address || null;
      const firstName = first_name || null;

      // Production-safe logging - avoid logging full email addresses
      const logEmail = process.env.NODE_ENV === 'production'
        ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
        : email;

      console.log(`[Clerk Webhook] 📥 Raw payload data:`, {
        clerkUserId,
        emailAddressesLength: email_addresses?.length || 0,
        firstEmailExists: !!email_addresses?.[0]?.email_address,
        firstName: first_name,
        lastName: last_name
      });

      console.log(`[Clerk Webhook] 📊 Extracted values:`, {
        clerkUserId,
        email: logEmail,
        firstName,
        emailIsNull: email === null,
        firstNameIsNull: firstName === null
      });

      console.log(`[Clerk Webhook] 🔄 Creating user: clerk_user_id=${clerkUserId}, email=${logEmail}, firstName=${firstName}`);

      // Validate critical fields
      if (!clerkUserId) {
        console.error('[Clerk Webhook] ❌ Missing clerk user ID in payload');
        return res.status(400).json({ error: 'Missing clerk user ID' });
      }

      if (!email) {
        console.warn('[Clerk Webhook] ⚠️ No email found in payload - user will have null email');
      }

      if (!firstName) {
        console.warn('[Clerk Webhook] ⚠️ No first_name found in payload - user will have null firstName');
      }

      try {
        // Use Prisma to create user in database
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const user = await prisma.user.upsert({
          where: { authId: clerkUserId },
          update: {
            email: email,
            firstName: firstName
          },
          create: {
            authId: clerkUserId,
            email: email,
            firstName: firstName
          }
        });

        console.log(`[Clerk Webhook] ✅ User created/updated in database:`, {
          databaseId: user.id,
          authId: user.authId,
          email: user.email ? (process.env.NODE_ENV === 'production' ? user.email.replace(/(.{2}).*@/, '$1***@') : user.email) : 'null',
          firstName: user.firstName,
          createdAt: user.createdAt
        });

        await prisma.$disconnect();
      } catch (dbError: any) {
        console.error('[Clerk Webhook] ❌ Database error creating user:', {
          error: dbError.message,
          code: dbError.code,
          clerkUserId,
          email: logEmail,
          firstName
        });
        return res.status(500).json({ error: 'Database error creating user' });
      }
    } else if (evt.type === 'user.updated') {
      const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;

      // Extract data with comprehensive logging for debugging
      const email = email_addresses?.[0]?.email_address || null;
      const firstName = first_name || null;

      // Production-safe logging - avoid logging full email addresses
      const logEmail = process.env.NODE_ENV === 'production'
        ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
        : email;

      console.log(`[Clerk Webhook] 📥 Raw payload data (user.updated):`, {
        clerkUserId,
        emailAddressesLength: email_addresses?.length || 0,
        firstEmailExists: !!email_addresses?.[0]?.email_address,
        firstName: first_name,
        lastName: last_name
      });

      console.log(`[Clerk Webhook] 📊 Extracted values (user.updated):`, {
        clerkUserId,
        email: logEmail,
        firstName,
        emailIsNull: email === null,
        firstNameIsNull: firstName === null
      });

      console.log(`[Clerk Webhook] 🔄 Updating user: clerk_user_id=${clerkUserId}, email=${logEmail}, firstName=${firstName}`);

      // Validate critical fields
      if (!clerkUserId) {
        console.error('[Clerk Webhook] ❌ Missing clerk user ID in update payload');
        return res.status(400).json({ error: 'Missing clerk user ID' });
      }

      try {
        // Use Prisma to update user in database
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const user = await prisma.user.upsert({
          where: { authId: clerkUserId },
          update: {
            email: email,
            firstName: firstName
          },
          create: {
            authId: clerkUserId,
            email: email,
            firstName: firstName
          }
        });

        console.log(`[Clerk Webhook] ✅ User updated in database:`, {
          databaseId: user.id,
          authId: user.authId,
          email: user.email ? (process.env.NODE_ENV === 'production' ? user.email.replace(/(.{2}).*@/, '$1***@') : user.email) : 'null',
          firstName: user.firstName,
          updatedAt: user.updatedAt
        });

        await prisma.$disconnect();
      } catch (dbError: any) {
        console.error('[Clerk Webhook] ❌ Database error updating user:', {
          error: dbError.message,
          code: dbError.code,
          clerkUserId,
          email: logEmail,
          firstName
        });
        return res.status(500).json({ error: 'Database error updating user' });
      }
    } else if (evt.type === 'user.deleted') {
      const { id: clerkUserId } = evt.data;

      console.log(`[Clerk Webhook] Deleting user: ${clerkUserId}`);

      try {
        // Use Prisma to delete user from database
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const deletedUser = await prisma.user.delete({
          where: { authId: clerkUserId }
        });

        console.log(`[Clerk Webhook] ✅ User deleted successfully: ${deletedUser.id}`);
        await prisma.$disconnect();
      } catch (dbError: any) {
        if (dbError.code === 'P2025') {
          console.log(`[Clerk Webhook] ⚠️ User not found for deletion: ${clerkUserId}`);
        } else {
          console.error('[Clerk Webhook] Database error:', dbError);
          return res.status(500).json({ error: 'Database error' });
        }
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[Clerk Webhook] ✅ Webhook processed successfully in ${processingTime}ms (svix-id: ${req.headers['svix-id']})`);

    return res.status(200).json({
      message: 'Webhook processed successfully',
      eventType: evt.type,
      processingTimeMs: processingTime
    });
  } catch (error: any) {
    const processingTime = Date.now() - startTime;

    // Enhanced error logging with context
    console.error('[Clerk Webhook] ❌ Unexpected error during webhook processing:', {
      error: error.message,
      stack: error.stack,
      svixId: req.headers['svix-id'],
      eventType: evt?.type || 'unknown',
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString()
    });

    // Return appropriate error response
    const statusCode = error.name === 'ValidationError' ? 400 :
      error.name === 'PrismaClientKnownRequestError' ? 422 :
        500;

    return res.status(statusCode).json({
      error: 'Webhook processing failed',
      timestamp: new Date().toISOString(),
      svixId: req.headers['svix-id']
    });
  }
});

export default router;