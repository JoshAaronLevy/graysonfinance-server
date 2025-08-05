import express from 'express';
import { requireAuth } from '@clerk/express';
import { getUserByClerkId } from '../middleware/auth.js';
import { getConversationById } from '../services/conversationService.js';
import { 
  addMessage, 
  addMessagePair, 
  deleteMessage, 
  getMessageCount 
} from '../services/messageService.js';

const router = express.Router();

/**
 * POST /api/messages
 * Add a single message to a conversation
 */
router.post('/', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
 * POST /api/messages/pair
 * Add both user message and bot response in a single transaction
 */
router.post('/pair', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
 * DELETE /api/messages/:messageId
 * Delete a specific message
 */
router.delete('/:messageId', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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
    console.error('Error deleting message:', error);
    if (error.message === 'Message not found or unauthorized') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete message' });
    }
  }
});

/**
 * GET /api/messages/count/:conversationId
 * Get message count for a conversation
 */
router.get('/count/:conversationId', requireAuth(), async (req, res) => {
  try {
    const user = await getUserByClerkId(req.auth.userId);
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