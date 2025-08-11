import express from 'express';
import { requireAuth } from '@clerk/express';
import { getUserByClerkId } from '../middleware/auth.js';
import {
  findOrCreateConversation,
  getConversationByType,
  getConversationById,
  getUserConversations
} from '../services/conversationService.js';
import { getMessages } from '../services/messageService.js';
import { asyncHandler } from '../src/utils/asyncHandler.js';
import { wrapError, ValidationError } from '../src/errors/index.js';

const router = express.Router();

/**
 * POST /v1/conversations
 * Create a new conversation
 */
router.post('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { chatType, difyConversationId } = req.body;
    
    if (!chatType) {
      throw new ValidationError('Missing required field: chatType');
    }

    const validChatTypes = ['INCOME', 'DEBT', 'EXPENSES', 'SAVINGS', 'OPEN_CHAT'];
    if (!validChatTypes.includes(chatType.toUpperCase())) {
      throw new ValidationError('Invalid chatType. Must be one of: ' + validChatTypes.join(', '), {
        chatType,
        validTypes: validChatTypes
      });
    }

    const conversation = await findOrCreateConversation(
      user.id,
      chatType,
      difyConversationId
    );
    
    res.status(201).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    return next(wrapError('[POST /v1/conversations] create conversation', error, {
      chatType: req.body.chatType,
      userId: req.auth().userId
    }));
  }
}));

/**
 * GET /v1/conversations/:chatType
 * Get conversation by chat type for the authenticated user
 */
router.get('/:chatType', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { chatType } = req.params;
    
    const validChatTypes = ['income', 'debt', 'expenses', 'savings', 'open_chat'];
    if (!validChatTypes.includes(chatType.toLowerCase())) {
      throw new ValidationError('Invalid chatType. Must be one of: ' + validChatTypes.join(', '), {
        chatType,
        validTypes: validChatTypes
      });
    }

    const conversation = await getConversationByType(user.id, chatType);
    
    // Return 200 OK with null data if no conversation exists yet
    // This prevents 404 errors for users who haven't used this feature before
    res.json({
      success: true,
      data: conversation // Will be null if not found, or the conversation object if found
    });
  } catch (error) {
    return next(wrapError(`[GET /v1/conversations/${req.params.chatType}] fetch conversation by type`, error, {
      chatType: req.params.chatType,
      userId: req.auth().userId
    }));
  }
}));

/**
 * GET /v1/conversations/:conversationId/messages
 * Get all messages for a specific conversation
 */
router.get('/:conversationId/messages', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    const { conversationId } = req.params;
    const { limit = 50, offset = 0, orderBy = 'asc' } = req.query;
    
    // First verify the conversation belongs to the user
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
    return next(wrapError(`[GET /v1/conversations/${req.params.conversationId}/messages] fetch conversation messages`, error, {
      conversationId: req.params.conversationId,
      userId: req.auth().userId,
      limit: req.query.limit,
      offset: req.query.offset
    }));
  }
}));

/**
 * GET /v1/conversations
 * Get all conversations for the authenticated user
 */
router.get('/', requireAuth(), asyncHandler(async (req, res, next) => {
  try {
    const user = await getUserByClerkId(req.auth().userId);
    
    const conversations = await getUserConversations(user.id);
    
    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    return next(wrapError('[GET /v1/conversations] fetch user conversations', error, {
      userId: req.auth().userId
    }));
  }
}));

export default router;