-- Drop sessions table as we no longer need it with Clerk
DROP TABLE IF EXISTS sessions;

-- Update users table to work with Clerk
ALTER TABLE users DROP COLUMN IF EXISTS password;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create unique index on clerk_user_id for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);

-- Update existing data structure if needed
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;