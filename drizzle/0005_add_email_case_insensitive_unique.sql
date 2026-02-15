-- Migration: Add case-insensitive unique constraint for email
-- Date: 2026-02-15
-- Description: Implements case-insensitive uniqueness for email field to prevent
-- duplicate emails with different casings (e.g., User@example.com vs user@example.com)

-- Step 1: Drop existing unique constraint on email
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";

-- Step 2: Create unique index on lowercase email
-- This ensures that emails are unique regardless of case
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique" ON "users" (LOWER("email"));

-- Note: The application layer (AuthService) already normalizes emails to lowercase
-- before storing/querying, so this migration primarily serves as a database-level
-- safeguard and allows existing data to remain unchanged while preventing future
-- case-variant duplicates.
