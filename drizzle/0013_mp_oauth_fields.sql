-- Migration: Add OAuth fields to financial_profiles for Mercado Pago OAuth flow
-- Adds refresh token, token expiration, and OAuth state tracking

ALTER TABLE "financial_profiles" ADD COLUMN IF NOT EXISTS "mp_refresh_token" text;
ALTER TABLE "financial_profiles" ADD COLUMN IF NOT EXISTS "mp_token_expires_at" timestamp;
ALTER TABLE "financial_profiles" ADD COLUMN IF NOT EXISTS "mp_connected_at" timestamp;
ALTER TABLE "financial_profiles" ADD COLUMN IF NOT EXISTS "mp_oauth_state" varchar(255);
