-- Migration: Update subscription schema
-- This migration creates a new subscriptions table and updates the users table
-- Compatible with Neon PostgreSQL

BEGIN;

-- Step 1: Create the new subscriptions table
CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "canceled_reason" TEXT,
    "total_billing_cycles" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add new columns to users table
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "current_subscription_id" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "model_preference" TEXT DEFAULT 'gemini-flash';

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "public"."subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "public"."subscriptions"("status");
CREATE INDEX IF NOT EXISTS "users_current_subscription_id_idx" ON "public"."users"("current_subscription_id");

-- Step 4: Migrate existing subscription data
-- For each user with existing subscription data, create a subscription record
INSERT INTO "public"."subscriptions" (
    "id",
    "user_id", 
    "tier",
    "status",
    "start_date",
    "end_date",
    "canceled_reason",
    "total_billing_cycles",
    "created_at",
    "updated_at"
)
SELECT 
    gen_random_uuid()::text as id,
    u.id as user_id,
    COALESCE(u.subscription, 'free') as tier,
    CASE 
        WHEN COALESCE(u.subscription, 'free') = 'free' THEN 'active'
        ELSE 'active'
    END as status,
    u.created_at as start_date,
    NULL as end_date,
    NULL as canceled_reason,
    CASE 
        WHEN COALESCE(u.subscription, 'free') = 'free' THEN 0
        ELSE 1
    END as total_billing_cycles,
    u.created_at as created_at,
    u.updated_at as updated_at
FROM "public"."users" u
WHERE u.id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 5: Update users table to reference the new subscription records
UPDATE "public"."users" 
SET "current_subscription_id" = s.id
FROM "public"."subscriptions" s
WHERE "public"."users".id = s.user_id
AND "public"."users"."current_subscription_id" IS NULL;

-- Step 6: Add foreign key constraints
ALTER TABLE "public"."subscriptions" 
ADD CONSTRAINT "subscriptions_user_id_fkey" 
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."users" 
ADD CONSTRAINT "users_current_subscription_id_fkey" 
FOREIGN KEY ("current_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Add check constraints for valid enum values
ALTER TABLE "public"."subscriptions" 
ADD CONSTRAINT "subscriptions_tier_check" 
CHECK ("tier" IN ('free', 'pro', 'pro_plus'));

ALTER TABLE "public"."subscriptions" 
ADD CONSTRAINT "subscriptions_status_check" 
CHECK ("status" IN ('active', 'canceled', 'trial'));

-- Step 8: Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON "public"."subscriptions" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 9: Remove old subscription column (commented out for safety - uncomment after verification)
-- ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "subscription";

-- Step 10: Create unique constraint to ensure one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_active_unique" 
ON "public"."subscriptions"("user_id") 
WHERE "status" = 'active' AND "end_date" IS NULL;

COMMIT;

-- Verification queries (run these after migration to verify data integrity):
-- SELECT COUNT(*) FROM "public"."subscriptions";
-- SELECT COUNT(*) FROM "public"."users" WHERE "current_subscription_id" IS NOT NULL;
-- SELECT u.id, u.email, u.name, u.current_subscription_id, s.tier, s.status 
-- FROM "public"."users" u 
-- LEFT JOIN "public"."subscriptions" s ON u.current_subscription_id = s.id 
-- LIMIT 10;