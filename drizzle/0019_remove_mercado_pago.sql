-- Final Stripe cutover: remove Mercado Pago operational columns.

ALTER TABLE payments
  DROP COLUMN IF EXISTS mp_payment_id,
  DROP COLUMN IF EXISTS mp_preference_id;

ALTER TABLE payment_transactions
  DROP COLUMN IF EXISTS mp_transaction_id,
  DROP COLUMN IF EXISTS mp_operation_id;

ALTER TABLE financial_profiles
  DROP COLUMN IF EXISTS mp_email,
  DROP COLUMN IF EXISTS mp_user_id,
  DROP COLUMN IF EXISTS mp_access_token,
  DROP COLUMN IF EXISTS mp_refresh_token,
  DROP COLUMN IF EXISTS mp_token_expires_at,
  DROP COLUMN IF EXISTS mp_connected_at,
  DROP COLUMN IF EXISTS mp_oauth_state,
  DROP COLUMN IF EXISTS mp_oauth_state_created_at,
  DROP COLUMN IF EXISTS mp_is_verified;

ALTER TABLE student_payment_methods
  DROP COLUMN IF EXISTS mp_email,
  DROP COLUMN IF EXISTS mp_is_verified,
  DROP COLUMN IF EXISTS mp_allow_save_card;

ALTER TABLE saved_cards
  DROP COLUMN IF EXISTS mp_card_token,
  DROP COLUMN IF EXISTS mp_customer_id,
  DROP COLUMN IF EXISTS mp_card_id;
