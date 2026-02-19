DO $$ BEGIN
 CREATE TYPE "personal_approval_status" AS ENUM('pending_review', 'approved', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "document_type" ADD VALUE 'CPF';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "used_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" varchar(255) NOT NULL,
	"proposal_id" uuid NOT NULL,
	"personal_id" uuid NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "used_nonces_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "no_show_reason" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "no_show_notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_status" "personal_approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "service_location_lat" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "service_location_lng" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "service_radius_km" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_personal_online" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_used_nonces_nonce" ON "used_nonces" ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_used_nonces_proposal" ON "used_nonces" ("proposal_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_approval_reviewed_by_users_id_fk" FOREIGN KEY ("approval_reviewed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
