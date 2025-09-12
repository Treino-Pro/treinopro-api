ALTER TABLE "users" ADD COLUMN "cref_uf" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_number" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_validated_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_validated_name" varchar(200);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cref_validated_situation" varchar(100);