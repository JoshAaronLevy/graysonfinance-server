import { PrismaClient } from '@prisma/client';
import type { Conversation, Message, ChatType } from '@prisma/client';

const prisma = new PrismaClient();

interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

/**
 * Find or create a conversation for a user and chat type
 * @param userId - The user's database ID
 * @param chatType - The chat type (INCOME, DEBT, EXPENSES, SAVINGS, OPEN_CHAT)
 * @param difyConversationId - Optional Dify conversation ID for new conversations
 * @returns The conversation object
 */
export const findOrCreateConversation = async (
  userId: string, 
  chatType: string, 
  difyConversationId: string | null = null
): Promise<ConversationWithMessages> => {
  try {
    // First try to find existing conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        chatType: chatType.toUpperCase() as ChatType
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
          chatType: chatType.toUpperCase() as ChatType,
          conversationId: difyConversationId || `${userId}-${chatType}-${Date.now()}`
        },
        include: {
          messages: true
        }
      });
    }

    return conversation as ConversationWithMessages;
  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    throw error;
  }
};

/**
 * Get conversation by user ID and chat type
 * @param userId - The user's database ID
 * @param chatType - The chat type to search for
 * @returns The conversation object or null if not found
 */
export const getConversationByType = async (
  userId: string, 
  chatType: string
): Promise<ConversationWithMessages | null> => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        userId,
        chatType: chatType.toUpperCase() as ChatType
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return conversation as ConversationWithMessages | null;
  } catch (error) {
    console.error('Error in getConversationByType:', error);
    throw error;
  }
};

/**
 * Get conversation by ID
 * @param conversationId - The conversation's database ID
 * @returns The conversation object or null if not found
 */
export const getConversationById = async (
  conversationId: string
): Promise<ConversationWithMessages | null> => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
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
 * Update conversation timestamp to current time
 * @param conversationId - The conversation's database ID
 * @returns Promise that resolves when timestamp is updated
 */
export const updateConversationTimestamp = async (conversationId: string): Promise<void> => {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });
  } catch (error) {
    console.error('Error in updateConversationTimestamp:', error);
    throw error;
  }
};

/**
 * Get all conversations for a user
 * @param userId - The user's database ID
 * @returns Array of conversation objects
 */
export const getUserConversations = async (
  userId: string
): Promise<ConversationWithMessages[]> => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
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