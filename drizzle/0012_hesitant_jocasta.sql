CREATE TABLE IF NOT EXISTS "user_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) NOT NULL,
	"device_info" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD COLUMN "mp_refresh_token" text;--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD COLUMN "mp_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD COLUMN "mp_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD COLUMN "mp_oauth_state" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_push_tokens" ADD CONSTRAINT "user_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
