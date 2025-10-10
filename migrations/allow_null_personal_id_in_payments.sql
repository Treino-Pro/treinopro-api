-- Migration: Allow NULL personal_id in payments table
-- Date: 2025-10-08
-- Description: Remove NOT NULL constraint from personal_id column to allow proposals without assigned personal trainer

-- Remove NOT NULL constraint from personal_id column
ALTER TABLE payments ALTER COLUMN personal_id DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN payments.personal_id IS 'Personal trainer ID - NULL for proposals pending acceptance, set when personal accepts';
