ALTER TABLE "payments" DROP CONSTRAINT "payments_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "class_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "proposal_id" uuid;