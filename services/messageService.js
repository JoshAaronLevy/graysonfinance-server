import { PrismaClient } from '@prisma/client';
import { updateConversationTimestamp } from './conversationService.js';

const prisma = new PrismaClient();

/**
 * Add a message to a conversation
 * @param {string} conversationId - The conversation's database ID
 * @param {string} role - The message role ('user', 'assistant', or 'system')
 * @param {string} content - The message content
 * @param {Object} meta - Optional metadata for the message
 * @returns {Promise<Object>} The created message object
 */
export const addMessage = async (conversationId, role, content, meta = null) => {
  try {
    const message = await prisma.message.create({
      data: {
        conversationId,
        role: role.toLowerCase(),
        content,
        meta
      },
      include: {
        conversation: {
          select: {
            id: true,
            chatType: true,
            userId: true
          }
        }
      }
    });

    // Update the conversation's timestamp
    await updateConversationTimestamp(conversationId);

    return message;
  } catch (error) {
    console.error('Error in addMessage:', error);
    throw error;
  }
};

/**
 * Get all messages for a conversation
 * @param {string} conversationId - The conversation's database ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of messages to return
 * @param {number} options.offset - Number of messages to skip
 * @param {string} options.orderBy - Order direction ('asc' or 'desc')
 * @returns {Promise<Array>} Array of message objects
 */
export const getMessages = async (conversationId, options = {}) => {
  const { limit = 50, offset = 0, orderBy = 'asc' } = options;

  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: orderBy },
      take: limit,
      skip: offset,
      include: {
        conversation: {
          select: {
            id: true,
            chatType: true,
            userId: true
          }
        }
      }
    });

    return messages;
  } catch (error) {
    console.error('Error in getMessages:', error);
    throw error;
  }
};

/**
 * Get the latest message for a conversation
 * @param {string} conversationId - The conversation's database ID
 * @returns {Promise<Object|null>} The latest message object or null
 */
export const getLatestMessage = async (conversationId) => {
  try {
    const message = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          select: {
            id: true,
            chatType: true,
            userId: true
          }
        }
      }
    });

    return message;
  } catch (error) {
    console.error('Error in getLatestMessage:', error);
    throw error;
  }
};

/**
 * Get message count for a conversation
 * @param {string} conversationId - The conversation's database ID
 * @returns {Promise<number>} The number of messages in the conversation
 */
export const getMessageCount = async (conversationId) => {
  try {
    const count = await prisma.message.count({
      where: { conversationId }
    });

    return count;
  } catch (error) {
    console.error('Error in getMessageCount:', error);
    throw error;
  }
};

/**
 * Delete a message
 * @param {string} messageId - The message's database ID
 * @param {string} userId - The user's database ID (for authorization)
 * @returns {Promise<boolean>} True if message was deleted
 */
export const deleteMessage = async (messageId, userId) => {
  try {
    // First verify the message belongs to the user
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversation: {
          userId
        }
      }
    });

    if (!message) {
      throw new Error('Message not found or unauthorized');
    }

    await prisma.message.delete({
      where: { id: messageId }
    });

    // Update the conversation's timestamp
    await updateConversationTimestamp(message.conversationId);

    return true;
  } catch (error) {
    console.error('Error in deleteMessage:', error);
    throw error;
  }
};

/**
 * Add both user and bot messages in a single transaction
 * @param {string} conversationId - The conversation's database ID
 * @param {string} userMessage - The user's message content
 * @param {string} botResponse - The bot's response content
 * @returns {Promise<Object>} Object containing both created messages
 */
export const addMessagePair = async (conversationId, userMessage, botResponse) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const userMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userMessage
        }
      });

      const botMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: botResponse
        }
      });

      // Update the conversation's timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      return { userMessage: userMsg, botMessage: botMsg };
    });

    return result;
  } catch (error) {
    console.error('Error in addMessagePair:', error);
    throw error;
  }
};

/**
 * Add multiple messages to a conversation
 * @param {string} conversationId - The conversation's database ID
 * @param {Array} messages - Array of message objects with { role, content, meta? }
 * @returns {Promise<Array>} Array of created message objects
 */
export const addMessages = async (conversationId, messages) => {
  try {
    const createdMessages = await prisma.$transaction(async (tx) => {
      const newMessages = [];
      
      for (const message of messages) {
        const newMessage = await tx.message.create({
          data: {
            conversationId,
            role: message.role.toLowerCase(),
            content: message.content,
            meta: message.meta || null
          }
        });
        newMessages.push(newMessage);
      }

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });

      return newMessages;
    });

    return createdMessages;
  } catch (error) {
    console.error('Error in addMessages:', error);
    throw error;
  }
};