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

const router = express.Router();

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
    const { chatType, difyConversationId } = req.body;
    
    if (!chatType) {
      return res.status(400).json({ error: 'Missing required field: chatType' });
    }

    const validChatTypes = ['INCOME', 'DEBT', 'EXPENSES', 'SAVINGS', 'OPEN_CHAT'];
    if (!validChatTypes.includes(chatType.toUpperCase())) {
      return res.status(400).json({ 
        error: 'Invalid chatType. Must be one of: ' + validChatTypes.join(', ') 
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
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

/**
 * GET /api/conversations/:chatType
 * Get conversation by chat type for the authenticated user
 */
router.get('/:chatType', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
    const { chatType } = req.params;
    
    const validChatTypes = ['income', 'debt', 'expenses', 'savings', 'open_chat'];
    if (!validChatTypes.includes(chatType.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid chatType. Must be one of: ' + validChatTypes.join(', ') 
      });
    }

    const conversation = await getConversationByType(user.id, chatType);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json({ 
      success: true, 
      data: conversation 
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * Get all messages for a specific conversation
 */
router.get('/:conversationId/messages', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

/**
 * GET /api/conversations
 * Get all conversations for the authenticated user
 */
router.get('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
    
    const conversations = await getUserConversations(user.id);
    
    res.json({ 
      success: true, 
      data: conversations 
    });
  } catch (error) {
    console.error('Error fetching user conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

export default router;