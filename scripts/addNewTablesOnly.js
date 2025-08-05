import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createNewTables() {
  console.log('🚀 Creating new Conversation and Message tables...');
  
  try {
    // Execute raw SQL to create the new tables
    await prisma.$executeRaw`
      -- Create MessageSender enum if it doesn't exist
      DO $$ BEGIN
        CREATE TYPE "MessageSender" AS ENUM ('USER', 'BOT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    await prisma.$executeRaw`
      -- Create conversations table
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "chat_type" "ChatType" NOT NULL,
        "conversation_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
      );
    `;
    
    await prisma.$executeRaw`
      -- Create messages table
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" TEXT NOT NULL,
        "conversation_id" TEXT NOT NULL,
        "sender" "MessageSender" NOT NULL,
        "content" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
      );
    `;
    
    await prisma.$executeRaw`
      -- Add unique constraint to conversations
      DO $$ BEGIN
        ALTER TABLE "conversations" ADD CONSTRAINT "conversations_conversation_id_key" UNIQUE ("conversation_id");
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    await prisma.$executeRaw`
      -- Add foreign key constraints
      DO $$ BEGIN
        ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    await prisma.$executeRaw`
      DO $$ BEGIN
        ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    console.log('✅ New tables created successfully');
    
    // Verify tables exist
    const conversationCount = await prisma.$queryRaw`SELECT COUNT(*) FROM "conversations"`;
    const messageCount = await prisma.$queryRaw`SELECT COUNT(*) FROM "messages"`;
    
    console.log(`📊 Conversations table: ${conversationCount[0].count} records`);
    console.log(`📊 Messages table: ${messageCount[0].count} records`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to create tables:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createNewTables()
    .then(() => {
      console.log('✅ Table creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Table creation failed:', error);
      process.exit(1);
    });
}

export default createNewTables;