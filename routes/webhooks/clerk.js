import express from 'express';
import { Webhook } from 'svix';
import { pool } from '../../db/neon.js';

const router = express.Router();

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error('[Clerk Webhook] Missing webhook headers');
      return res.status(400).json({ error: 'Missing webhook headers' });
    }

    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const wh = new Webhook(webhookSecret);

    let evt;
    try {
      const payload = req.body.toString();
      evt = wh.verify(payload, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature
      });
    } catch (err) {
      console.error('[Clerk Webhook] Webhook verification failed:', err);
      return res.status(400).json({ error: 'Webhook verification failed' });
    }

    console.log(`[Clerk Webhook] Received event: ${evt.type}`);

    // Only handle specific user events
    if (!['user.created', 'user.updated', 'user.deleted'].includes(evt.type)) {
      console.log(`[Clerk Webhook] ℹ️ Event ignored: ${evt.type}`);
      return res.status(200).json({ message: 'Event ignored' });
    }

    if (evt.type === 'user.created') {
      const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;

      const email = email_addresses?.[0]?.email_address || null;
      const name = `${first_name || ''} ${last_name || ''}`.trim() || null;

      // Production-safe logging - avoid logging full email addresses
      const logEmail = process.env.NODE_ENV === 'production'
        ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
        : email;

      console.log(`[Clerk Webhook] Creating user: ${clerkUserId}, email: ${logEmail}, name: ${name}`);
    } else if (evt.type === 'user.updated') {
      const { id: clerkUserId, email_addresses, first_name, last_name } = evt.data;

      const email = email_addresses?.[0]?.email_address || null;
      const name = `${first_name || ''} ${last_name || ''}`.trim() || null;

      // Production-safe logging - avoid logging full email addresses
      const logEmail = process.env.NODE_ENV === 'production'
        ? (email ? email.replace(/(.{2}).*@/, '$1***@') : 'null')
        : email;
      
      console.log(`[Clerk Webhook] Updating user: ${clerkUserId}, email: ${logEmail}, name: ${name}`);
    } else if (evt.type === 'user.deleted') {
      const { id: clerkUserId } = evt.data;

      console.log(`[Clerk Webhook] Deleting user: ${clerkUserId}`);

      try {
        const result = await pool.query(
          `DELETE FROM users WHERE clerk_user_id = $1 RETURNING id, clerk_user_id`,
          [clerkUserId]
        );

        if (result.rows.length > 0) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Clerk Webhook] ✅ User deleted successfully:`, result.rows[0]);
          } else {
            console.log(`[Clerk Webhook] ✅ User deleted successfully: ${clerkUserId}`);
          }
        } else {
          console.log(`[Clerk Webhook] ⚠️ User not found for deletion: ${clerkUserId}`);
        }
      } catch (dbError) {
        console.error('[Clerk Webhook] Database error:', dbError);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[Clerk Webhook] Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;