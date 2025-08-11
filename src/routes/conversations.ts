import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '@clerk/express';
import { getUserByClerkId } from '../middleware/auth.js';
import {
  findOrCreateConversation,
  getConversationById,
  getUserConversations
} from '../services/conversationService.js';
import { getMessages } from '../services/messageService.js';

const router = express.Router();

interface AuthRequest extends Request {
  auth(): { userId: string };
}

/**
 * POST /v1/conversations
 * Create a new conversation
 */
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
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
 * GET /v1/conversations
 * Get all conversations for the authenticated user
 */
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    
    const conversations = await getUserConversations(user.id);
    
    res.json({ 
      success: true, 
      data: conversations 
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /v1/conversations/:id
 * Get a specific conversation by ID
 */
router.get('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { id } = req.params;
    
    const conversation = await getConversationById(id);
    
    if (!conversation || conversation.userId !== user.id) {
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
 * GET /v1/conversations/:conversationId/messages
 * Get all messages for a specific conversation
 */
router.get('/:conversationId/messages', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId } = req.params;
    
    // First verify the conversation belongs to the user
    const conversation = await getConversationById(conversationId);
    
    if (!conversation || conversation.userId !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const messages = await getMessages(conversationId);
    
    res.json({
      conversationId,
      messages: messages.map(msg => ({
        role: (msg as unknown as { role: string }).role,
        content: (msg as unknown as { content: string }).content,
        meta: (msg as unknown as { meta: unknown }).meta,
        createdAt: (msg as unknown as { createdAt: Date }).createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;