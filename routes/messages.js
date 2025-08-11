import express from 'express';
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
import { asyncHandler } from '../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../src/errors/index.js';

const router = express.Router();

/**
 * Validate conversationId parameter (UUID or hex format)
 */
const validateConversationId = (conversationId) => {
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
router.post('/:conversationId/messages', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { conversationId } = req.params;
    const { userMessage, botResponse } = req.body;
    
    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      throw new ValidationError('Invalid conversationId format. Must be UUID or hex string.', {
        conversationId
      });
    }
    
    if (!userMessage || !botResponse) {
      throw new ValidationError('Missing required fields: userMessage, botResponse', {
        hasUserMessage: !!userMessage,
        hasBotResponse: !!botResponse
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
    return next(wrapError(`[POST /:conversationId/messages] add message pair`, error, {
      conversationId: req.params.conversationId,
      userId: req.auth().userId
    }));
  }
}));

/**
 * GET /:conversationId/messages
 * Get all messages for a specific conversation (new param-aware endpoint)
 */
router.get('/:conversationId/messages', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { conversationId } = req.params;
    const { limit = 50, offset = 0, orderBy = 'asc' } = req.query;
    
    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      throw new ValidationError('Invalid conversationId format. Must be UUID or hex string.', {
        conversationId
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
      limit: parseInt(limit),
      offset: parseInt(offset),
      orderBy: orderBy === 'desc' ? 'desc' : 'asc'
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
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: messages.length
        }
      }
    });
  } catch (error) {
    return next(wrapError(`[GET /:conversationId/messages] fetch conversation messages`, error, {
      conversationId: req.params.conversationId,
      userId: req.auth().userId
    }));
  }
}));

/**
 * POST /v1/messages (legacy endpoint - keep for backward compatibility)
 * Add a single message to a conversation
 */
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { conversationId, sender, content } = req.body;
    
    if (!conversationId || !sender || !content) {
      throw new ValidationError('Missing required fields: conversationId, sender, content', {
        hasConversationId: !!conversationId,
        hasSender: !!sender,
        hasContent: !!content
      });
    }

    const validSenders = ['USER', 'BOT'];
    if (!validSenders.includes(sender.toUpperCase())) {
      throw new ValidationError('Invalid sender. Must be USER or BOT', {
        sender,
        validSenders
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
    return next(wrapError(`[POST /v1/messages] add single message`, error, {
      conversationId: req.body.conversationId,
      userId: req.auth().userId
    }));
  }
}));

/**
 * POST /v1/messages/pair
 * Add both user message and bot response in a single transaction
 */
router.post('/pair', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { conversationId, userMessage, botResponse } = req.body;
    
    if (!conversationId || !userMessage || !botResponse) {
      throw new ValidationError('Missing required fields: conversationId, userMessage, botResponse', {
        hasConversationId: !!conversationId,
        hasUserMessage: !!userMessage,
        hasBotResponse: !!botResponse
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
    return next(wrapError(`[POST /v1/messages/pair] add message pair`, error, {
      conversationId: req.body.conversationId,
      userId: req.auth().userId
    }));
  }
}));

/**
 * DELETE /v1/messages/:messageId
 * Delete a specific message
 */
router.delete('/:messageId', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { messageId } = req.params;
    
    const deleted = await deleteMessage(messageId, user.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    if (error.message === 'Message not found or unauthorized') {
      return res.status(404).json({ error: error.message });
    }
    
    return next(wrapError(`[DELETE /v1/messages/${req.params.messageId}] delete message`, error, {
      messageId: req.params.messageId,
      userId: req.auth().userId
    }));
  }
}));

/**
 * GET /v1/messages/count/:conversationId
 * Get message count for a conversation
 */
router.get('/count/:conversationId', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
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
    return next(wrapError(`[GET /v1/messages/count/${req.params.conversationId}] get message count`, error, {
      conversationId: req.params.conversationId,
      userId: req.auth().userId
    }));
  }
}));

export default router;