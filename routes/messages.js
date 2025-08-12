import express from 'express';
import { requireAuth } from '@clerk/express';
import axios from 'axios';
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
import { wrapError, ValidationError, ExternalServiceError } from '../src/errors/index.js';
import { normalizeDifyResponse } from '../src/lib/dify-normalizer.js';

const router = express.Router();

// Environment variables for Dify integration
const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_APP_ID = process.env.DIFY_GRAYSON_FINANCE_APP_ID; // Public app, not PRO

if (!DIFY_API_KEY) {
  console.error('[Message Routes] ❌ DIFY_API_KEY is missing');
}

if (!DIFY_APP_ID) {
  console.error('[Message Routes] ❌ DIFY_GRAYSON_FINANCE_APP_ID is missing');
}

/**
 * Validate conversationId parameter (UUID, hex format, or Dify conversation ID)
 */
const validateConversationId = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') {
    return false;
  }
  
  // Check for UUID format (8-4-4-4-12 hex digits)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  // Check for hex format (alphanumeric)
  const hexRegex = /^[0-9a-f]+$/i;
  
  // Check for Dify conversation ID format (alphanumeric with dashes/underscores)
  const difyIdRegex = /^[a-zA-Z0-9\-_]+$/;
  
  return uuidRegex.test(conversationId) ||
         (hexRegex.test(conversationId) && conversationId.length >= 8) ||
         (difyIdRegex.test(conversationId) && conversationId.length >= 8);
};

/**
 * Check if conversationId is a Dify conversation ID (public, no auth required)
 */
const isDifyConversationId = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') {
    return false;
  }
  
  // Dify conversation IDs are typically longer alphanumeric strings with dashes
  // They don't match UUID format and are usually longer than simple hex IDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const simpleHexRegex = /^[0-9a-f]+$/i;
  
  // If it matches UUID or simple hex, it's not a Dify ID
  if (uuidRegex.test(conversationId) || simpleHexRegex.test(conversationId)) {
    return false;
  }
  
  // If it contains dashes or underscores and is alphanumeric, likely Dify
  const difyIdRegex = /^[a-zA-Z0-9\-_]+$/;
  return difyIdRegex.test(conversationId) && conversationId.length >= 8;
};

/**
 * POST /:conversationId/messages
 * Add a message to a specific conversation (handles both authenticated DB conversations and public Dify conversations)
 */
router.post('/:conversationId/messages', asyncHandler(async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    
    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      throw new ValidationError('Invalid conversationId format. Must be UUID, hex string, or Dify conversation ID.', {
        conversationId
      });
    }
    
    // Try to find conversation in database first
    let conversation = null;
    
    try {
      conversation = await getConversationById(conversationId);
    } catch (error) {
      // If error finding conversation, it might be a Dify-only conversation
      console.log(`[Messages] 📥 Conversation not found in DB, treating as Dify: ${conversationId}`);
    }
    
    // If no conversation found in DB, treat as public Dify conversation
    if (!conversation) {
      console.log(`[Messages] 📥 Public Dify message request: ${conversationId}`);
      
      const { query } = req.body;
      
      // Validate input for Dify conversations
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        const error = new ValidationError('query is required for Dify conversations');
        error.code = 'BAD_REQUEST';
        throw error;
      }
      
      // Ensure required environment variables are present
      if (!DIFY_API_KEY || !DIFY_APP_ID) {
        const error = new ExternalServiceError('Dify', 'Configuration error: missing API credentials');
        error.code = 'INTERNAL_ERROR';
        error.status = 500;
        throw error;
      }
      
      // Prepare headers for Dify API call
      const headers = {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
        'x-api-app-id': DIFY_APP_ID
      };
      
      // Make request to Dify API
      const difyResponse = await axios.post(
        'https://api.dify.ai/v1/chat-messages',
        {
          query: query.trim(),
          inputs: { topic: 'debt' },
          response_mode: 'blocking',
          conversation_id: conversationId,
          user: 'public-user' // Anonymous user identifier
        },
        {
          headers,
          timeout: 30000 // 30 second timeout
        }
      );
      
      // Use normalizer to extract correct flags from parsed JSON content
      const normalized = normalizeDifyResponse(difyResponse.data);
      
      // Format response to match expected message structure
      const response = {
        success: true,
        data: {
          userMessage: {
            role: 'user',
            content: query.trim(),
            createdAt: new Date().toISOString()
          },
          botResponse: {
            role: 'assistant',
            content: normalized.text || 'I apologize, but I was unable to process your debt information. Please try again.',
            userData: {
              valid: normalized.valid,
              isValid: normalized.isValid,
              ambiguous: normalized.ambiguous
            },
            metadata: normalized.outputs,
            createdAt: new Date().toISOString()
          },
          conversation_id: normalized.conversation_id
        }
      };
      
      console.log(`[Messages] ✅ Dify message processed successfully:`, {
        conversationId: normalized.conversation_id
      });
      
      return res.status(201).json(response);
    }
    
    // For database conversations, require authentication
    if (!req.auth || !req.auth().userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required for database conversations'
      });
    }
    
    const user = await getUserByClerkId(req.auth().userId);
    const { userMessage, botResponse } = req.body;
    
    if (!userMessage || !botResponse) {
      throw new ValidationError('Missing required fields: userMessage, botResponse', {
        hasUserMessage: !!userMessage,
        hasBotResponse: !!botResponse
      });
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
    // Handle Dify-specific errors
    if (error.response?.status) {
      // Dify API error
      const status = error.response.status;
      const errorData = error.response.data || error.message;
      
      const difyError = new ExternalServiceError('Dify', 'Dify call failed', { status, errorData });
      difyError.code = 'UPSTREAM_ERROR';
      difyError.status = 502;
      return next(difyError);
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new ExternalServiceError('Dify', 'Dify call failed', { timeout: true });
      timeoutError.code = 'UPSTREAM_ERROR';
      timeoutError.status = 502;
      return next(timeoutError);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const networkError = new ExternalServiceError('Dify', 'Dify call failed', { networkError: true });
      networkError.code = 'UPSTREAM_ERROR';
      networkError.status = 502;
      return next(networkError);
    }
    
    const userId = req.auth?.()?.userId || 'public-user';
    return next(wrapError(`[POST /:conversationId/messages] add message`, error, {
      conversationId: req.params.conversationId,
      userId: userId
    }));
  }
}));

/**
 * GET /:conversationId/messages
 * Get all messages for a specific conversation (handles both authenticated DB conversations and public Dify conversations)
 */
router.get('/:conversationId/messages', asyncHandler(async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0, orderBy = 'asc' } = req.query;
    
    // Validate conversationId parameter
    if (!validateConversationId(conversationId)) {
      throw new ValidationError('Invalid conversationId format. Must be UUID, hex string, or Dify conversation ID.', {
        conversationId
      });
    }
    
    // Try to find conversation in database first
    let conversation = null;
    let requiresAuth = true;
    
    try {
      conversation = await getConversationById(conversationId);
    } catch (error) {
      // If error finding conversation, it might be a Dify-only conversation
      console.log(`[Messages] 📥 Conversation not found in DB, treating as Dify: ${conversationId}`);
    }
    
    // If no conversation found in DB, treat as public Dify conversation
    if (!conversation) {
      console.log(`[Messages] 📥 Public Dify conversation request: ${conversationId}`);
      
      // For public Dify conversations, we don't store message history in our DB
      // Return empty messages with appropriate structure
      return res.json({
        success: true,
        data: {
          conversation: {
            id: conversationId,
            chatType: 'DEBT', // Assume debt for Dify conversations
            conversationId: conversationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          messages: [],
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: 0
          }
        }
      });
    }
    
    // For database conversations, require authentication
    if (!req.auth || !req.auth().userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required for database conversations'
      });
    }
    
    const user = await getUserByClerkId(req.auth().userId);
    
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
    const userId = req.auth?.()?.userId || 'public-user';
    return next(wrapError(`[GET /:conversationId/messages] fetch conversation messages`, error, {
      conversationId: req.params.conversationId,
      userId: userId
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