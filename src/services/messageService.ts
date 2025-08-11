import { PrismaClient } from '@prisma/client';
import type { Message, ChatType, Prisma } from '@prisma/client';
import { updateConversationTimestamp } from './conversationService.js';

const prisma = new PrismaClient();

interface MessageWithConversation extends Message {
  conversation: {
    id: string;
    chatType: ChatType;
    userId: string;
  };
}

interface MessageOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

interface MessageInput {
  role: string;
  content: string;
  meta?: Prisma.JsonValue;
}

interface MessagePairResult {
  userMessage: Message;
  botMessage: Message;
}

/**
 * Add a message to a conversation
 * @param conversationId - The conversation's database ID
 * @param role - The message role ('user', 'assistant', or 'system')
 * @param content - The message content
 * @param meta - Optional metadata for the message
 * @returns The created message object
 */
export const addMessage = async (
  conversationId: string,
  role: string,
  content: string,
  meta?: Prisma.JsonValue | null
): Promise<MessageWithConversation> => {
  try {
    const message = await prisma.message.create({
      data: {
        conversationId,
        role: role.toLowerCase() as 'user' | 'assistant' | 'system',
        content,
        ...(meta !== null && meta !== undefined ? { meta } : {})
      } as any,
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

    return message as MessageWithConversation;
  } catch (error) {
    console.error('Error in addMessage:', error);
    throw error;
  }
};

/**
 * Get all messages for a conversation
 * @param conversationId - The conversation's database ID
 * @param options - Query options
 * @returns Array of message objects
 */
export const getMessages = async (
  conversationId: string,
  options: MessageOptions = {}
): Promise<MessageWithConversation[]> => {
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

    return messages as MessageWithConversation[];
  } catch (error) {
    console.error('Error in getMessages:', error);
    throw error;
  }
};

/**
 * Get the latest message for a conversation
 * @param conversationId - The conversation's database ID
 * @returns The latest message object or null
 */
export const getLatestMessage = async (
  conversationId: string
): Promise<MessageWithConversation | null> => {
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

    return message as MessageWithConversation | null;
  } catch (error) {
    console.error('Error in getLatestMessage:', error);
    throw error;
  }
};

/**
 * Get message count for a conversation
 * @param conversationId - The conversation's database ID
 * @returns The number of messages in the conversation
 */
export const getMessageCount = async (conversationId: string): Promise<number> => {
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
 * @param messageId - The message's database ID
 * @param userId - The user's database ID (for authorization)
 * @returns True if message was deleted
 */
export const deleteMessage = async (messageId: string, userId: string): Promise<boolean> => {
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
 * @param conversationId - The conversation's database ID
 * @param userMessage - The user's message content
 * @param botResponse - The bot's response content
 * @returns Object containing both created messages
 */
export const addMessagePair = async (
  conversationId: string,
  userMessage: string,
  botResponse: string
): Promise<MessagePairResult> => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const userMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userMessage
        } as any
      });

      const botMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: botResponse
        } as any
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
 * @param conversationId - The conversation's database ID
 * @param messages - Array of message objects with { role, content, meta? }
 * @returns Array of created message objects
 */
export const addMessages = async (
  conversationId: string,
  messages: MessageInput[]
): Promise<Message[]> => {
  try {
    const createdMessages = await prisma.$transaction(async (tx) => {
      const newMessages: Message[] = [];
      
      for (const message of messages) {
        const newMessage = await tx.message.create({
          data: {
            conversationId,
            role: message.role.toLowerCase() as 'user' | 'assistant' | 'system',
            content: message.content,
            meta: message.meta || undefined
          } as any
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