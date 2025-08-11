/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '@clerk/express';
import { getUserByClerkId } from '../../middleware/auth.js';
import {
  findOrCreateConversation,
  getConversationByType,
  getConversationById
} from '../../services/conversationService.js';
import { getMessages, addMessages } from '../../services/messageService.js';

const router = express.Router();

interface AuthRequest extends Request {
  auth(): { userId: string };
}

/**
 * Validation helper for income data
 */
const validateIncomeData = (income: any, currency: any, source: any) => {
  const errors: { [key: string]: string } = {};

  if (income === undefined || income === null || income === '') {
    errors.income = 'Income is required';
  } else if (typeof income !== 'number' || !isFinite(income) || income <= 0) {
    errors.income = 'Income must be a finite positive number';
  }

  if (currency && typeof currency !== 'string') {
    errors.currency = 'Currency must be a string';
  }

  if (source && typeof source !== 'string') {
    errors.source = 'Source must be a string';
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

/**
 * GET /v1/conversations/income
 * Get the income conversation for the authenticated user
 */
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);

    const conversation = await getConversationByType(user.id, 'INCOME');

    if (!conversation) {
      return res.json({
        conversationId: null,
        messages: []
      });
    }

    // Format messages for the API response
    const formattedMessages = conversation.messages.map(message => ({
      role: (message as any).sender || (message as any).role,
      content: message.content,
      meta: (message as any).meta || null,
      createdAt: message.createdAt
    }));

    res.json({
      conversationId: conversation.id,
      messages: formattedMessages
    });
  } catch (error) {
    console.error('Error fetching income conversation:', error);
    res.status(500).json({ error: 'Failed to fetch income conversation' });
  }
});

/**
 * POST /v1/conversations/income
 * Create or update income conversation with initial income data
 */
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { income, currency = 'USD', source, firstMessage } = req.body;

    // Validate income data
    const validationErrors = validateIncomeData(income, currency, source);
    if (validationErrors) {
      return res.status(422).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Find or create the income conversation
    let conversation = await getConversationByType(user.id, 'INCOME');

    if (!conversation) {
      conversation = await findOrCreateConversation(user.id, 'INCOME');
    }

    // Create messages for the income submission
    const messages = [];

    // Add user message with income information
    const userMessageContent = firstMessage || `I want to discuss my income. My monthly income is ${currency} ${income}${source ? ` from ${source}` : ''}.`;

    messages.push({
      role: 'user',
      content: userMessageContent,
      meta: {
        income,
        currency,
        source,
        type: 'income_submission'
      }
    });

    // Add a helpful assistant response
    const assistantResponse = `Great! I see you've shared that your monthly income is ${currency} ${income}${source ? ` from ${source}` : ''}. This is valuable information for your financial planning. Would you like to discuss how this income fits into your overall financial goals, or explore budgeting strategies based on this income level?`;

    messages.push({
      role: 'assistant',
      content: assistantResponse,
      meta: {
        type: 'income_acknowledgment'
      }
    });

    // Add the messages to the conversation
    await addMessages(conversation.id, messages);

    // Get all messages for the response
    const allMessages = await getMessages(conversation.id, { orderBy: 'asc' });
    const allFormattedMessages = allMessages.map(message => ({
      role: (message as any).sender || (message as any).role,
      content: message.content,
      meta: (message as any).meta || null,
      createdAt: message.createdAt
    }));

    res.status(201).json({
      conversationId: conversation.id,
      messages: allFormattedMessages
    });
  } catch (error: any) {
    console.error('Error creating income conversation:', error);

    if (error.code === 'P2002' && error.meta?.target?.includes('user_id') && error.meta?.target?.includes('chat_type')) {
      // Unique constraint violation - conversation already exists
      return res.status(409).json({ error: 'Income conversation already exists for this user' });
    }

    res.status(500).json({ error: 'Failed to create income conversation' });
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

    // Verify conversation exists and belongs to user
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const messages = await getMessages(conversationId, { orderBy: 'asc' });

    const formattedMessages = messages.map(message => ({
      role: (message as any).sender || (message as any).role,
      content: message.content,
      meta: (message as any).meta || null,
      createdAt: message.createdAt
    }));

    res.json({
      conversationId,
      messages: formattedMessages
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

/**
 * PATCH /v1/conversations/:conversationId/messages
 * Append new messages to a conversation
 */
router.patch('/:conversationId/messages', requireAuth(), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await getUserByClerkId(authReq.auth().userId);
    const { conversationId } = req.params;
    const { append } = req.body;

    // Validate append data
    if (!Array.isArray(append) || append.length === 0) {
      return res.status(422).json({
        error: 'Validation failed',
        details: { append: 'append must be a non-empty array of messages' }
      });
    }

    // Validate message format
    for (const [index, message] of append.entries()) {
      if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
        return res.status(422).json({
          error: 'Validation failed',
          details: { [`append[${index}].role`]: 'role must be one of: user, assistant, system' }
        });
      }
      if (!message.content || typeof message.content !== 'string') {
        return res.status(422).json({
          error: 'Validation failed',
          details: { [`append[${index}].content`]: 'content is required and must be a string' }
        });
      }
    }

    // Verify conversation exists and belongs to user
    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Add messages
    await addMessages(conversationId, append);

    // Get all messages for response
    const allMessages = await getMessages(conversationId, { orderBy: 'asc' });

    const formattedMessages = allMessages.map(message => ({
      role: (message as any).sender || (message as any).role,
      content: message.content,
      meta: (message as any).meta || null,
      createdAt: message.createdAt
    }));

    res.json({
      conversationId,
      messages: formattedMessages
    });
  } catch (error) {
    console.error('Error appending messages to conversation:', error);
    res.status(500).json({ error: 'Failed to append messages to conversation' });
  }
});

export default router;