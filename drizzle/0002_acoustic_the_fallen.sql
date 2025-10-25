CREATE TABLE IF NOT EXISTS "withdrawal_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"withdrawal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"description" text,
	"admin_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "personal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ALTER COLUMN "method" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rating" numeric(3, 2) DEFAULT '5.00';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "total_ratings" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fcm_token" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "target_personal_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_cards" ADD COLUMN "mp_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "saved_cards" ADD COLUMN "mp_card_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_history" ADD CONSTRAINT "withdrawal_history_withdrawal_id_withdrawal_requests_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawal_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_history" ADD CONSTRAINT "withdrawal_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_history" ADD CONSTRAINT "withdrawal_history_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
