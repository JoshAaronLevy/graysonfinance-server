-- Migration to rename 'name' column to 'first_name' in users table
-- This addresses the issue where Clerk user data was not properly mapping to database fields

-- First, rename the column from 'name' to 'first_name'
ALTER TABLE users RENAME COLUMN name TO first_name;

-- Update the column type to be more appropriate for first name storage
-- (keeping VARCHAR(255) but making it clearer this is for first name only)
COMMENT ON COLUMN users.first_name IS 'User first name from Clerk authentication';