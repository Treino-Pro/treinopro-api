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

-- Tabela de trilha para remediação de tokens legados duplicados
CREATE TABLE IF NOT EXISTS "user_push_tokens_migration_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "user_ids" text NOT NULL,
  "issue_type" varchar(40) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "user_push_tokens_migration_issues"
ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_user_push_tokens_migration_issues_token"
ON "user_push_tokens_migration_issues" ("token");

-- Limpar duplicatas prévias para permitir criação de índice único em bases legadas
WITH "issues_deduplicadas" AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY "token", "issue_type"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS "rn"
  FROM "user_push_tokens_migration_issues"
)
DELETE FROM "user_push_tokens_migration_issues" "issues"
USING "issues_deduplicadas" "dedup"
WHERE "issues".ctid = "dedup".ctid
  AND "dedup"."rn" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_push_tokens_migration_issues_unique"
ON "user_push_tokens_migration_issues" ("token", "issue_type");

-- Registrar tokens duplicados para remediação manual/auditoria
INSERT INTO "user_push_tokens_migration_issues" ("token", "user_ids", "issue_type")
SELECT
  "fcm_token",
  string_agg("id"::text, ',' ORDER BY "updated_at" DESC NULLS LAST),
  'duplicate_legacy_token'
FROM "users"
WHERE "fcm_token" IS NOT NULL AND "fcm_token" != ''
GROUP BY "fcm_token"
HAVING COUNT(*) > 1
ON CONFLICT ("token", "issue_type")
DO UPDATE SET
  "user_ids" = EXCLUDED."user_ids",
  "updated_at" = now();

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
