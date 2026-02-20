-- Migration: disputa replica, aula 45min, geolocalizacao e codigo 4 digitos
-- Gerado manualmente em 2026-02-20

-- 1. Novos campos em classes
ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "start_confirmation_code_hash" text,
  ADD COLUMN IF NOT EXISTS "start_confirmation_code_expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "start_confirmation_attempts" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minimum_completion_at" timestamp,
  ADD COLUMN IF NOT EXISTS "student_defense_text" text,
  ADD COLUMN IF NOT EXISTS "personal_defense_text" text,
  ADD COLUMN IF NOT EXISTS "student_defense_submitted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "personal_defense_submitted_at" timestamp;

-- 2. Strike de no-show no personal
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "personal_no_show_strikes" integer DEFAULT 0;

-- 3. Enums para presença
DO $$ BEGIN
  CREATE TYPE "presence_role" AS ENUM ('student', 'personal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "capture_source" AS ENUM ('foreground', 'resume', 'background_task');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "app_state_snapshot" AS ENUM ('foreground', 'background', 'resumed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Nova tabela class_presence_snapshots
CREATE TABLE IF NOT EXISTS "class_presence_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "class_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" "presence_role" NOT NULL,
  "latitude" decimal(10, 8) NOT NULL,
  "longitude" decimal(11, 8) NOT NULL,
  "accuracy_meters" decimal(10, 2),
  "captured_at" timestamp NOT NULL,
  "capture_source" "capture_source" NOT NULL,
  "app_state" "app_state_snapshot" NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "class_presence_snapshots_class_id_user_id_unique" UNIQUE ("class_id", "user_id")
);
