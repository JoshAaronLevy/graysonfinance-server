import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Find or create a conversation for a user and chat type
 * @param {string} userId - The user's database ID
 * @param {string} chatType - The chat type (INCOME, DEBT, EXPENSES, SAVINGS, OPEN_CHAT)
 * @param {string} difyConversationId - Optional Dify conversation ID for new conversations
 * @returns {Promise<Object>} The conversation object
 */
export const findOrCreateConversation = async (userId, chatType, difyConversationId = null) => {
  try {
    // First try to find existing conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        chatType: chatType.toUpperCase()
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    // If no conversation exists, create one
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          chatType: chatType.toUpperCase(),
          conversationId: difyConversationId || `${userId}-${chatType}-${Date.now()}`
        },
        include: {
          messages: true
        }
      });
    }

    return conversation;
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    throw error;
  }
};

/**
 * Get conversation by user ID and chat type
 * @param {string} userId - The user's database ID
 * @param {string} chatType - The chat type
 * @returns {Promise<Object|null>} The conversation object or null if not found
 */
export const getConversationByType = async (userId, chatType) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        chatType: chatType.toUpperCase()
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return conversation;
  } catch (error) {
    console.error('Error in getConversationByType:', error);
    throw error;
  }
};

/**
 * Get conversation by its ID
 * @param {string} conversationId - The conversation's database ID
 * @returns {Promise<Object|null>} The conversation object or null if not found
 */
export const getConversationById = async (conversationId) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        user: {
          select: {
            id: true,
            authId: true,
            email: true
          }
        }
      }
    });

    return conversation;
  } catch (error) {
    console.error('Error in getConversationById:', error);
    throw error;
  }
};

/**
 * Get all conversations for a user
 * @param {string} userId - The user's database ID
 * @returns {Promise<Array>} Array of conversation objects
 */
export const getUserConversations = async (userId) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1 // Just get the latest message for preview
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return conversations;
  } catch (error) {
    console.error('Error in getUserConversations:', error);
    throw error;
  }
};

/**
 * Update conversation's updatedAt timestamp
 * @param {string} conversationId - The conversation's database ID
 * @returns {Promise<Object>} The updated conversation object
 */
export const updateConversationTimestamp = async (conversationId) => {
  try {
    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    return conversation;
  } catch (error) {
    console.error('Error in updateConversationTimestamp:', error);
    throw error;
  }
};