-- Enum para status de aprovação profissional do personal trainer
DO $$ BEGIN
  CREATE TYPE "personal_approval_status" AS ENUM('pending_review', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Colunas de aprovação profissional na tabela users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approval_status" "personal_approval_status" NOT NULL DEFAULT 'approved';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "admin_notes" text;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approval_reviewed_at" timestamp;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "approval_reviewed_by" uuid REFERENCES "users"("id");

-- Index para queries de matching de personals elegíveis
CREATE INDEX IF NOT EXISTS "idx_users_type_approval_created"
  ON "users" ("user_type", "approval_status", "created_at" DESC);

-- Backfill: students e admins já existentes ficam como approved (default já garante isso)
-- Backfill: personals já existentes ficam como approved para não bloquear base atual
UPDATE "users"
  SET "approval_status" = 'approved'
  WHERE "user_type" IN ('student', 'admin', 'personal');
