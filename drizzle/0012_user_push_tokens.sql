-- Migration: Create user_push_tokens table for multi-device push support

CREATE TABLE IF NOT EXISTS "user_push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "platform" varchar(20) NOT NULL,
  "device_info" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp DEFAULT now() NOT NULL
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS "idx_user_push_tokens_user_id" ON "user_push_tokens" ("user_id");

-- Unique constraint: same token can only be registered once
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_push_tokens_unique_token" ON "user_push_tokens" ("token");

-- Migrate existing fcm_token data from users table to user_push_tokens
-- Uses ON CONFLICT to skip duplicates (same token registered by different users gets first-wins)
INSERT INTO "user_push_tokens" ("user_id", "token", "platform", "last_used_at")
SELECT DISTINCT ON ("fcm_token") "id", "fcm_token", 'unknown', COALESCE("updated_at", now())
FROM "users"
WHERE "fcm_token" IS NOT NULL AND "fcm_token" != ''
ORDER BY "fcm_token", "updated_at" DESC
ON CONFLICT ("token") DO NOTHING;
