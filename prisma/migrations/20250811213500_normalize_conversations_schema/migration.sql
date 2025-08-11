-- Add meta field to messages table and change sender to role
-- Also add unique constraint on conversations for (user_id, topic)

-- First, create a new enum for role
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- Add new columns to messages table
ALTER TABLE "messages" ADD COLUMN "role" "MessageRole";
ALTER TABLE "messages" ADD COLUMN "meta" JSONB;

-- Migrate existing data: USER -> user, BOT -> assistant
UPDATE "messages" SET "role" = 'user' WHERE "sender" = 'USER';
UPDATE "messages" SET "role" = 'assistant' WHERE "sender" = 'BOT';

-- Make role column not null
ALTER TABLE "messages" ALTER COLUMN "role" SET NOT NULL;

-- Drop the old sender column and enum
ALTER TABLE "messages" DROP COLUMN "sender";
DROP TYPE "MessageSender";

-- Add unique constraint on conversations for (user_id, chat_type)
-- This ensures only one conversation per user per topic
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_chat_type_key" UNIQUE ("user_id", "chat_type");

-- Add status column to conversations as mentioned in requirements
ALTER TABLE "conversations" ADD COLUMN "status" TEXT DEFAULT 'open';