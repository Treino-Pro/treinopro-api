DO $$ BEGIN
 CREATE TYPE "document_type" AS ENUM('RG', 'CNH');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "birth_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_type" "document_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_number" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_image_url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_image_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_validated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_minor" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guardian_name" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guardian_email" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guardian_consent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guardian_consent_date" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "privacy_policy_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_date" timestamp;