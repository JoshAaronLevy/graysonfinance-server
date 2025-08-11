/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '@clerk/express';
import { getUserByClerkId } from '../middleware/auth.js';
import { getConversationById } from '../services/conversationService.js';
import {
  addMessage,
  addMessagePair,
  deleteMessage,
  getMessageCount,
  getMessages
} from '../services/messageService.js';

const router = express.Router();

interface AuthRequest extends Request {
  auth(): { userId: string };
}

/**
 * Validate conversationId parameter (UUID or hex format)
 */
const validateConversationId = (conversationId: string | any[]) => {
  if (!conversationId || typeof conversationId !== 'string') {
    return false;
  }

  // Check for UUID format (8-4-4-4-12 hex digits)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Check for hex format (alphanumeric)
  const hexRegex = /^[0-9a-f]+$/i;

  return uuidRegex.test(conversationId) || (hexRegex.test(conversationId) && conversationId.length >= 8);
};

/**
 * POST /:conversationId/messages
 * Add a message to a specific conversation (new param-aware endpoint)
 */
router.post('/:conversationId/messages', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId } = req.params;
    const { userMessage, botResponse } = req.body;

    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      return res.status(400).json({
        error: 'Invalid conversationId format. Must be UUID or hex string.'
      });
    }

    if (!userMessage || !botResponse) {
      return res.status(400).json({
        error: 'Missing required fields: userMessage, botResponse'
      });
    }

    // Verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await addMessagePair(conversationId, userMessage, botResponse);

    res.status(201).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

/**
 * GET /:conversationId/messages
 * Get all messages for a specific conversation (new param-aware endpoint)
 */
router.get('/:conversationId/messages', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId } = req.params;
    const { limit = '50', offset = '0', orderBy = 'asc' } = req.query;

    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      return res.status(400).json({
        error: 'Invalid conversationId format. Must be UUID or hex string.'
      });
    }

    // Verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await getMessages(conversationId, {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      orderBy: (orderBy as string) === 'desc' ? 'desc' : 'asc'
    });

    res.json({
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          chatType: conversation.chatType,
          conversationId: conversation.conversationId,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        },
        messages,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: messages.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

/**
 * POST /v1/messages (legacy endpoint - keep for backward compatibility)
 * Add a single message to a conversation
 */
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId, sender, content } = req.body;

    if (!conversationId || !sender || !content) {
      return res.status(400).json({
        error: 'Missing required fields: conversationId, sender, content'
      });
    }

    const validSenders = ['USER', 'BOT'];
    if (!validSenders.includes(sender.toUpperCase())) {
      return res.status(400).json({
        error: 'Invalid sender. Must be USER or BOT'
      });
    }

    // Verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const message = await addMessage(conversationId, sender, content);

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Error adding message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

/**
 * POST /v1/messages/pair
 * Add both user message and bot response in a single transaction
 */
router.post('/pair', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId, userMessage, botResponse } = req.body;

    if (!conversationId || !userMessage || !botResponse) {
      return res.status(400).json({
        error: 'Missing required fields: conversationId, userMessage, botResponse'
      });
    }

    // Verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await addMessagePair(conversationId, userMessage, botResponse);

    res.status(201).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Error adding message pair:', error);
    res.status(500).json({ error: 'Failed to add message pair' });
  }
});

/**
 * DELETE /v1/messages/:messageId
 * Delete a specific message
 */
router.delete('/:messageId', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { messageId } = req.params;

    const deleted = await deleteMessage(messageId, user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting message:', error);
    if (error.message === 'Message not found or unauthorized') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
});

/**
 * GET /v1/messages/count/:conversationId
 * Get message count for a conversation
 */
router.get('/count/:conversationId', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId } = req.params;

    // Verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const count = await getMessageCount(conversationId);

    res.json({
      success: true,
      data: {
        conversationId,
        messageCount: count
      }
    });
  } catch (error) {
    console.error('Error getting message count:', error);
    res.status(500).json({ error: 'Failed to get message count' });
  }
});

export default router;