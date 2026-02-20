DO $$ BEGIN
 CREATE TYPE "app_state_snapshot" AS ENUM('foreground', 'background', 'resumed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "capture_source" AS ENUM('foreground', 'resume', 'background_task');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "presence_role" AS ENUM('student', 'personal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_presence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "presence_role" NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"accuracy_meters" numeric(10, 2),
	"captured_at" timestamp NOT NULL,
	"capture_source" "capture_source" NOT NULL,
	"app_state" "app_state_snapshot" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "start_confirmation_code_hash" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "start_confirmation_code_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "start_confirmation_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "minimum_completion_at" timestamp;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "student_defense_text" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "personal_defense_text" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "student_defense_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "personal_defense_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personal_no_show_strikes" integer DEFAULT 0;