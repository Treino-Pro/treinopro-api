CREATE TABLE IF NOT EXISTS "live_activity_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "proposal_id" varchar(255),
  "token" text NOT NULL,
  "platform" varchar(20) NOT NULL DEFAULT 'ios',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "live_activity_tokens_user_id_idx" ON "live_activity_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "live_activity_tokens_proposal_id_idx" ON "live_activity_tokens" ("proposal_id");
CREATE UNIQUE INDEX IF NOT EXISTS "live_activity_tokens_token_unique" ON "live_activity_tokens" ("token");
