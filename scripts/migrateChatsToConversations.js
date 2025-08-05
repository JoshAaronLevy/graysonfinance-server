import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateChatsToConversations() {
  console.log('🚀 Starting migration from Chat to Conversation/Message tables...');
  
  try {
    // Get all existing chat records using raw SQL since Chat model no longer exists in schema
    const chats = await prisma.$queryRaw`
      SELECT id, user_id as "userId", chat_type as "chatType", message, response, conversation_id as "conversationId", created_at as "createdAt"
      FROM chats
      ORDER BY created_at ASC
    `;

    console.log(`📊 Found ${chats.length} chat records to migrate`);

    if (chats.length === 0) {
      console.log('✅ No chat records found. Migration complete.');
      return;
    }

    // Group chats by unique combination of userId, chatType, and conversationId
    const conversationGroups = {};
    
    chats.forEach(chat => {
      const key = `${chat.userId}-${chat.chatType}-${chat.conversationId}`;
      if (!conversationGroups[key]) {
        conversationGroups[key] = {
          userId: chat.userId,
          chatType: chat.chatType,
          conversationId: chat.conversationId,
          chats: []
        };
      }
      conversationGroups[key].chats.push(chat);
    });

    console.log(`📝 Found ${Object.keys(conversationGroups).length} unique conversations`);

    let conversationsCreated = 0;
    let messagesCreated = 0;

    // Process each conversation group
    for (const [key, group] of Object.entries(conversationGroups)) {
      console.log(`\n🔄 Processing conversation: ${key}`);
      
      try {
        // Create conversation record
        const conversation = await prisma.conversation.create({
          data: {
            userId: group.userId,
            chatType: group.chatType,
            conversationId: group.conversationId,
            createdAt: group.chats[0].createdAt, // Use the earliest chat's timestamp
            updatedAt: group.chats[group.chats.length - 1].createdAt // Use the latest chat's timestamp
          }
        });

        console.log(`  ✅ Created conversation: ${conversation.id}`);
        conversationsCreated++;

        // Create message records for each chat in this conversation
        for (const chat of group.chats) {
          // Create USER message
          const userMessage = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              sender: 'USER',
              content: chat.message,
              createdAt: chat.createdAt
            }
          });

          // Create BOT message (slightly later timestamp to maintain order)
          const botMessageTime = new Date(chat.createdAt.getTime() + 1000); // Add 1 second
          const botMessage = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              sender: 'BOT',
              content: chat.response,
              createdAt: botMessageTime
            }
          });

          messagesCreated += 2; // USER + BOT messages
          console.log(`    📝 Created messages for chat: ${chat.id}`);
        }

        console.log(`  ✅ Migrated ${group.chats.length} chats to ${group.chats.length * 2} messages`);

      } catch (error) {
        console.error(`  ❌ Error processing conversation ${key}:`, error);
        // Continue with next conversation group
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  • Original chat records: ${chats.length}`);
    console.log(`  • Conversations created: ${conversationsCreated}`);
    console.log(`  • Messages created: ${messagesCreated}`);

    // Verify migration
    const totalConversations = await prisma.conversation.count();
    const totalMessages = await prisma.message.count();
    
    console.log(`\n🔍 Verification:`);
    console.log(`  • Total conversations in DB: ${totalConversations}`);
    console.log(`  • Total messages in DB: ${totalMessages}`);

    if (conversationsCreated === totalConversations && messagesCreated === totalMessages) {
      console.log(`✅ Migration completed successfully!`);
      console.log(`\n⚠️  IMPORTANT: After verifying the migration, you can safely:`);
      console.log(`   1. Run Prisma migration to remove the Chat table`);
      console.log(`   2. Remove any remaining references to the Chat model in your code`);
    } else {
      console.log(`⚠️  Migration may not be complete. Please verify the data.`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute migration if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateChatsToConversations()
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export default migrateChatsToConversations;