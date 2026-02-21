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
-- Para evitar associação arbitrária em duplicados legados, migra apenas tokens com dono único
WITH "tokens_unicos" AS (
  SELECT "fcm_token"
  FROM "users"
  WHERE "fcm_token" IS NOT NULL AND "fcm_token" != ''
  GROUP BY "fcm_token"
  HAVING COUNT(*) = 1
)
INSERT INTO "user_push_tokens" ("user_id", "token", "platform", "last_used_at")
SELECT "u"."id", "u"."fcm_token", 'unknown', COALESCE("u"."updated_at", now())
FROM "users" "u"
INNER JOIN "tokens_unicos" "tu" ON "tu"."fcm_token" = "u"."fcm_token"
ON CONFLICT ("token") DO NOTHING;
