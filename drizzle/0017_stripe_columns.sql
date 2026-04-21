ALTER TABLE "payments"
  ADD COLUMN "provider" varchar(50),
  ADD COLUMN "stripe_payment_intent_id" varchar(255),
  ADD COLUMN "stripe_charge_id" varchar(255),
  ADD COLUMN "stripe_transfer_group" varchar(255),
  ADD COLUMN "stripe_latest_charge_id" varchar(255),
  ADD COLUMN "stripe_refund_id" varchar(255),
  ADD COLUMN "processing_model" varchar(100);
--> statement-breakpoint
ALTER TABLE "payment_transactions"
  ADD COLUMN "stripe_transfer_id" varchar(255),
  ADD COLUMN "stripe_balance_transaction_id" varchar(255),
  ADD COLUMN "stripe_refund_id" varchar(255),
  ADD COLUMN "stripe_dispute_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "financial_profiles"
  ADD COLUMN "stripe_account_id" varchar(255),
  ADD COLUMN "stripe_account_mode" varchar(100),
  ADD COLUMN "stripe_onboarding_completed" boolean DEFAULT false,
  ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false,
  ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false,
  ADD COLUMN "stripe_details_submitted" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "student_payment_methods"
  ADD COLUMN "stripe_customer_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "saved_cards"
  ADD COLUMN "stripe_payment_method_id" varchar(255);
